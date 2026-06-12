from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Generator, List, Optional, Tuple

import sqlglot
import structlog
from google import genai
from openai import OpenAI
from sqlalchemy import text
from sqlalchemy.engine import Result
from sqlalchemy.orm import Session

import app.models  # noqa: F401 — ensure all models are registered in Base.metadata
from app.core.config import settings
from app.core.module_config import ModuleKey, allowed_tables_for_modules
from app.models.base import Base
from app.services._schema_doc import build_nlp_schema_doc, nlp_table_whitelist

logger = structlog.get_logger(__name__)

NLP_FRIENDLY_DB_FAILURE = (
    "Sorry, I couldn't retrieve this from the database. Could you rephrase your question?"
)

# Varsayılan tablo whitelist (geriye uyumluluk için korunur)
ALLOWED_TABLES = nlp_table_whitelist(include_admin=False)

# Admin: tüm platform tablolarına erişim (cross-tenant)
_ADMIN_ALL_TABLES: set[str] = nlp_table_whitelist(include_admin=True)

# 4B-4: AI yanıt dili talimatı (tenant.language'a göre)
def _lang_directive(language: str) -> str:
    if (language or "en").lower().startswith("tr"):
        return "Türkçe yanıt ver; özlü, veriye dayalı ve iş odaklı ol."
    return "Respond in English; be concise, data-driven and business-focused."


# Role bazında erişilebilir tablolar (module_config'den bağımsız ek kısıtlar)
_ROLE_TABLE_RESTRICTIONS: dict[str, set[str]] = {
    "admin": set(),   # Kısıt yok — tüm tablolara erişim
    "manager": set(), # Kısıt yok — tüm tablolara erişim
    "employee": {     # Sadece kendi işiyle ilgili tablolar (tüm tenant verisine değil)
        "products",
        "sales_records",
        "sales_items",
        "stock_movements",
    },
}


def _build_allowed_tables(
    user_role: str,
    active_modules: list[str] | None = None,
) -> set[str]:
    """Kullanıcı rolü ve aktif modüllere göre izin verilen tablo kümesini döner."""
    # Admin tüm platform tablolarına erişir (cross-tenant)
    if user_role in ("admin", "platform_admin"):
        return _ADMIN_ALL_TABLES.copy()

    if active_modules:
        module_tables = set(allowed_tables_for_modules(active_modules))
    else:
        module_tables = ALLOWED_TABLES.copy()

    role_restriction = _ROLE_TABLE_RESTRICTIONS.get(user_role)
    if role_restriction:
        # Employee: sadece role_restriction içindeki tablolar
        return module_tables & role_restriction
    # Manager: modüle göre tüm tablolar
    return module_tables


_MODULE_LABELS: dict[str, str] = {
    ModuleKey.SALES: "Satış Yönetimi",
    ModuleKey.INVENTORY: "Stok Takibi",
    ModuleKey.FINANCE: "Finans",
    ModuleKey.CRM: "Müşteri Yönetimi",
    ModuleKey.SUPPLIERS: "Tedarikçi",
    ModuleKey.PURCHASING: "Satınalma",
    ModuleKey.HR: "İnsan Kaynakları",
    ModuleKey.AI: "AI Analiz",
}


def _role_context_for_prompt(
    user_role: str,
    active_modules: list[str] | None,
    tenant_name: str = "",
) -> str:
    company = f" {tenant_name}" if tenant_name else ""

    if user_role in ("admin", "platform_admin"):
        return (
            f"ROLE: You are the PLATFORM ADMIN assistant (super admin){company}.\n"
            "- You have full access to ALL companies' data (products, sales, stock, finance, customers, staff).\n"
            "- You can perform cross-tenant comparisons, platform-wide statistics, and company-level analysis.\n"
            "- Use the `tenants` table to list companies and `users` for user data.\n"
            "- tenant_id filter is NOT required in admin queries — query all or specific companies freely.\n"
        )

    if user_role == "manager":
        if active_modules:
            active_labels = [_MODULE_LABELS.get(m, m) for m in active_modules]
            modules_note = f"\n- Active ERP modules: {', '.join(active_labels)}"
        else:
            modules_note = ""
        return (
            f"ROLE: You are the STRATEGIC BUSINESS ASSISTANT for{company}.{modules_note}\n"
            "- You have full access to this company's data (sales, stock, finance, customers, suppliers).\n"
            "- Provide deep analysis on revenue forecasting, inventory optimisation, customer analytics, and profitability.\n"
            "- You can ONLY see this company's data; never reveal data from other companies.\n"
        )

    # Employee
    allowed_ops = []
    if active_modules:
        if ModuleKey.SALES in active_modules:
            allowed_ops.append("sales records")
        if ModuleKey.INVENTORY in active_modules:
            allowed_ops.append("stock status")
        if ModuleKey.CRM in active_modules:
            allowed_ops.append("customer information")
    if not allowed_ops:
        allowed_ops = ["product information", "stock status"]

    return (
        f"ROLE: You are an OPERATIONAL STAFF assistant at{company}.\n"
        f"- You can only help with: {', '.join(allowed_ops)}.\n"
        "- NEVER provide company financials (profit, loss, salary, total revenue).\n"
        "- You do NOT have access to HR or employee records.\n"
        "- If asked about restricted data, reply: 'You don't have access to this information.'\n"
    )


_INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(previous|all)\s+(instructions?|prompts?)|"
    r"system\s*:|<\|im_start\|>|<\|im_end\|>|"
    r"\[INST\]|\[/INST\]|###\s*instruction|"
    r"you\s+are\s+now|forget\s+(your|all)\s+(previous|instructions?))",
    re.IGNORECASE,
)
_MAX_INPUT_CHARS = 500


def _sanitize_user_input(text: str) -> str:
    """Prompt injection kalıplarını kaldır ve uzunluğu sınırla."""
    cleaned = _INJECTION_PATTERNS.sub("", text)
    return cleaned[:_MAX_INPUT_CHARS].strip()


class UnsafeSQL(Exception):
    pass


@dataclass
class NL2SQLResult:
    sql: str
    params: Dict[str, Any]


@dataclass
class NlpAnswer:
    sql: str
    data: List[Dict[str, Any]]
    columns: List[str]
    answer: str
    chart_hint: Optional[Dict[str, Any]] = None


@dataclass
class ChatOnlyReply:
    """LLM yanıtı yalnızca doğal dil; veritabanı sorgusu yok."""

    message: str


def _unified_nlp_system_prompt(
    user_role: str = "manager",
    active_modules: list[str] | None = None,
    tenant_name: str = "",
    expert_addon: str = "",
) -> str:
    allowed = _build_allowed_tables(user_role, active_modules)
    allowed_tables_list = ", ".join(sorted(allowed)) if allowed else "products"
    role_context = _role_context_for_prompt(user_role, active_modules, tenant_name)

    is_admin = user_role == "admin"

    # Admin için cross-tenant schema ve kurallar; diğer roller için tenant-scoped
    if is_admin:
        tenant_filter_rule = (
            "- PLATFORM ADMIN: NO tenant_id filter required — you see ALL companies.\n"
            "- NEVER use ':tid' bind parameter in admin SQL — no bind params for tenant.\n"
            "- NEVER add WHERE tenant_id = :tid or any :param for tenant filtering.\n"
            "- Cross-tenant queries use plain literals or no filter at all."
        )
        admin_examples = """
ADMIN CROSS-TENANT SQL EXAMPLES — copy these patterns exactly:

Q: "Revenue comparison by company" or "company revenues"
SQL: SELECT t.name AS company_name, COALESCE(SUM(sr.total_amount),0) AS total_revenue, COUNT(sr.id) AS order_count FROM tenants t LEFT JOIN sales_records sr ON sr.tenant_id = t.id WHERE t.is_active = 1 GROUP BY t.id, t.name ORDER BY total_revenue DESC

Q: "How many active companies" or "company count"
SQL: SELECT COUNT(*) AS active_company_count FROM tenants WHERE is_active = 1

Q: "User count by company"
SQL: SELECT t.name AS company_name, COUNT(u.id) AS user_count FROM tenants t LEFT JOIN users u ON u.tenant_id = t.id WHERE t.is_active = 1 GROUP BY t.id, t.name ORDER BY user_count DESC

Q: "Platform total revenue" or "all companies revenue"
SQL: SELECT COALESCE(SUM(total_amount),0) AS platform_total_revenue FROM sales_records

Q: "Stock comparison by company" or "product count per company"
SQL: SELECT t.name AS company_name, COUNT(p.id) AS product_count, COALESCE(SUM(p.stock_quantity),0) AS total_stock FROM tenants t LEFT JOIN products p ON p.tenant_id = t.id WHERE t.is_active = 1 GROUP BY t.id, t.name ORDER BY total_stock DESC

Q: "Sales by sector"
SQL: SELECT t.sector AS sector, COALESCE(SUM(sr.total_amount),0) AS total_revenue FROM tenants t LEFT JOIN sales_records sr ON sr.tenant_id = t.id WHERE t.is_active = 1 GROUP BY t.sector ORDER BY total_revenue DESC

Q: "Top companies by revenue" or "most successful company"
SQL: SELECT t.name AS company_name, COALESCE(SUM(sr.total_amount),0) AS total_revenue FROM tenants t LEFT JOIN sales_records sr ON sr.tenant_id = t.id WHERE t.is_active = 1 GROUP BY t.id, t.name ORDER BY total_revenue DESC LIMIT 5
"""
    else:
        tenant_filter_rule = "- Every referenced table MUST be filtered with tenant_id = :tid (bind :tid)"
        admin_examples = ""

    schema_doc = build_nlp_schema_doc(Base.metadata, include_admin=is_admin)
    expert_section = f"\n{expert_addon.strip()}\n" if expert_addon.strip() else ""

    module_knowledge = """
FUTURE ERP MODULE CATALOGUE — use this to answer any setup, onboarding, or recommendation questions:
  • sales       – Sales orders, invoices, revenue tracking. Good for: any business that sells.
  • inventory   – Product catalogue, stock levels, low-stock alerts. Good for: businesses with physical products.
  • finance     – Income/expense ledger, accounts, profit & loss. Good for: ALL businesses.
  • cashbook    – Daily cash flow, POS / cash register management. Good for: retail, restaurant, hospitality.
  • crm         – Customer profiles, segmentation, loyalty scoring. Good for: service, B2B, retail.
  • suppliers   – Supplier contacts, performance tracking. Good for: any business that buys from suppliers.
  • purchasing  – Purchase orders, procurement workflow. Good for: retail, manufacturing, construction.
  • hr          – Employee records, departments, HR management. Good for: businesses with staff.
  • ai          – AI analytics, demand forecasting, anomaly detection, insights. RECOMMENDED for all.

SECTOR → RECOMMENDED MODULES:
  Restaurant / Café / Bakery → sales, inventory, finance, cashbook, suppliers, ai
  Retail / Market / Grocery / E-commerce → sales, inventory, finance, cashbook, crm, suppliers, purchasing, ai
  Service (consulting, beauty salon, repair, cleaning) → finance, crm, hr, cashbook, ai
  Manufacturing / Workshop / Factory → inventory, purchasing, finance, suppliers, hr, ai
  Construction / Contractor / Renovation → purchasing, finance, hr, suppliers, ai
  General / Other → all modules available; pick based on operations described

MODULE RECOMMENDATION RULE: If the user asks which modules to choose, describes their business type, or asks about setting up the ERP, you MUST give a SPECIFIC, HELPFUL recommendation listing exact module names with a one-line reason for each. Never give a generic greeting for these questions. Always use reply_type "chat".
"""

    return f"""LANGUAGE RULE — NON-NEGOTIABLE: You MUST respond in English at all times, no matter what language the user writes in. Never respond in Turkish or any other language. This rule overrides everything else.

You are Future ERP AI, an intelligent ERP business assistant.

{role_context}{expert_section}
{module_knowledge}
CRITICAL: If the user is ONLY greeting or chatting (e.g. "hi", "hello", "thanks", "what can you do?"),
you MUST NOT produce SQL. Reply in English in a warm, concise, friendly way (reply_type "chat").

ONLY when the user clearly asks for specific data or a report (e.g. "top 5 products by revenue", "sales last 30 days")
should you use reply_type "sql" with one safe SELECT.

Use reply_type "chat" (no SQL) when:
- Greetings, thanks, small talk ("hi", "hello", "thanks", "how are you").
- Conceptual or general questions that do NOT require querying tables.
- Module recommendation / business setup / onboarding questions.

Use reply_type "sql" ONLY when the user clearly wants factual rows or aggregates from the database:
lists, counts, sums, rankings, "top N", filters by date/SKU/customer, stock below threshold, etc.

Output EXACTLY one JSON object (no markdown fences, no prose outside JSON):

Chat-only:
{{ "reply_type": "chat", "message": "<answer in English, clear and concise>" }}

Database query:
{{ "reply_type": "sql", "sql": "<single SELECT>", "params": {{ }} }}

ALLOWED TABLES for this user: {allowed_tables_list}
DO NOT reference any table not in this list.

Schema (auto-generated from SQLAlchemy metadata):

{schema_doc}

SQL rules (only when reply_type is "sql"):
- sql MUST be a single SELECT (no INSERT/UPDATE/DELETE/DDL, no multiple statements)
- Use ONLY tables from the ALLOWED TABLES list above
- Never use SELECT * (explicit columns)
{tenant_filter_rule}
- Named parameters :limit, :start_date, :end_date, :product_id as needed
- Default LIMIT 5 when user asks "top" without N
- Use English-friendly column aliases (product_name, total_revenue, stock, company_name)
{admin_examples}"""


