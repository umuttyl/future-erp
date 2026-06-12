from datetime import date as _date
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_tenant_ctx, require_permission
from app.core.permissions import AI_INSIGHTS_READ
from app.models.product import Product
from app.models.tenant import Tenant
from app.services.ai_experts import EXPERTS, auto_route_expert, run_expert_query
from app.services.ai_insights import build_insights, build_platform_insights
from app.services.morning_briefing_service import build_morning_briefing
from app.services.ai_signals_service import compute_customer_signals, compute_product_signals
from app.services.customer_health_service import compute_customer_health

router = APIRouter()


class StockAlert(BaseModel):
    id: int
    sku: str
    name: str
    category: Optional[str] = None
    stock_quantity: int
    reorder_level: int
    deficit: int
    tenant_name: Optional[str] = None


def _is_platform_admin(principal: AuthPrincipal, ctx: TenantContext) -> bool:
    """True iff admin is NOT impersonating a specific tenant."""
    return principal.is_platform_admin and ctx.tenant_id == principal.tenant_id


@router.get("/insights")
def get_insights(
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
    force: bool = False,
) -> Dict[str, Any]:
    tenant = db.get(Tenant, ctx.tenant_id)
    language = getattr(tenant, "language", "en") or "en" if tenant else "en"
    if _is_platform_admin(principal, ctx):
        return build_platform_insights(db, language=language, force_refresh=force)
    return build_insights(db, ctx.tenant_id, language=language, force_refresh=force)


@router.get("/stock-alerts", response_model=List[StockAlert])
def stock_alerts(
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
) -> List[StockAlert]:
    if _is_platform_admin(principal, ctx):
        tenant_map = {t.id: (t.name or t.slug) for t in db.scalars(select(Tenant)).all()}
        products = list(db.scalars(select(Product)).all())
    else:
        tenant_map = {}
        products = list(db.scalars(select(Product).where(Product.tenant_id == ctx.tenant_id)).all())

    alerts: List[StockAlert] = []
    for p in products:
        rl = int(p.reorder_level or 0)
        sq = int(p.stock_quantity or 0)
        if rl > 0 and sq <= rl:
            alerts.append(
                StockAlert(
                    id=p.id,
                    sku=p.sku,
                    name=p.name,
                    category=p.category,
                    stock_quantity=sq,
                    reorder_level=rl,
                    deficit=max(0, rl - sq),
                    tenant_name=tenant_map.get(p.tenant_id) if tenant_map else None,
                )
            )
    alerts.sort(key=lambda a: (a.stock_quantity - a.reorder_level))
    return alerts


# ─── 5 Uzman AI Sistemi (2C-2) ───────────────────────────────────────────────

class ExpertQueryIn(BaseModel):
    text: str
    context: Optional[str] = None  # sayfa adı (frontend'den gelir)


class ExpertInfo(BaseModel):
    key: str
    name: str
    icon: str
    description: str


class ExpertQueryOut(BaseModel):
    expert_key: str
    expert_name: str
    expert_icon: str
    answer: str
    sql: str
    columns: List[str]
    data: List[Dict[str, Any]]
    chart_hint: Optional[Dict[str, Any]] = None


@router.get("/experts", response_model=List[ExpertInfo])
def list_experts(
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
) -> List[ExpertInfo]:
    del principal  # yetki kontrolü için zorunlu; dönüş değeri kullanılmıyor
    """Mevcut uzman listesini döner (frontend uzman seçici için)."""
    return [
        ExpertInfo(key=e.key, name=e.name, icon=e.icon, description=e.description)
        for e in EXPERTS.values()
    ]


@router.post("/expert/{expert_key}/query", response_model=ExpertQueryOut)
def expert_query(
    expert_key: str,
    body: ExpertQueryIn,
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
) -> ExpertQueryOut:
    """Belirli bir uzmanla sorgu çalıştır."""
    if expert_key not in EXPERTS:
        raise HTTPException(status_code=404, detail=f"Expert not found: {expert_key}")

    expert = EXPERTS[expert_key]
    tenant = db.get(Tenant, ctx.tenant_id)
    tenant_name = (tenant.name or "") if tenant else ""

    result = run_expert_query(
        db,
        user_text=body.text,
        expert_key=expert_key,
        tenant_id=ctx.tenant_id,
        user_role=principal.role,
        tenant_name=tenant_name,
    )

    return ExpertQueryOut(
        expert_key=expert_key,
        expert_name=expert.name,
        expert_icon=expert.icon,
        answer=result.answer,
        sql=result.sql,
        columns=result.columns,
        data=result.data,
        chart_hint=result.chart_hint,
    )


