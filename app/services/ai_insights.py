from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Dict, List

from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.tenant import Tenant
from app.models.user import User
from app.services.finance_service import finance_service
from app.services.nlp_assistant import _extract_json, _generate_content


def _collect_context(db: Session, tenant_id: int) -> Dict[str, Any]:
    today = date.today()
    last_30_start = today - timedelta(days=30)
    prev_30_start = today - timedelta(days=60)
    prev_30_end = today - timedelta(days=31)

    summary = finance_service.summary(db, tenant_id, start_date=last_30_start, end_date=today)
    prev = finance_service.summary(db, tenant_id, start_date=prev_30_start, end_date=prev_30_end)
    monthly = finance_service.monthly_revenue(db, tenant_id)
    top_customers = finance_service.top_customers(
        db, tenant_id, start_date=last_30_start, end_date=today, limit=5
    )
    top_products = finance_service.top_products(
        db, tenant_id, start_date=last_30_start, end_date=today, limit=5
    )

    all_products = list(db.scalars(select(Product).where(Product.tenant_id == tenant_id)).all())
    low_stock = [
        {
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "stock_quantity": int(p.stock_quantity or 0),
            "reorder_level": int(p.reorder_level or 0),
        }
        for p in all_products
        if p.reorder_level and p.stock_quantity <= p.reorder_level
    ]

    revenue_growth = 0.0
    if prev["revenue"]:
        revenue_growth = ((summary["revenue"] - prev["revenue"]) / prev["revenue"]) * 100.0

    return {
        "today": today.isoformat(),
        "summary_last_30": summary,
        "summary_prev_30": prev,
        "revenue_growth_pct": round(revenue_growth, 2),
        "monthly_revenue": monthly[-6:],
        "top_customers_last_30": top_customers,
        "top_products_last_30": top_products,
        "low_stock_products": low_stock,
        "total_skus": len(all_products),
    }


def _insights_prompt(ctx: Dict[str, Any]) -> str:
    return (
        "Sen bir ERP ve satış analizi uzmanısın. Aşağıdaki işletme verilerini Türkçe yorumla "
        "ve yönetici için uygulanabilir içgörüler üret.\n\n"
        "Çıktı KURALLARI:\n"
        "- Cevap MUTLAKA geçerli JSON olmalı. Yapı:\n"
        '  { "highlights": [ { "title": string, "body": string, '
        '"severity": "positive"|"info"|"warning"|"critical", "metric": string? } ], '
        '"headline": string }\n'
        "- 3 ila 6 adet highlight üret.\n"
        "- Her 'body' en fazla 2 cümle, akıcı Türkçe.\n"
        "- Para birimi ₺, yüzde ve rakamları gerçekten verilenlerden türet.\n"
        "- Kritik stok varsa en az bir warning/critical highlight oluştur.\n"
        "- Ciro değişimi, en iyi ürünler/müşteriler, aylık trend ve stok durumu hakkında somut önerilerde bulun.\n\n"
        "İşletme verileri:\n"
        + json.dumps(ctx, ensure_ascii=False, default=str)
    )