def _summary_prompt(user_text: str, sql: str, data: List[Dict[str, Any]], language: str = "tr") -> str:
    trimmed = data[:20]
    lang_line = (
        "Türkçe, kısa ve akıcı bir cevap üret.\n\n"
        if (language or "en").lower().startswith("tr")
        else "Generate the answer in English, concise and fluent.\n\n"
    )
    return (
        "Sen bir ERP asistanısın. Aşağıdaki kullanıcı sorusuna, sağlanan SQL sonuç verisine dayanarak "
        + lang_line
        + "Kurallar:\n"
        "- Yanıt MUTLAKA geçerli JSON olmalı ve şu alanları içermeli:\n"
        '  { "answer": string, "chart_hint": { "type": "bar"|"line"|"pie"|"none", '
        '"x": string|null, "y": string|null, "title": string } }\n'
        "- 'answer' en fazla 4 cümle; gerekiyorsa rakamları para/adet olarak yorumla "
        "(Türk Lirası için ₺ kullan).\n"
        "- Eğer veri tablosu/satır yoksa bunu nazikçe belirt.\n"
        "- 'chart_hint' en uygun grafik önerisidir. İki kolon varsa kategori/metrik çifti "
        'bar/pie verir. Zaman kolonu (date/month) varsa "line". Uygun değilse "none".\n'
        "- Asla SQL'i tekrarlama, sonuçları tablo olarak tekrar dökme.\n\n"
        f"Kullanıcı sorusu:\n{user_text}\n\n"
        f"Üretilen SQL:\n{sql}\n\n"
        f"Sonuç verisi (ilk {len(trimmed)} satır):\n{json.dumps(trimmed, default=_json_default, ensure_ascii=False)}"
    )


