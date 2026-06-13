"""AI Co-pilot service — Claude tool_use agentic loop with SSE streaming."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, Generator, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.product import Product
from app.models.sales import SalesItem, SalesRecord
from app.services.ai_experts import auto_route_expert, run_expert_query
from app.services.cashflow_service import compute_cashflow_forecast
from app.services.finance_service import finance_service

_MODEL = "claude-opus-4-8"
_MAX_TOKENS = 2048
_MAX_TOOL_ITERATIONS = 6

# ─── Tool definitions ─────────────────────────────────────────────────────────

COPILOT_TOOLS = [
    {
        "name": "query_database",
        "description": (
            "Execute a natural language query against the ERP database. "
            "Returns structured data rows and a plain-text answer. "
            "Use for any specific data request: top products, revenue this month, "
            "overdue orders, customer analytics, stock below threshold, etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "Business question in natural language, e.g. 'top 5 products by revenue last 30 days'",
                }
            },
            "required": ["question"],
        },
    },
    {
        "name": "get_finance_summary",
        "description": (
            "Get a P&L / financial summary: total revenue, COGS, gross profit, "
            "gross margin %, total expenses, net profit, and top 5 products/customers "
            "for a date range."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "Number of past days to summarize (default 30)",
                }
            },
        },
    },
    {
        "name": "get_stock_status",
        "description": (
            "Get current inventory status: total active SKUs, low-stock items (at or below "
            "reorder level), out-of-stock items, total estimated stock value, "
            "and the worst offenders needing immediate attention."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "critical_only": {
                    "type": "boolean",
                    "description": "If true, only return items at or below reorder level",
                }
            },
        },
    },
    {
        "name": "get_cashflow_projection",
        "description": (
            "Get a 14-day cash flow projection: current balance, average daily "
            "income/expense, net daily cash flow, and first warning/danger dates "
            "if the trajectory is negative."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_reorder_recommendations",
        "description": (
            "Get AI-driven purchasing/reorder recommendations. Computes sales velocity "
            "(avg daily units sold) for each product over the last 30 days, calculates "
            "days of stock remaining, identifies products below reorder level, and "
            "suggests order quantities with urgency ranking."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "top_n": {
                    "type": "integer",
                    "description": "Max products to return in recommendations (default 15)",
                }
            },
        },
    },
]

# ─── Tool context ─────────────────────────────────────────────────────────────

@dataclass
class ToolContext:
    db: Session
    tenant_id: int
    user_role: str
    tenant_name: str


# ─── Tool executor functions ──────────────────────────────────────────────────

def _json_default(o: Any) -> Any:
    if isinstance(o, (date,)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    return str(o)


def _tool_query_database(inputs: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    question = inputs.get("question", "")
    expert_key = auto_route_expert(question)
    result = run_expert_query(
        ctx.db,
        user_text=question,
        expert_key=expert_key,
        tenant_id=ctx.tenant_id,
        user_role=ctx.user_role,
        tenant_name=ctx.tenant_name,
    )
    return {
        "question": question,
        "answer": result.answer,
        "rows": result.data[:30],
        "columns": result.columns,
        "row_count": len(result.data),
        "sql": result.sql,
    }


def _tool_finance_summary(inputs: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    days = max(1, int(inputs.get("days") or 30))
    today = date.today()
    start = today - timedelta(days=days)

    summary = finance_service.summary(ctx.db, ctx.tenant_id, start_date=start, end_date=today)
    top_products = finance_service.top_products(ctx.db, ctx.tenant_id, start_date=start, end_date=today, limit=5)
    top_customers = finance_service.top_customers(ctx.db, ctx.tenant_id, start_date=start, end_date=today, limit=5)

    revenue = float(summary.get("revenue") or 0)
    cogs = float(summary.get("cogs") or 0)
    gross_profit = float(summary.get("gross_profit") or 0)
    expenses = float(summary.get("total_expenses") or 0)

    return {
        "period": f"Last {days} days ({start.isoformat()} → {today.isoformat()})",
        "revenue": round(revenue, 2),
        "cogs": round(cogs, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_margin_pct": round(float(summary.get("margin_pct") or 0), 2),
        "expenses": round(expenses, 2),
        "net_profit": round(gross_profit - expenses, 2),
        "order_count": int(summary.get("order_count") or 0),
        "customer_count": int(summary.get("customer_count") or 0),
        "avg_order_value": round(float(summary.get("avg_order_value") or 0), 2),
        "top_products": top_products[:5],
        "top_customers": top_customers[:5],
    }


def _tool_stock_status(inputs: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    critical_only = bool(inputs.get("critical_only", False))

    stmt = select(Product).where(Product.tenant_id == ctx.tenant_id, Product.deleted_at.is_(None))
    products = ctx.db.scalars(stmt).all()

    total_skus = len(products)
    low_stock: List[Dict[str, Any]] = []
    out_of_stock: List[Dict[str, Any]] = []
    total_stock_value = 0.0

    for p in products:
        stock = int(p.stock_quantity or 0)
        reorder = int(p.reorder_level or 0)
        cost = float(p.cost_price or p.unit_price or 0)
        total_stock_value += stock * cost

        if stock == 0:
            out_of_stock.append({
                "id": p.id, "sku": p.sku, "name": p.name,
                "stock": 0, "reorder_level": reorder,
            })
        elif reorder > 0 and stock <= reorder:
            low_stock.append({
                "id": p.id, "sku": p.sku, "name": p.name,
                "stock": stock, "reorder_level": reorder,
                "deficit": reorder - stock,
            })

    low_stock.sort(key=lambda x: x["stock"] - x["reorder_level"])

    result: Dict[str, Any] = {
        "total_skus": total_skus,
        "total_stock_value": round(total_stock_value, 2),
        "low_stock_count": len(low_stock),
        "out_of_stock_count": len(out_of_stock),
    }

    if critical_only:
        result["critical_items"] = (out_of_stock + low_stock)[:20]
    else:
        result["low_stock_items"] = low_stock[:15]
        result["out_of_stock_items"] = out_of_stock[:10]

    return result


def _tool_cashflow(inputs: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    r = compute_cashflow_forecast(ctx.db, tenant_id=ctx.tenant_id)
    return {
        "current_balance": round(r.current_balance, 2),
        "daily_income_avg": round(r.daily_income_avg, 2),
        "daily_expense_avg": round(r.daily_expense_avg, 2),
        "net_daily": round(r.net_daily, 2),
        "status": r.status,
        "alert_message": r.alert_message,
        "first_warning_date": r.first_warning_date,
        "first_danger_date": r.first_danger_date,
        "has_cashbook_data": r.has_cashbook_data,
        "projection_14d": [
            {"date": d.date, "balance": round(d.balance, 2), "status": d.status}
            for d in r.projection[:7]
        ],
    }


def _tool_reorder_recommendations(inputs: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    top_n = max(1, int(inputs.get("top_n") or 15))
    today = date.today()
    start = today - timedelta(days=30)

    sales_stmt = (
        select(
            SalesItem.product_id,
            func.sum(SalesItem.quantity).label("total_qty"),
        )
        .join(SalesRecord, SalesRecord.id == SalesItem.sales_record_id)
        .where(SalesRecord.tenant_id == ctx.tenant_id)
        .where(SalesRecord.sale_date >= start)
        .where(SalesRecord.sale_date <= today)
        .group_by(SalesItem.product_id)
    )
    sales_by_product: Dict[int, float] = {}
    for row in ctx.db.execute(sales_stmt):
        sales_by_product[row.product_id] = float(row.total_qty)

    products = ctx.db.scalars(
        select(Product).where(
            Product.tenant_id == ctx.tenant_id,
            Product.deleted_at.is_(None),
        )
    ).all()

    recommendations = []
    for p in products:
        stock = int(p.stock_quantity or 0)
        reorder = int(p.reorder_level or 0)
        sold_30d = sales_by_product.get(p.id, 0)
        daily_sales = sold_30d / 30
        days_remaining = round(stock / daily_sales, 1) if daily_sales > 0 else None
        deficit = max(0, reorder - stock) if reorder > 0 else 0

        needs_attention = (
            deficit > 0
            or stock == 0
            or (days_remaining is not None and days_remaining < 7)
        )
        if not needs_attention:
            continue

        urgency = "critical" if (deficit > 0 or stock == 0) else "warning"
        # Suggest order: cover 30 days of sales, at least the deficit
        suggested_qty = max(deficit, int(daily_sales * 30) - stock) if daily_sales > 0 else deficit

        recommendations.append({
            "product_id": p.id,
            "sku": p.sku,
            "name": p.name,
            "current_stock": stock,
            "reorder_level": reorder,
            "daily_sales_avg": round(daily_sales, 2),
            "days_remaining": days_remaining,
            "deficit": deficit,
            "suggested_order_qty": max(0, suggested_qty),
            "urgency": urgency,
        })

    recommendations.sort(
        key=lambda r: (
            r["urgency"] != "critical",
            r.get("days_remaining") if r.get("days_remaining") is not None else 99,
        )
    )

    return {
        "recommendations": recommendations[:top_n],
        "total_needing_attention": len(recommendations),
        "critical_count": sum(1 for r in recommendations if r["urgency"] == "critical"),
        "warning_count": sum(1 for r in recommendations if r["urgency"] == "warning"),
        "analysis_period_days": 30,
    }


def _execute_tool(name: str, inputs: Dict[str, Any], ctx: ToolContext) -> str:
    """Dispatch tool call and return JSON string result."""
    try:
        if name == "query_database":
            result = _tool_query_database(inputs, ctx)
        elif name == "get_finance_summary":
            result = _tool_finance_summary(inputs, ctx)
        elif name == "get_stock_status":
            result = _tool_stock_status(inputs, ctx)
        elif name == "get_cashflow_projection":
            result = _tool_cashflow(inputs, ctx)
        elif name == "get_reorder_recommendations":
            result = _tool_reorder_recommendations(inputs, ctx)
        else:
            result = {"error": f"Unknown tool: {name}"}
    except Exception as exc:
        result = {"error": str(exc)}
    return json.dumps(result, default=_json_default, ensure_ascii=False)


# ─── Tool labels / previews ───────────────────────────────────────────────────

_TOOL_LABELS: Dict[str, str] = {
    "query_database": "database",
    "get_finance_summary": "financial data",
    "get_stock_status": "inventory",
    "get_cashflow_projection": "cash flow",
    "get_reorder_recommendations": "purchasing data",
}


def _tool_label(name: str) -> str:
    return _TOOL_LABELS.get(name, name)


def _make_preview(name: str, data: Any) -> str:
    """Short human-readable preview of tool result."""
    if not isinstance(data, dict):
        return "Data retrieved."
    if name == "query_database":
        rows = data.get("row_count", 0)
        return f"{rows} row(s) found."
    if name == "get_finance_summary":
        rev = data.get("revenue", 0)
        return f"Revenue: {rev:,.0f} — {data.get('order_count', 0)} orders."
    if name == "get_stock_status":
        return f"{data.get('total_skus', 0)} SKUs, {data.get('low_stock_count', 0)} low-stock."
    if name == "get_cashflow_projection":
        return f"Balance: {data.get('current_balance', 0):,.0f} — Status: {data.get('status', '?')}."
    if name == "get_reorder_recommendations":
        return f"{data.get('total_needing_attention', 0)} products need attention."
    return "Data retrieved."


# ─── System prompt ────────────────────────────────────────────────────────────

def _build_system_prompt(ctx: ToolContext, page_context: str) -> str:
    role_label = {
        "admin": "Platform Administrator (full access to all companies)",
        "manager": f"Business Manager at {ctx.tenant_name or 'this company'}",
    }.get(ctx.user_role, "Staff member")

    page_hint = {
        "stock": "The user is on the Stock page — proactively check inventory status and reorder needs.",
        "orders": "The user is on the Orders page — proactively check reorder recommendations.",
        "finance": "The user is on the Finance page — proactively check cashflow and financial summary.",
        "sales": "The user is on the Sales page — proactively query recent sales data.",
        "dashboard": "The user is on the Dashboard — give a full business health overview.",
    }.get((page_context or "").lower().split()[0] if page_context else "", "")

    return f"""You are Future ERP AI Co-pilot — an intelligent business assistant with LIVE access to company data via tools.

