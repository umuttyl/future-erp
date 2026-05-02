from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.services.finance_service import finance_service
from app.services.nlp_assistant import _extract_json, _generate_content


def _collect_context(db: Session) -> Dict[str, Any]:
    today = date.today()
    last_30_start = today - timedelta(days=30)
    prev_30_start = today - timedelta(days=60)
    prev_30_end = today - timedelta(days=31)

    summary = finance_service.summary(db, start_date=last_30_start, end_date=today)
    prev = finance_service.summary(db, start_date=prev_30_start, end_date=prev_30_end)
    monthly = finance_service.monthly_revenue(db)
    top_customers = finance_service.top_customers(db, start_date=last_30_start, end_date=today, limit=5)
    top_products = finance_service.top_products(db, start_date=last_30_start, end_date=today, limit=5)

    all_products = list(db.scalars(select(Product)).all())
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


def build_insights(db: Session) -> Dict[str, Any]:
    ctx = _collect_context(db)

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