def _json_default(o: Any) -> Any:
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    return str(o)


def _openai_client() -> OpenAI:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set in environment (.env).")
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def _gemini_client() -> genai.Client:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set in environment (.env).")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def _generate_content_stream(
    system_prompt: str, user_prompt: Optional[str] = None
) -> Generator[str, None, None]:
    """Yield text tokens as they arrive from the LLM."""
    if settings.OPENAI_API_KEY:
        client = _openai_client()
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
        if user_prompt is not None:
            messages.append({"role": "user", "content": user_prompt})
        stream = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,  # type: ignore[arg-type]
            temperature=0,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                yield delta
        return

    if not settings.GEMINI_API_KEY:
        raise RuntimeError("Set OPENAI_API_KEY or GEMINI_API_KEY in .env")

    client = _gemini_client()
    tried = [settings.GEMINI_MODEL] + [m for m in _CANDIDATE_MODELS if m != settings.GEMINI_MODEL]
    parts = [system_prompt] if user_prompt is None else [system_prompt, user_prompt]

    for model_name in tried:
        try:
            for chunk in client.models.generate_content_stream(model=model_name, contents=parts):  # type: ignore[arg-type]
                token = (getattr(chunk, "text", "") or "").strip()
                if token:
                    yield token
            return
        except Exception:
            continue
    raise RuntimeError("Streaming failed for all models")


def _summary_prompt_plain(user_text: str, sql: str, data: List[Dict[str, Any]], language: str) -> str:
    """Plain-text summary prompt (no JSON wrapper) — used for streaming."""
    lang = _lang_directive(language)
    rows = json.dumps(data[:30], ensure_ascii=False, default=str)
    return (
        f"{lang}\n"
        f'You are a business analyst. The user asked: "{user_text}"\n\n'
        f"SQL used:\n{sql}\n\n"
        f"Data ({len(data)} rows total, up to 30 shown):\n{rows}\n\n"
        "Write a concise, data-driven business analysis in plain text "
        "(no JSON, no markdown code blocks). Include exact numbers, percentages, "
        "and trend direction. Keep it to 2-5 sentences."
    )