def _collect_platform_context(db: Session) -> Dict[str, Any]:
    """Tüm tenant'ların platform geneli istatistiklerini toplar (admin için)."""
    today = date.today()
    last_30_start = today - timedelta(days=30)
    prev_30_start = today - timedelta(days=60)
    prev_30_end = today - timedelta(days=31)

    tenants = list(db.scalars(select(Tenant).where(Tenant.is_active == True)).all())  # noqa: E712

    tenant_stats = []
    monthly_agg: Dict[str, Dict[str, Any]] = {}
    total_revenue = 0.0
    total_prev_revenue = 0.0

    for t in tenants:
        summary = finance_service.summary(db, t.id, start_date=last_30_start, end_date=today)
        prev = finance_service.summary(db, t.id, start_date=prev_30_start, end_date=prev_30_end)
        monthly = finance_service.monthly_revenue(db, t.id)
        product_count = db.scalar(select(sqlfunc.count(Product.id)).where(Product.tenant_id == t.id)) or 0
        user_count = db.scalar(select(sqlfunc.count(User.id)).where(User.tenant_id == t.id)) or 0
        revenue = float(summary.get("revenue") or 0)
        prev_rev = float(prev.get("revenue") or 0)
        growth = ((revenue - prev_rev) / prev_rev * 100.0) if prev_rev > 0 else 0.0
        total_revenue += revenue
        total_prev_revenue += prev_rev
        tenant_stats.append({
            "id": t.id,
            "name": t.name or t.slug,
            "sector": t.sector or "other",
            "revenue_last_30": round(revenue, 2),
            "revenue_growth_pct": round(growth, 2),
            "product_count": product_count,
            "user_count": user_count,
        })
        for m in monthly:
            key = str(m.get("month", ""))
            if not key:
                continue
            if key not in monthly_agg:
                monthly_agg[key] = {"month": key, "revenue": 0.0, "orders": 0}
            monthly_agg[key]["revenue"] = round(monthly_agg[key]["revenue"] + float(m.get("revenue") or 0), 2)
            monthly_agg[key]["orders"] += int(m.get("orders") or 0)

    tenant_stats.sort(key=lambda x: x["revenue_last_30"], reverse=True)
    monthly_list = sorted(monthly_agg.values(), key=lambda x: x["month"])[-6:]

    total_users = db.scalar(select(sqlfunc.count(User.id))) or 0
    total_skus = db.scalar(select(sqlfunc.count(Product.id))) or 0

    critical_stock_items = []
    tenant_map = {t.id: (t.name or t.slug) for t in tenants}
    for p in db.scalars(select(Product)).all():
        rl = int(p.reorder_level or 0)
        sq = int(p.stock_quantity or 0)
        if rl > 0 and sq <= rl:
            critical_stock_items.append({
                "id": p.id,
                "sku": p.sku,
                "name": p.name,
                "tenant_name": tenant_map.get(p.tenant_id, f"Tenant #{p.tenant_id}"),
                "stock_quantity": sq,
                "reorder_level": rl,
            })

    platform_growth = (
        ((total_revenue - total_prev_revenue) / total_prev_revenue * 100.0)
        if total_prev_revenue > 0
        else 0.0
    )

    return {
        "today": today.isoformat(),
        "total_tenants": len(tenants),
        "total_users": total_users,
        "total_skus": total_skus,
        "total_revenue_last_30": round(total_revenue, 2),
        "total_prev_revenue": round(total_prev_revenue, 2),
        "revenue_growth_pct": round(platform_growth, 2),
        "top_tenants_by_revenue": tenant_stats[:5],
        "all_tenant_stats": tenant_stats,
        "monthly_revenue": monthly_list,
        "critical_stock_count": len(critical_stock_items),
        "critical_stock_items": critical_stock_items,
    }


def _platform_insights_prompt(ctx: Dict[str, Any]) -> str:
    ctx_slim = {k: v for k, v in ctx.items() if k != "all_tenant_stats"}
    return (
        "Sen bir ERP platform analiz uzmanısın. Aşağıdaki PLATFORM GENELİ veriler "
        "TÜM şirketlere (tenant) aittir. Türkçe platform özeti üret.\n\n"
        "Çıktı KURALLARI:\n"
        "- Cevap MUTLAKA geçerli JSON olmalı. Yapı:\n"
        '  { "highlights": [ { "title": string, "body": string, '
        '"severity": "positive"|"info"|"warning"|"critical", "metric": string? } ], '
        '"headline": string }\n'
        "- 4 ila 6 adet highlight üret.\n"
        "- Her 'body' en fazla 2 cümle, akıcı Türkçe.\n"
        "- Toplam ciro, en aktif şirketler, sektör dağılımı, kritik stok durumu hakkında platform odaklı içgörüler ver.\n"
        "- Büyüme trendleri ve öneriler ekle.\n\n"
        "Platform verileri:\n"
        + json.dumps(ctx_slim, ensure_ascii=False, default=str)
    )