Context:
- User role: {role_label}
- Current page: {page_context or "ERP dashboard"}
- Today: {date.today().isoformat()}
{f"- Page hint: {page_hint}" if page_hint else ""}

CRITICAL RULES — follow exactly:
1. ALWAYS call a tool before answering any business question. Never guess or make up numbers.
2. For vague questions ("yes", "ok", "show me", "go ahead"), use the page context to decide which tool is most relevant and call it immediately.
3. After getting tool results, give a concise (3-5 sentence) actionable business insight with EXACT numbers.
4. If asked for "suggestions" or "recommendations" on the stock/orders page: call get_reorder_recommendations AND get_stock_status.
5. If asked for "overview" or "summary": call get_finance_summary AND get_stock_status.
6. Always respond in English. Be direct and data-driven.
7. Never ask clarifying questions without first calling a tool — show data, then ask if they want more detail.

Available tools: query_database, get_finance_summary, get_stock_status, get_cashflow_projection, get_reorder_recommendations."""


# ─── SSE helpers ─────────────────────────────────────────────────────────────

def _sse(obj: Dict[str, Any]) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False, default=str)}\n\n"


# ─── Main streaming function ──────────────────────────────────────────────────

def _run_nlp_fallback(
    user_text: str,
    ctx: ToolContext,
) -> Generator[str, None, None]:
    """Fallback to existing NLP expert system when Anthropic key is absent."""
    yield _sse({"type": "status", "msg": "Analyzing your question…"})
    try:
        expert_key = auto_route_expert(user_text)
        yield _sse({"type": "status", "msg": "Running database query…"})
        result = run_expert_query(
            ctx.db,
            user_text=user_text,
            expert_key=expert_key,
            tenant_id=ctx.tenant_id,
            user_role=ctx.user_role,
            tenant_name=ctx.tenant_name,
        )
        full_text = result.answer or "No results found."
        chunk_size = 60
        for i in range(0, len(full_text), chunk_size):
            yield _sse({"type": "token", "text": full_text[i : i + chunk_size]})
        yield _sse({
            "type": "done",
            "data": {"rows": result.data[:20], "columns": result.columns},
        })
    except Exception as exc:
        yield _sse({"type": "error", "msg": f"Query failed: {exc}"})


def _json_schema_to_gemini(schema_dict: Dict[str, Any]) -> Any:
    """Convert JSON Schema dict to google.genai types.Schema."""
    from google.genai import types as gtypes
    type_map = {
        "string": gtypes.Type.STRING,
        "integer": gtypes.Type.INTEGER,
        "number": gtypes.Type.NUMBER,
        "boolean": gtypes.Type.BOOLEAN,
        "array": gtypes.Type.ARRAY,
        "object": gtypes.Type.OBJECT,
    }
    gemini_type = type_map.get(schema_dict.get("type", "string"), gtypes.Type.STRING)
    props = {
        k: _json_schema_to_gemini(v)
        for k, v in schema_dict.get("properties", {}).items()
    }
    return gtypes.Schema(
        type=gemini_type,
        description=schema_dict.get("description", ""),
        properties=props or None,
        required=schema_dict.get("required") or None,
    )


def _run_gemini_copilot_stream(
    user_text: str,
    ctx: ToolContext,
    page_context: str = "",
    history: Optional[List[Dict[str, str]]] = None,
) -> Generator[str, None, None]:
    """Gemini function-calling agentic loop with SSE streaming."""
    from google import genai
    from google.genai import types as gtypes

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    fn_declarations = [
        gtypes.FunctionDeclaration(
            name=tool["name"],
            description=tool["description"],
            parameters=_json_schema_to_gemini(tool["input_schema"]),
        )
        for tool in COPILOT_TOOLS
    ]
    gemini_tools = gtypes.Tool(function_declarations=fn_declarations)
    system_prompt = _build_system_prompt(ctx, page_context)

    config = gtypes.GenerateContentConfig(
        tools=[gemini_tools],
        system_instruction=system_prompt,
    )

    _primary = settings.GEMINI_MODEL or "gemini-2.5-flash-lite"
    _GEMINI_MODELS = list(dict.fromkeys([
        _primary,
        "gemini-2.5-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
    ]))

    # Build contents with conversation history
    contents: List[Any] = []
    for msg in (history or [])[-10:]:
        role = "user" if msg.get("role") == "user" else "model"
        text = msg.get("text", "")
        if text:
            contents.append(gtypes.Content(role=role, parts=[gtypes.Part.from_text(text=text)]))
    contents.append(gtypes.Content(role="user", parts=[gtypes.Part.from_text(text=user_text)]))

    accumulated_data: Dict[str, Any] = {}

    yield _sse({"type": "status", "msg": "AI Co-pilot is thinking…"})

    for _iteration in range(_MAX_TOOL_ITERATIONS):
        response = None
        last_exc: Exception | None = None
        for model_name in _GEMINI_MODELS:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=config,
                )
                break
            except Exception as exc:
                last_exc = exc
                continue
        if response is None:
            err_str = str(last_exc)
            if "429" in err_str or "quota" in err_str.lower() or "rate" in err_str.lower():
                user_msg = "AI is temporarily rate-limited. Please try again in a few seconds."
            elif "404" in err_str or "not found" in err_str.lower():
                user_msg = "AI model unavailable. Please contact support."
            else:
                user_msg = f"AI service error: {err_str[:200]}"
            yield _sse({"type": "error", "msg": user_msg})
            return

        candidates = response.candidates or []
        if not candidates:
            yield _sse({"type": "done", "data": accumulated_data})
            return

        candidate = candidates[0]
        content = candidate.content
        if content is None:
            yield _sse({"type": "done", "data": accumulated_data})
            return

        parts = list(content.parts or [])
        contents.append(gtypes.Content(role="model", parts=parts))

        has_tool_calls = any(
            hasattr(p, "function_call") and p.function_call
            for p in parts
        )

        if not has_tool_calls:
            full_text = "".join(
                p.text for p in parts if hasattr(p, "text") and p.text
            )
            if full_text:
                chunk_size = 80
                for i in range(0, len(full_text), chunk_size):
                    yield _sse({"type": "token", "text": full_text[i : i + chunk_size]})
            yield _sse({"type": "done", "data": accumulated_data})
            return

        fn_response_parts = []
        for part in parts:
            if not (hasattr(part, "function_call") and part.function_call):
                continue

            fn_name: str = part.function_call.name or ""
            fn_args: Dict[str, Any] = dict(part.function_call.args or {})

            if not fn_name:
                continue

            yield _sse({"type": "tool_call", "tool": fn_name, "msg": f"Querying {_tool_label(fn_name)}…"})

            result_str = _execute_tool(fn_name, fn_args, ctx)
            result_data = json.loads(result_str)
            accumulated_data[fn_name] = result_data
            preview = _make_preview(fn_name, result_data)

            yield _sse({"type": "tool_result", "tool": fn_name, "preview": preview})

            fn_response_parts.append(
                gtypes.Part.from_function_response(
                    name=fn_name,
                    response={"result": result_str},
                )
            )

        contents.append(gtypes.Content(role="user", parts=fn_response_parts))
        yield _sse({"type": "status", "msg": "Generating analysis…"})

    yield _sse({"type": "done", "data": accumulated_data})


def run_copilot_stream(
    user_text: str,
    ctx: ToolContext,
    page_context: str = "",
    history: Optional[List[Dict[str, str]]] = None,
) -> Generator[str, None, None]:
    """Yield SSE-formatted strings for the co-pilot response.

    Priority: Gemini (function-calling loop) > Anthropic (tool_use loop) > NLP fallback.
    """
    if settings.GEMINI_API_KEY:
        yield from _run_gemini_copilot_stream(user_text, ctx, page_context, history)
        return

    if not settings.ANTHROPIC_API_KEY:
        yield from _run_nlp_fallback(user_text, ctx)
        return

    import anthropic  # imported here to keep startup fast if key is absent

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    system_prompt = _build_system_prompt(ctx, page_context)
    messages: List[Dict[str, Any]] = [{"role": "user", "content": user_text}]

    yield _sse({"type": "status", "msg": "AI Co-pilot is thinking…"})

    accumulated_data: Dict[str, Any] = {}

    for iteration in range(_MAX_TOOL_ITERATIONS):
        try:
            response = client.messages.create(
                model=_MODEL,
                max_tokens=_MAX_TOKENS,
                system=system_prompt,
                tools=COPILOT_TOOLS,  # type: ignore[arg-type]
                messages=messages,  # type: ignore[arg-type]
            )
        except Exception as exc:
            yield _sse({"type": "error", "msg": f"AI model error: {exc}"})
            return

        # Add assistant turn to conversation
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            # Stream final text response
            text_parts = [
                block.text
                for block in response.content
                if hasattr(block, "text") and block.text
            ]
            full_text = "".join(text_parts)
            if full_text:
                # Chunk text for a streaming feel
                chunk_size = 60
                for i in range(0, len(full_text), chunk_size):
                    yield _sse({"type": "token", "text": full_text[i : i + chunk_size]})
            yield _sse({"type": "done", "data": accumulated_data})
            return

        if response.stop_reason == "tool_use":
            tool_results = []

            for block in response.content:
                if not hasattr(block, "type") or block.type != "tool_use":
                    continue

                tool_name = block.name
                tool_input = block.input
                tool_id = block.id

                yield _sse({
                    "type": "tool_call",
                    "tool": tool_name,
                    "msg": f"Querying {_tool_label(tool_name)}…",
                })

                result_str = _execute_tool(tool_name, tool_input, ctx)
                result_data = json.loads(result_str)
                accumulated_data[tool_name] = result_data
                preview = _make_preview(tool_name, result_data)

                yield _sse({
                    "type": "tool_result",
                    "tool": tool_name,
                    "preview": preview,
                })

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": result_str,
                })

            messages.append({"role": "user", "content": tool_results})
            yield _sse({"type": "status", "msg": "Generating analysis…"})
            continue

        # Unexpected stop reason — bail out
        break

    # Fallback if loop exhausted
    yield _sse({"type": "done", "data": accumulated_data})