def summarize_result_stream(
    *, user_text: str, sql: str, data: List[Dict[str, Any]], language: str = "en"
) -> Generator[str, None, None]:
    """Yield summary text tokens for streaming. Falls back to a single chunk on error."""
    if not data:
        q = user_text.lower()
        if any(w in q for w in ("stock", "stok", "inventory", "kritik")):
            yield "No products at critical stock level — all items are above the reorder threshold."
        elif any(w in q for w in ("task", "görev", "overdue")):
            yield "No overdue or pending tasks found — team tasks are up to date."
        elif any(w in q for w in ("sales", "satış", "revenue", "ciro")):
            yield "No sales records found for the selected period. Try expanding the date range."
        else:
            yield "No matching records found. Try adjusting the filters or date range."
        return

    prompt = _summary_prompt_plain(user_text, sql, data, language)
    try:
        yield from _generate_content_stream(prompt)
    except Exception:
        yield _fallback_summary(data)


def _extract_json(text_out: str) -> Dict[str, Any]:
    text_out = text_out.strip()
    m = re.search(r"\{[\s\S]*\}", text_out)
    if not m:
        raise ValueError("Model output did not contain JSON object.")
    return json.loads(m.group(0))


def _sqlglot_dialect() -> str:
    from sqlalchemy.engine import make_url
    drv = make_url(settings.DATABASE_URL).drivername
    if drv.startswith("postgres"):
        return "postgres"
    return "sqlite"


def _validate_sql(
    sql: str,
    allowed_tables: set[str] | None = None,
    cross_tenant: bool = False,
) -> None:
    from sqlglot import expressions as sgexp

    raw = sql.strip()

    # 1. Inline SQL comments rejected before parsing
    if any(c in raw for c in ("--", "/*", "*/")) or "\n#" in ("\n" + raw):
        raise UnsafeSQL("SQL yorum kabul edilmez.")

    # 2. Parse all statements — exactly one expected
    try:
        statements = sqlglot.parse(raw, read=_sqlglot_dialect())
    except Exception as e:  # pragma: no cover
        raise UnsafeSQL(f"SQL parse failed: {e}") from e

    if len(statements) != 1 or statements[0] is None:
        raise UnsafeSQL("Tek bir SELECT bekleniyor.")
    expr = statements[0]

    # 3. Must be a SELECT — rejects INSERT/UPDATE/DELETE/DDL at the top level
    if not isinstance(expr, sgexp.Select):
        raise UnsafeSQL("Yalnızca SELECT sorgularına izin var.")

    # 4. AST-based DDL/DML check — guards against nested mutation nodes
    _FORBIDDEN = (sgexp.Insert, sgexp.Update, sgexp.Delete, sgexp.Drop, sgexp.Create, sgexp.Alter)
    if any(expr.find(node) for node in _FORBIDDEN):
        raise UnsafeSQL("DDL/DML node'u tespit edildi.")

    # 5. Table whitelist — AST-based, not string-match (avoids false positives like 'drop_id' column)
    #    CTEs define virtual table aliases; exclude them so WITH cte AS (...) doesn't get rejected.
    effective_allowed = allowed_tables if allowed_tables is not None else ALLOWED_TABLES
    cte_names = {cte.alias for cte in expr.find_all(sgexp.CTE) if cte.alias}
    seen = {t.name for t in expr.find_all(sgexp.Table)} - cte_names
    unknown = seen - effective_allowed
    if unknown:
        raise UnsafeSQL(f"İzin verilmeyen tablolar: {sorted(unknown)}")

    # 6. Tenant filter required unless cross-tenant admin query
    if not cross_tenant and ":tid" not in raw.lower():
        raise UnsafeSQL("Sorgu kiracı filtresi (:tid) içermiyor.")


_CANDIDATE_MODELS = [
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-pro-latest",
]