@router.post("/expert/{expert_key}/stream")
def expert_query_stream(
    expert_key: str,
    body: ExpertQueryIn,
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """SSE stream: status messages then answer tokens then final JSON payload."""
    import json as _json
    from datetime import date, datetime
    from decimal import Decimal

    from app.services.nlp_assistant import (
        ChatOnlyReply,
        _build_allowed_tables,
        _fallback_chart_hint,
        execute_safe_sql,
        interpret_nlp_request,
        summarize_result_stream,
    )

    if expert_key not in EXPERTS:
        raise HTTPException(status_code=404, detail=f"Expert not found: {expert_key}")

    expert = EXPERTS[expert_key]
    tenant = db.get(Tenant, ctx.tenant_id)
    tenant_name = (tenant.name or "") if tenant else ""
    language = getattr(tenant, "language", "en") or "en" if tenant else "en"

    def _sse(obj: Dict[str, Any]) -> str:
        return f"data: {_json.dumps(obj, ensure_ascii=False, default=str)}\n\n"

    def generate():
        yield _sse({"type": "status", "msg": "Analyzing your question…"})
        try:
            routed = interpret_nlp_request(
                user_text=body.text,
                user_role=principal.role,
                tenant_name=tenant_name,
                expert_addon=expert.system_prompt_addon,
            )

            if isinstance(routed, ChatOnlyReply):
                yield _sse({"type": "token", "text": routed.message})
                yield _sse({"type": "done", "sql": "", "data": [], "columns": [], "chart_hint": None})
                return

            yield _sse({"type": "status", "msg": "Running database query…"})
            cross_tenant = principal.role == "admin"
            allowed = _build_allowed_tables(principal.role)
            rows = execute_safe_sql(
                db,
                sql=routed.sql,
                params=routed.params,
                tenant_id=ctx.tenant_id,
                cross_tenant=cross_tenant,
                allowed_tables=allowed,
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
            chart_hint = _fallback_chart_hint(normalized)

            yield _sse({"type": "status", "msg": "Generating analysis…"})
            for token in summarize_result_stream(
                user_text=body.text, sql=routed.sql, data=normalized, language=language
            ):
                yield _sse({"type": "token", "text": token})

            yield _sse({
                "type": "done",
                "sql": routed.sql,
                "data": normalized,
                "columns": columns,
                "chart_hint": chart_hint,
            })

        except Exception as exc:
            yield _sse({"type": "error", "msg": str(exc)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── 2C-3 Sabah Brifingi ──────────────────────────────────────────────────────

class BriefingItemOut(BaseModel):
    title: str
    body: str
    priority: str
    icon: str
    action_label: Optional[str] = None
    action_url: Optional[str] = None


class MorningBriefingOut(BaseModel):
    date: str
    items: List[BriefingItemOut]


@router.get("/morning-briefing", response_model=MorningBriefingOut)
def morning_briefing(
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
) -> MorningBriefingOut:
    """Günlük sabah brifingi: kritik stok, dün satış, gecikmiş görev, bekleyen sipariş."""
    tenant = db.get(Tenant, ctx.tenant_id)
    language = getattr(tenant, "language", "en") or "en" if tenant else "en"
    # owner / platform-admin → None (see everything); staff → filter by job role permissions
    if principal.is_platform_admin or principal.role_kind == "owner":
        perms = None
    else:
        from app.models.user import User
        from sqlalchemy.orm import joinedload
        u = db.scalar(
            select(User).options(joinedload(User.job_role)).where(User.id == principal.user_id)
        )
        perms = list(u.job_role.permissions or []) if u and u.job_role else []
    raw_items = build_morning_briefing(db, tenant_id=ctx.tenant_id, language=language, permissions=perms)
    return MorningBriefingOut(
        date=str(_date.today()),
        items=[BriefingItemOut(**vars(item)) for item in raw_items],
    )


# ─── 2C-4 Inline AI Sinyalleri ───────────────────────────────────────────────

class CustomerSignalOut(BaseModel):
    customer_id: int
    signals: List[str]


class ProductSignalOut(BaseModel):
    product_id: int
    signals: List[str]


@router.get("/signals/customers", response_model=List[CustomerSignalOut])
def customer_signals(
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
) -> List[CustomerSignalOut]:
    """Müşteri başına AI sinyalleri: vip, silent_30, payment_pending."""
    del principal
    raw = compute_customer_signals(db, tenant_id=ctx.tenant_id)
    return [CustomerSignalOut(customer_id=r.customer_id, signals=list(r.signals)) for r in raw]


@router.get("/signals/products", response_model=List[ProductSignalOut])
def product_signals(
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
) -> List[ProductSignalOut]:
    """Ürün başına AI sinyalleri: critical, declining, fast_mover."""
    del principal
    raw = compute_product_signals(db, tenant_id=ctx.tenant_id)
    return [ProductSignalOut(product_id=r.product_id, signals=list(r.signals)) for r in raw]


# ─── 2C-7 Müşteri Sağlık Skoru ───────────────────────────────────────────────

class CustomerHealthOut(BaseModel):
    customer_id: int
    customer_name: str
    score: int
    tier: str
    last_order_days: Optional[int] = None
    orders_90d: int
    balance: float
    signals: List[str]


@router.get("/customer-health", response_model=List[CustomerHealthOut])
def customer_health(
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
    limit: int = 50,
) -> List[CustomerHealthOut]:
    """Müşteri sağlık skorları — en düşük skorlular önce (churn riski)."""
    del principal
    raw = compute_customer_health(db, tenant_id=ctx.tenant_id)
    return [
        CustomerHealthOut(
            customer_id=r.customer_id,
            customer_name=r.customer_name,
            score=r.score,
            tier=r.tier,
            last_order_days=r.last_order_days,
            orders_90d=r.orders_90d,
            balance=r.balance,
            signals=r.signals,
        )
        for r in raw[:limit]
    ]


# ─── 3-7 AI Cashflow Simülasyon ──────────────────────────────────────────────

class CashflowDayOut(BaseModel):
    date: str
    balance: float
    status: str


class CashflowForecastOut(BaseModel):
    current_balance: float
    daily_income_avg: float
    daily_expense_avg: float
    net_daily: float
    horizon_days: int
    projection: List[CashflowDayOut]
    first_danger_date: Optional[str] = None
    first_warning_date: Optional[str] = None
    status: str
    alert_message: Optional[str] = None
    lookback_days: int
    has_cashbook_data: bool


@router.get("/cashflow-forecast", response_model=CashflowForecastOut)
def cashflow_forecast(
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
) -> CashflowForecastOut:
    """14 günlük nakit akış simülasyonu — proaktif kasa uyarısı."""
    del principal
    from app.services.cashflow_service import compute_cashflow_forecast
    r = compute_cashflow_forecast(db, tenant_id=ctx.tenant_id)
    return CashflowForecastOut(
        current_balance=r.current_balance,
        daily_income_avg=r.daily_income_avg,
        daily_expense_avg=r.daily_expense_avg,
        net_daily=r.net_daily,
        horizon_days=r.horizon_days,
        projection=[CashflowDayOut(date=d.date, balance=d.balance, status=d.status) for d in r.projection],
        first_danger_date=r.first_danger_date,
        first_warning_date=r.first_warning_date,
        status=r.status,
        alert_message=r.alert_message,
        lookback_days=r.lookback_days,
        has_cashbook_data=r.has_cashbook_data,
    )


# ─── Reorder Recommendations ─────────────────────────────────────────────────

class ReorderItemOut(BaseModel):
    product_id: int
    sku: str
    name: str
    current_stock: int
    reorder_level: int
    daily_sales_avg: float
    days_remaining: Optional[float] = None
    deficit: int
    suggested_order_qty: int
    urgency: str
    has_pending_order: bool = False


class ReorderRecommendationsOut(BaseModel):
    recommendations: List[ReorderItemOut]
    total_needing_attention: int
    critical_count: int
    warning_count: int
    analysis_period_days: int


@router.get("/reorder-recommendations", response_model=ReorderRecommendationsOut)
def reorder_recommendations(
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
    top_n: int = 20,
) -> ReorderRecommendationsOut:
    """AI-driven reorder recommendations based on sales velocity + current stock."""
    del principal
    from app.services.ai_copilot_service import ToolContext, _tool_reorder_recommendations
    from app.models.supply_order import SupplyOrder
    from sqlalchemy import select as sa_select

    tool_ctx = ToolContext(db=db, tenant_id=ctx.tenant_id, user_role="manager", tenant_name="")
    data = _tool_reorder_recommendations({"top_n": top_n}, tool_ctx)

    # Mark products that already have a non-terminal supply order
    pending_product_ids: set[int] = set(
        db.scalars(
            sa_select(SupplyOrder.product_id).where(
                SupplyOrder.tenant_id == ctx.tenant_id,
                SupplyOrder.status.in_(["Draft", "Approved"]),
            )
        ).all()
    )
    for item in data["recommendations"]:
        item["has_pending_order"] = item["product_id"] in pending_product_ids

    return ReorderRecommendationsOut(**data)


@router.post("/auto-route", response_model=ExpertQueryOut)
def auto_route_query(
    body: ExpertQueryIn,
    principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
) -> ExpertQueryOut:
    """Sorguyu otomatik olarak en uygun uzmana yönlendir."""
    expert_key = auto_route_expert(body.text)
    expert = EXPERTS[expert_key]
    tenant = db.get(Tenant, ctx.tenant_id)
    tenant_name = (tenant.name or "") if tenant else ""

    result = run_expert_query(
        db,
        user_text=body.text,
        expert_key=expert_key,
        tenant_id=ctx.tenant_id,
        user_role=principal.role,
        tenant_name=tenant_name,
    )

    return ExpertQueryOut(
        expert_key=expert_key,
        expert_name=expert.name,
        expert_icon=expert.icon,
        answer=result.answer,
        sql=result.sql,
        columns=result.columns,
        data=result.data,
        chart_hint=result.chart_hint,
    )
