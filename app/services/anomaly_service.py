"""Gerçek anomali tespiti servisi.

IsolationForest algoritması ile finans, satış ve stok verilerinde
anormal örüntüler tespit eder. Sonuçlar WebSocket hub üzerinden yayınlanır.

Kullanılan teknik: sklearn.ensemble.IsolationForest
  - contamination="auto" → verinin %10'unu anomali olarak varsayar
  - Yeterli veri yoksa (< MIN_SAMPLES) tespit atlanır
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import structlog
from sqlalchemy import select, text
from sqlalchemy.orm import Session

logger = structlog.get_logger(__name__)

# Bir modül için minimum örnek sayısı (daha az veri varsa tahmin güvenilmez)
MIN_SAMPLES = 5


@dataclass
class AnomalyResult:
    """Tek bir anomali tespiti sonucu."""
    source: str          # "finance" | "sales" | "inventory"
    severity: str        # "critical" | "warning" | "info"
    title: str           # Kısa başlık
    message: str         # Açıklama
    score: float         # IsolationForest anomaly score (-1 ile 0 arası; negatif = daha anormal)
    entity_id: int | None = None    # İlgili satır ID'si
    entity_label: str | None = None # Ürün adı / tarih vb.
    extra: dict[str, Any] = field(default_factory=dict)


def _isolation_forest_scores(values: list[float]) -> list[float]:
    """Değer listesi için IsolationForest anomaly score'larını döner.

    Düşük score (< -0.1) anomaliyi gösterir.
    Yeterli veri yoksa tüm skorlar 0.0 döner.
    """
    if len(values) < MIN_SAMPLES:
        return [0.0] * len(values)

    try:
        import numpy as np
        from sklearn.ensemble import IsolationForest

        X = np.array(values).reshape(-1, 1)
        clf = IsolationForest(contamination="auto", random_state=42)
        clf.fit(X)
        # decision_function: pozitif = normal, negatif = anormal
        scores: list[float] = clf.decision_function(X).tolist()
        return scores
    except ImportError:
        logger.warning("anomaly_sklearn_missing", msg="scikit-learn kurulu değil, anomali tespiti atlandı.")
        return [0.0] * len(values)


# ---------------------------------------------------------------------------
# Finans anomali tespiti
# ---------------------------------------------------------------------------

def detect_finance_anomalies(_db: Session, *, tenant_id: int) -> list[AnomalyResult]:  # noqa: ARG001
    """finance_records tablosu yok — Faz 2'de Finance modülü eklenince yeniden yazılacak."""
    return []


# ---------------------------------------------------------------------------
# Satış anomali tespiti
# ---------------------------------------------------------------------------

def detect_sales_anomalies(db: Session, *, tenant_id: int) -> list[AnomalyResult]:
    """Satış kalemlerinde birim fiyat sapması ve anormal iade miktarı tespit eder."""
    rows = db.execute(
        text(
            """
            SELECT si.id, si.product_id, p.name AS product_name,
                   si.quantity, si.unit_price
            FROM sales_items si
            JOIN products p ON p.id = si.product_id
            WHERE si.tenant_id = :tid
            ORDER BY si.id DESC
            LIMIT 100
            """
        ),
        {"tid": tenant_id},
    ).fetchall()

    if len(rows) < MIN_SAMPLES:
        return []

    # Fiyat sapması tespiti
    prices = [float(r.unit_price) for r in rows]
    price_scores = _isolation_forest_scores(prices)

    # Miktar sapması tespiti
    quantities = [float(r.quantity) for r in rows]
    qty_scores = _isolation_forest_scores(quantities)

    results: list[AnomalyResult] = []
    for row, p_score, q_score in zip(rows, price_scores, qty_scores):
        if p_score < -0.15:
            severity = "critical" if p_score < -0.25 else "warning"
            results.append(
                AnomalyResult(
                    source="sales",
                    severity=severity,
                    title="Anormal Birim Fiyatı",
                    message=(
                        f"{row.product_name} ürününde beklenmedik fiyat: "
                        f"{row.unit_price:.2f}₺ (normal aralık dışı)"
                    ),
                    score=p_score,
                    entity_id=row.id,
                    entity_label=row.product_name,
                    extra={"unit_price": float(row.unit_price), "product_id": row.product_id},
                )
            )
        if q_score < -0.15:
            severity = "critical" if q_score < -0.25 else "warning"
            results.append(
                AnomalyResult(
                    source="sales",
                    severity=severity,
                    title="Anormal Satış Miktarı",
                    message=(
                        f"{row.product_name} ürününde beklenmedik satış adedi: "
                        f"{row.quantity} adet"
                    ),
                    score=q_score,
                    entity_id=row.id,
                    entity_label=row.product_name,
                    extra={"quantity": float(row.quantity), "product_id": row.product_id},
                )
            )

    logger.info(
        "anomaly_sales_scan",
        tenant_id=tenant_id,
        rows=len(rows),
        anomalies=len(results),
    )
    return results