def _generate_content(system_prompt: str, user_prompt: Optional[str] = None) -> str:
    """Birden fazla modeli deneyerek metin üretir."""
    if settings.OPENAI_API_KEY:
        client = _openai_client()
        messages = [{"role": "system", "content": system_prompt}]
        if user_prompt is not None:
            messages.append({"role": "user", "content": user_prompt})
        resp = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,  # type: ignore[arg-type]
            temperature=0,
        )
        return resp.choices[0].message.content or ""

    if not settings.GEMINI_API_KEY:
        raise RuntimeError(
            "Set OPENAI_API_KEY or GEMINI_API_KEY in .env to enable NLP assistant."
        )

    client = _gemini_client()
    tried = [settings.GEMINI_MODEL] + [
        m for m in _CANDIDATE_MODELS if m != settings.GEMINI_MODEL
    ]
    last_err: Exception | None = None
    content = ""
    for model_name in tried:
        try:
            parts = (
                [system_prompt] if user_prompt is None else [system_prompt, user_prompt]
            )
            resp = client.models.generate_content(model=model_name, contents=parts)  # type: ignore[arg-type]
            content = (getattr(resp, "text", "") or "").strip()
            if content:
                return content
        except Exception as e:
            last_err = e
            continue
    if not content:
        raise RuntimeError(f"Model generation failed: {last_err}")
    return content


def interpret_nlp_request(
    *,
    user_text: str,
    user_role: str = "manager",
    active_modules: list[str] | None = None,
    tenant_name: str = "",
    expert_addon: str = "",
) -> ChatOnlyReply | NL2SQLResult:
    """LLM çıktısı: doğal dil sohbet veya güvenli SELECT sorgusu."""
    cross_tenant = user_role == "admin"
    safe_text = _sanitize_user_input(user_text)
    allowed = _build_allowed_tables(user_role, active_modules)
    system = _unified_nlp_system_prompt(
        user_role=user_role, active_modules=active_modules,
        tenant_name=tenant_name, expert_addon=expert_addon,
    )
    # Kullanıcı girdisi sistem talimatından net biçimde ayrılır (prompt injection önlemi).
    tagged_input = f"<user_input>{safe_text}</user_input>"
    content = (_generate_content(system, tagged_input) or "").strip()
    if not content:
        raise ValueError("Empty model output.")

    obj: Dict[str, Any] | None = None
    try:
        obj = _extract_json(content)
    except Exception:
        return ChatOnlyReply(message=content[:8000])

    assert obj is not None
    rtype = str(obj.get("reply_type", "")).strip().lower()
    msg = str(obj.get("message", "")).strip()
    sql = str(obj.get("sql", "")).strip()
    params = obj.get("params", {}) or {}
    if not isinstance(params, dict):
        raise ValueError("params must be an object/dict.")

    if rtype == "chat":
        return ChatOnlyReply(message=msg or content[:8000])

    if rtype == "sql":
        if not sql:
            return ChatOnlyReply(
                message=msg
                or "Please clarify your question to query the database (e.g. date range, product or customer name)."
            )
        _validate_sql(sql, allowed_tables=allowed, cross_tenant=cross_tenant)
        return NL2SQLResult(sql=sql, params=params)

    # Eski / belirsiz: yalnızca sql+params veya serbest JSON
    if sql:
        try:
            _validate_sql(sql, allowed_tables=allowed, cross_tenant=cross_tenant)
            return NL2SQLResult(sql=sql, params=params)
        except UnsafeSQL:
            logger.info(
                "nlp_sql_rejected_using_chat_fallback", extra={"preview": sql[:120]}
            )
            return ChatOnlyReply(message=msg or content[:8000])

    if msg:
        return ChatOnlyReply(message=msg)
    return ChatOnlyReply(message=content[:8000])


def execute_safe_sql(
    db: Session,
    *,
    sql: str,
    params: Dict[str, Any],
    tenant_id: int,
    cross_tenant: bool = False,
    allowed_tables: set[str] | None = None,
) -> List[Dict[str, Any]]:
    _validate_sql(sql, allowed_tables=allowed_tables, cross_tenant=cross_tenant)
    merged = {**params} if cross_tenant else {**params, "tid": tenant_id}
    # Safety: if LLM still generated :tid in a cross-tenant query, provide fallback
    if cross_tenant and ":tid" in sql.lower() and "tid" not in merged:
        merged["tid"] = tenant_id
    with db.get_bind().connect() as conn:  # type: ignore[union-attr]
        res: Result = conn.execute(text(sql), merged)
        rows = res.mappings().all()
        return [dict(r) for r in rows]