def _fallback_platform_highlights(ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    out.append({
        "title": "Platform Özeti",
        "body": f"Sistemde {ctx['total_tenants']} aktif şirket ve {ctx['total_users']} kullanıcı bulunuyor.",
        "severity": "info",
        "metric": f"{ctx['total_tenants']} şirket",
    })
    top = ctx.get("top_tenants_by_revenue", [])
    if top:
        best = top[0]
        out.append({
            "title": "En Yüksek Cirolu Şirket",
            "body": f"{best['name']} son 30 günde ₺{best['revenue_last_30']:,.0f} ciro elde etti.",
            "severity": "positive",
            "metric": f"₺{best['revenue_last_30']:,.0f}",
        })
    if ctx.get("critical_stock_count", 0) > 0:
        out.append({
            "title": "Platform Geneli Kritik Stok",
            "body": f"Tüm şirketlerde {ctx['critical_stock_count']} üründe stok kritik seviyenin altında.",
            "severity": "critical",
            "metric": f"{ctx['critical_stock_count']} SKU",
        })
    return out


def build_platform_insights(db: Session) -> Dict[str, Any]:
    """Admin için cross-tenant platform geneli içgörüler."""
    ctx = _collect_platform_context(db)
    try:
        raw = _generate_content(_platform_insights_prompt(ctx))
        parsed = _extract_json(raw)
        headline = str(parsed.get("headline", "")).strip()
        highlights = parsed.get("highlights", [])
        if not isinstance(highlights, list):
            highlights = []
        cleaned: List[Dict[str, Any]] = []
        for h in highlights[:6]:
            if not isinstance(h, dict):
                continue
            cleaned.append({
                "title": str(h.get("title", "")).strip(),
                "body": str(h.get("body", "")).strip(),
                "severity": str(h.get("severity", "info")).strip() or "info",
                "metric": str(h.get("metric", "")).strip() or None,
            })
    except Exception as e:
        headline = "Platform özeti üretilemedi; temel metrikler aşağıda."
        cleaned = _fallback_platform_highlights(ctx)
        cleaned.insert(0, {
            "title": "AI üretimi atlandı",
            "body": f"Model çağrısı başarısız: {e}",
            "severity": "warning",
            "metric": None,
        })

    total_rev = ctx["total_revenue_last_30"]
    n_tenants = ctx["total_tenants"]
    _empty_summary: Dict[str, Any] = {
        "start_date": "", "end_date": "", "revenue": 0, "cogs": 0,
        "gross_profit": 0, "margin_pct": 0, "total_quantity": 0,
        "order_count": 0, "customer_count": 0, "avg_order_value": 0, "inventory_value": 0,
    }
    return {
        "headline": headline or f"{n_tenants} şirketten platform geneli ₺{total_rev:,.0f} ciro (son 30 gün).",
        "highlights": cleaned,
        "context": {
            "today": ctx["today"],
            "summary_last_30": {**_empty_summary, "revenue": total_rev, "total_tenants": n_tenants},
            "summary_prev_30": {**_empty_summary, "revenue": ctx["total_prev_revenue"]},
            "revenue_growth_pct": ctx["revenue_growth_pct"],
            "monthly_revenue": ctx["monthly_revenue"],
            "top_customers_last_30": [],
            "top_products_last_30": [],
            "low_stock_products": ctx["critical_stock_items"],
            "total_skus": ctx["total_skus"],
            # Admin extras
            "total_tenants": n_tenants,
            "total_users": ctx["total_users"],
            "critical_stock_count": ctx["critical_stock_count"],
            "top_tenants_by_revenue": ctx["top_tenants_by_revenue"],
        },
    }


def build_insights(db: Session, tenant_id: int) -> Dict[str, Any]:
    ctx = _collect_context(db, tenant_id)

    try:
        raw = _generate_content(_insights_prompt(ctx))
        parsed = _extract_json(raw)
        headline = str(parsed.get("headline", "")).strip()
        highlights = parsed.get("highlights", [])
        if not isinstance(highlights, list):
            highlights = []
        cleaned: List[Dict[str, Any]] = []
        for h in highlights[:6]:
            if not isinstance(h, dict):
                continue
            cleaned.append(
                {
                    "title": str(h.get("title", "")).strip(),
                    "body": str(h.get("body", "")).strip(),
                    "severity": str(h.get("severity", "info")).strip() or "info",
                    "metric": str(h.get("metric", "")).strip() or None,
                }
            )
    except Exception as e:
        headline = "AI özet üretilemedi; aşağıda hesaplanan temel metrikler görünmektedir."
        cleaned = _fallback_highlights(ctx)
        cleaned.insert(
            0,
            {
                "title": "AI üretimi atlandı",
                "body": f"Gemini çağrısı başarısız oldu: {e}",
                "severity": "warning",
                "metric": None,
            },
        )

    return {
        "headline": headline or _default_headline(ctx),
        "highlights": cleaned,
        "context": ctx,
    }


def _default_headline(ctx: Dict[str, Any]) -> str:
    growth = ctx.get("revenue_growth_pct", 0)
    trend = "artış" if growth >= 0 else "düşüş"
    return f"Son 30 günde ciroda %{abs(growth):.1f} {trend} gözleniyor."


def _fallback_highlights(ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    s = ctx.get("summary_last_30", {})
    out.append(
        {
            "title": "Son 30 gün cirosu",
            "body": f"Toplam ciro ₺{s.get('revenue', 0):,.2f}, ortalama sepet ₺{s.get('avg_order_value', 0):,.2f}.",
            "severity": "info",
            "metric": f"₺{s.get('revenue', 0):,.0f}",
        }
    )
    top = ctx.get("top_products_last_30", [])
    if top:
        best = top[0]
        out.append(
            {
                "title": "En çok satan ürün",
                "body": f"{best['name']} ürünü {best['quantity']} adet ile ciroya ₺{best['revenue']:,.0f} katkı sağladı.",
                "severity": "positive",
                "metric": best["name"],
            }
        )
    low = ctx.get("low_stock_products", [])
    if low:
        out.append(
            {
                "title": "Kritik stok uyarısı",
                "body": f"{len(low)} üründe stok yeniden sipariş seviyesinin altında. İlk sıradaki: {low[0]['name']}.",
                "severity": "critical",
                "metric": f"{len(low)} SKU",
            }
        )
    return out