# ---------------------------------------------------------------------------
# Stok anomali tespiti
# ---------------------------------------------------------------------------

def detect_inventory_anomalies(db: Session, *, tenant_id: int) -> list[AnomalyResult]:
    """Stok hareketi miktarlarında beklenmedik düşüş veya artışları tespit eder."""
    rows = db.execute(
        text(
            """
            SELECT sm.id, sm.product_id, p.name AS product_name,
                   sm.quantity_change, sm.movement_type
            FROM stock_movements sm
            JOIN products p ON p.id = sm.product_id
            WHERE sm.tenant_id = :tid
            ORDER BY sm.id DESC
            LIMIT 100
            """
        ),
        {"tid": tenant_id},
    ).fetchall()

    if len(rows) < MIN_SAMPLES:
        return []

    changes = [float(r.quantity_change) for r in rows]
    scores = _isolation_forest_scores(changes)

    results: list[AnomalyResult] = []
    for row, score in zip(rows, scores):
        if score < -0.15:
            severity = "critical" if score < -0.25 else "warning"
            direction = "düşüş" if row.quantity_change < 0 else "artış"
            results.append(
                AnomalyResult(
                    source="inventory",
                    severity=severity,
                    title=f"Anormal Stok {direction.capitalize()}ı",
                    message=(
                        f"{row.product_name} ürününde beklenmedik stok {direction}: "
                        f"{abs(row.quantity_change)} adet ({row.movement_type})"
                    ),
                    score=score,
                    entity_id=row.product_id,
                    entity_label=row.product_name,
                    extra={
                        "quantity_change": float(row.quantity_change),
                        "movement_type": row.movement_type,
                        "product_id": row.product_id,
                    },
                )
            )

    logger.info(
        "anomaly_inventory_scan",
        tenant_id=tenant_id,
        rows=len(rows),
        anomalies=len(results),
    )
    return results


# ---------------------------------------------------------------------------
# Tüm anomali tespitlerini çalıştır
# ---------------------------------------------------------------------------

def run_all_anomaly_checks(db: Session, *, tenant_id: int) -> list[AnomalyResult]:
    """Tüm kaynak tiplerinde anomali tespiti yapar ve birleşik liste döner."""
    results: list[AnomalyResult] = []
    # TODO(faz-2): detect_finance_anomalies — finance_records modeli eklenince aç
    # results.extend(detect_finance_anomalies(db, tenant_id=tenant_id))
    results.extend(detect_sales_anomalies(db, tenant_id=tenant_id))
    results.extend(detect_inventory_anomalies(db, tenant_id=tenant_id))

    # Şiddetine göre sırala: critical önce
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    results.sort(key=lambda r: severity_order.get(r.severity, 3))

    logger.info(
        "anomaly_full_scan_complete",
        tenant_id=tenant_id,
        total_anomalies=len(results),
    )
    return results


def anomaly_result_to_ws_payload(result: AnomalyResult) -> dict[str, Any]:
    """AnomalyResult'ı WebSocket broadcast payload'una dönüştürür."""
    type_map = {"critical": "critical", "warning": "warning", "info": "info"}
    product_id = result.extra.get("product_id")
    payload: dict[str, Any] = {
        "type": type_map.get(result.severity, "info"),
        "source": result.source,
        "message": result.message,
        "title": result.title,
        "score": round(result.score, 4),
    }
    if product_id:
        payload["action_label"] = "Sipariş Taslağı Oluştur"
        payload["action_endpoint"] = f"/api/inventory/{product_id}/auto-draft"
        payload["action_type"] = "inventory.auto_draft"
        payload["product_id"] = product_id
    return payload