def summarize_result(
    *, user_text: str, sql: str, data: List[Dict[str, Any]], language: str = "tr"
) -> tuple[str, Optional[Dict[str, Any]]]:
    """Sonuç verisini doğal dil cevap + grafik önerisine dönüştür (tenant diline göre)."""
    if not data:
        # Give a context-aware empty message based on the query topic
        q = user_text.lower()
        if any(w in q for w in ("stock", "stok", "inventory", "critical", "kritik", "tükeniyor")):
            msg = "No products at critical stock level — all items are above the reorder threshold."
        elif any(w in q for w in ("task", "görev", "overdue", "geciken", "gecikmiş")):
            msg = "No overdue or pending tasks — team tasks are up to date."
        elif any(w in q for w in ("sales", "satış", "revenue", "ciro", "order", "sipariş")):
            msg = "No sales records found for the selected period. Try expanding the date range."
        elif any(w in q for w in ("customer", "müşteri", "accounts", "cari")):
            msg = "No matching customers or account records found."
        else:
            msg = "No matching records found. Try adjusting the filters or date range."
        return (msg, {"type": "none", "x": None, "y": None, "title": ""})

    prompt = _summary_prompt(user_text, sql, data, language)
    try:
        content = _generate_content(prompt)
    except Exception:
        return _fallback_summary(data), _fallback_chart_hint(data)

    try:
        obj = _extract_json(content)
        answer = str(obj.get("answer", "")).strip() or _fallback_summary(data)
        hint = obj.get("chart_hint") or _fallback_chart_hint(data)
        return answer, hint
    except Exception:
        return _fallback_summary(data), _fallback_chart_hint(data)


def _fallback_summary(data: List[Dict[str, Any]]) -> str:
    return f"Query returned {len(data)} row(s). Details are listed in the table below."


def _fallback_chart_hint(data: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not data:
        return {"type": "none", "x": None, "y": None, "title": ""}
    cols = list(data[0].keys())
    numeric = [c for c in cols if isinstance(data[0].get(c), (int, float, Decimal))]
    non_numeric = [c for c in cols if c not in numeric]
    if numeric and non_numeric:
        return {"type": "bar", "x": non_numeric[0], "y": numeric[-1], "title": ""}
    return {"type": "none", "x": None, "y": None, "title": ""}


def run_nlp_query(
    db: Session,
    *,
    user_text: str,
    tenant_id: int,
    user_role: str = "manager",
    active_modules: list[str] | None = None,
    tenant_name: str = "",
    expert_addon: str = "",
    language: str = "en",
) -> NlpAnswer:
    try:
        routed = interpret_nlp_request(
            user_text=user_text,
            user_role=user_role,
            active_modules=active_modules,
            tenant_name=tenant_name,
            expert_addon=expert_addon,
        )
        if isinstance(routed, ChatOnlyReply):
            return NlpAnswer(
                sql="",
                data=[],
                columns=[],
                answer=routed.message,
                chart_hint={"type": "none", "x": None, "y": None, "title": ""},
            )

        cross_tenant = user_role == "admin"
        allowed = _build_allowed_tables(user_role, active_modules)
        rows = execute_safe_sql(
            db, sql=routed.sql, params=routed.params, tenant_id=tenant_id,
            cross_tenant=cross_tenant, allowed_tables=allowed,
        )

        normalized: List[Dict[str, Any]] = []
        for row in rows:
            item: Dict[str, Any] = {}
            for k, v in row.items():
                if isinstance(v, Decimal):
                    item[k] = float(v)
                elif isinstance(v, (date, datetime)):
                    item[k] = v.isoformat()
                else:
                    item[k] = v
            normalized.append(item)

        columns = list(normalized[0].keys()) if normalized else []
        answer, chart_hint = summarize_result(
            user_text=user_text, sql=routed.sql, data=normalized, language=language
        )
        return NlpAnswer(
            sql=routed.sql,
            data=normalized,
            columns=columns,
            answer=answer,
            chart_hint=chart_hint,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("nlp_query_fallback", reason=str(exc))
        return NlpAnswer(
            sql="",
            data=[],
            columns=[],
            answer=NLP_FRIENDLY_DB_FAILURE,
            chart_hint={"type": "none", "x": None, "y": None, "title": ""},
        )


def run_nlp_query_tuple(
    db: Session, *, user_text: str, tenant_id: int
) -> Tuple[str, List[Dict[str, Any]]]:
    """Eski arayz (ikinci oge rows) - geriye donuk uyumluluk."""
    res = run_nlp_query(db, user_text=user_text, tenant_id=tenant_id)
    return res.sql, res.data
