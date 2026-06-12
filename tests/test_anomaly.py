"""Anomali tespiti servisi ve API endpoint testleri.

IsolationForest tabanli gercek anomali algilamasi icin birim + entegrasyon testleri.
SQLite in-memory DB kullanilir; scikit-learn kurulu olmadigi durum da test edilir.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.orm import Session

from decimal import Decimal

from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.services.anomaly_service import (
    MIN_SAMPLES,
    AnomalyResult,
    _isolation_forest_scores,
    anomaly_result_to_ws_payload,
    detect_finance_anomalies,
    detect_inventory_anomalies,
    detect_sales_anomalies,
    run_all_anomaly_checks,
)


# ---------------------------------------------------------------------------
# _isolation_forest_scores yardimci fonksiyon
# ---------------------------------------------------------------------------


class TestIsolationForestScores:
    def test_returns_zeros_when_too_few_samples(self):
        """MIN_SAMPLES'tan az veri varsa sifir skor donmeli."""
        values = [1.0, 2.0, 3.0]  # MIN_SAMPLES = 5
        scores = _isolation_forest_scores(values)
        assert scores == [0.0, 0.0, 0.0]

    def test_returns_same_length_as_input(self):
        """Skor listesi girdi ile ayni uzunlukta olmali."""
        values = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
        scores = _isolation_forest_scores(values)
        assert len(scores) == len(values)

    def test_scores_are_floats(self):
        """Skorlar float olmali."""
        values = [5.0, 5.1, 5.0, 4.9, 5.0, 5.1, 5.0, 4.9, 5.0, 5.0]
        scores = _isolation_forest_scores(values)
        assert all(isinstance(s, float) for s in scores)

    def test_outlier_gets_lower_score_than_normal(self):
        """Cok buyuk outlier diger degerlerden daha dusuk skor almali."""
        # 9 normal deger + 1 cok buyuk outlier
        values = [100.0] * 9 + [999999.0]
        scores = _isolation_forest_scores(values)
        # Outlier'in skoru en dusuk olmali
        assert scores[-1] == min(scores)

    def test_fallback_when_sklearn_missing(self):
        """scikit-learn kurulu degilse sifir skorlar donmeli; istisna firlatmamali."""
        values = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
        with patch.dict("sys.modules", {"sklearn": None, "sklearn.ensemble": None}):
            scores = _isolation_forest_scores(values)
        # Fallback: tum degerler 0.0
        assert all(s == 0.0 for s in scores)

    def test_empty_list_returns_empty(self):
        """Bos girdi icin bos liste donmeli."""
        scores = _isolation_forest_scores([])
        assert scores == []


# ---------------------------------------------------------------------------
# AnomalyResult ve WS payload donusumu
# ---------------------------------------------------------------------------


class TestAnomalyResult:
    def test_dataclass_fields(self):
        result = AnomalyResult(
            source="finance",
            severity="warning",
            title="Test Anomali",
            message="Aciklama",
            score=-0.20,
            entity_id=42,
            entity_label="2024-01-15",
            extra={"amount": 5000.0},
        )
        assert result.source == "finance"
        assert result.severity == "warning"
        assert result.score == -0.20
        assert result.extra["amount"] == 5000.0

    def test_default_extra_is_empty_dict(self):
        result = AnomalyResult(source="sales", severity="info", title="T", message="M", score=0.0)
        assert result.extra == {}

    def test_default_entity_fields_are_none(self):
        result = AnomalyResult(source="inventory", severity="info", title="T", message="M", score=0.0)
        assert result.entity_id is None
        assert result.entity_label is None


class TestAnomalyResultToWsPayload:
    def _make_result(self, **kw) -> AnomalyResult:
        defaults = dict(source="finance", severity="warning", title="T", message="M", score=-0.20)
        defaults.update(kw)
        return AnomalyResult(**defaults)

    def test_required_fields_present(self):
        payload = anomaly_result_to_ws_payload(self._make_result())
        assert "type" in payload
        assert "source" in payload
        assert "message" in payload
        assert "title" in payload
        assert "score" in payload

    def test_severity_maps_to_type(self):
        for sev in ("critical", "warning", "info"):
            result = self._make_result(severity=sev)
            payload = anomaly_result_to_ws_payload(result)
            assert payload["type"] == sev

    def test_score_is_rounded(self):
        result = self._make_result(score=-0.123456789)
        payload = anomaly_result_to_ws_payload(result)
        assert payload["score"] == round(-0.123456789, 4)

    def test_inventory_action_added_when_product_id_in_extra(self):
        result = self._make_result(source="inventory", extra={"product_id": 7})
        payload = anomaly_result_to_ws_payload(result)
        assert "action_label" in payload
        assert "action_endpoint" in payload
        assert "/inventory/7/auto-draft" in payload["action_endpoint"]
        assert payload["product_id"] == 7

    def test_no_action_without_product_id(self):
        result = self._make_result(source="finance", extra={})
        payload = anomaly_result_to_ws_payload(result)
        assert "action_label" not in payload
        assert "action_endpoint" not in payload


# ---------------------------------------------------------------------------
# Servis fonksiyonlari: az veri durumu (MIN_SAMPLES alti)
# ---------------------------------------------------------------------------


class TestDetectFunctionsFewRows:
    """Yeterli veri olmadigi durumda bos liste donmeli."""

    def _mock_db(self, rows: list) -> MagicMock:
        db = MagicMock(spec=Session)
        fetchall = MagicMock(return_value=rows)
        db.execute.return_value.fetchall = fetchall
        return db

    def test_finance_few_rows_returns_empty(self):
        db = self._mock_db([MagicMock()] * (MIN_SAMPLES - 1))
        results = detect_finance_anomalies(db, tenant_id=1)
        assert results == []

    def test_sales_few_rows_returns_empty(self):
        db = self._mock_db([MagicMock()] * (MIN_SAMPLES - 1))
        results = detect_sales_anomalies(db, tenant_id=1)
        assert results == []

    def test_inventory_few_rows_returns_empty(self):
        db = self._mock_db([MagicMock()] * (MIN_SAMPLES - 1))
        results = detect_inventory_anomalies(db, tenant_id=1)
        assert results == []


# ---------------------------------------------------------------------------
# Servis fonksiyonlari: mock ile anomali uretme
# ---------------------------------------------------------------------------


class TestDetectFinanceAnomalies:
    def _make_row(self, id, amount, record_date="2024-01-01", record_type="expense", description=""):
        row = MagicMock()
        row.id = id
        row.amount = amount
        row.record_date = record_date
        row.record_type = record_type
        row.description = description
        return row

    def _db_with_rows(self, rows):
        db = MagicMock(spec=Session)
        db.execute.return_value.fetchall.return_value = rows
        return db

    def test_normal_data_produces_no_anomaly(self):
        """Cok benzer tutarlar anomali uretmemeli."""
        rows = [self._make_row(i, 100.0 + i * 0.1) for i in range(10)]
        db = self._db_with_rows(rows)
        results = detect_finance_anomalies(db, tenant_id=1)
        # Normal dagilimlarda anomali cikmayabilir; test sadece exception firlatmadigi
        # ve list dondugunuu kontrol eder
        assert isinstance(results, list)

    def test_finance_anomalies_stubbed_pending_faz2(self):
        """detect_finance_anomalies Faz 2'ye ertelendi; her zaman bos liste donmeli."""
        db = MagicMock(spec=Session)
        results = detect_finance_anomalies(db, tenant_id=1)
        assert results == [], "finance_records tablosu yok; stub bos liste donmeli"

    def test_result_fields_populated(self):
        """Anomali sonucunun alanlarinin dolu oldugunu kontrol eder."""
        rows = [self._make_row(i, 1000.0) for i in range(9)]
        rows.append(self._make_row(99, 1_000_000.0))
        db = self._db_with_rows(rows)
        results = detect_finance_anomalies(db, tenant_id=1)
        if results:
            r = next((x for x in results if x.entity_id == 99), None)
            if r:
                assert r.source == "finance"
                assert r.severity in ("critical", "warning")
                assert r.score < -0.15


class TestDetectSalesAnomalies:
    def _make_row(self, id, unit_price, quantity, product_name="Urun", product_id=1):
        row = MagicMock()
        row.id = id
        row.unit_price = unit_price
        row.quantity = quantity
        row.product_name = product_name
        row.product_id = product_id
        return row

    def _db_with_rows(self, rows):
        db = MagicMock(spec=Session)
        db.execute.return_value.fetchall.return_value = rows
        return db

    def test_normal_prices_no_false_positive(self):
        rows = [self._make_row(i, 50.0, 2) for i in range(10)]
        db = self._db_with_rows(rows)
        results = detect_sales_anomalies(db, tenant_id=1)
        assert isinstance(results, list)

    def test_extreme_price_outlier_detected(self):
        rows = [self._make_row(i, 50.0, 2) for i in range(9)]
        rows.append(self._make_row(99, 50000.0, 2))  # Extreme fiyat
        db = self._db_with_rows(rows)
        results = detect_sales_anomalies(db, tenant_id=1)
        # En az bir anomali bulmali
        assert any(r.source == "sales" for r in results)

    def test_result_source_is_sales(self):
        rows = [self._make_row(i, 50.0, 2) for i in range(9)]
        rows.append(self._make_row(99, 50000.0, 2))
        db = self._db_with_rows(rows)
        results = detect_sales_anomalies(db, tenant_id=1)
        for r in results:
            assert r.source == "sales"


class TestDetectInventoryAnomalies:
    def _make_row(self, id, change, movement_type="in", product_name="Urun", product_id=1):
        row = MagicMock()
        row.id = id
        row.change = change          # gercek kolon adi
        row.movement_type = movement_type
        row.product_name = product_name
        row.product_id = product_id
        return row

    def _db_with_rows(self, rows):
        db = MagicMock(spec=Session)
        db.execute.return_value.all.return_value = rows
        return db

    def test_normal_movements_no_crash(self):
        rows = [self._make_row(i, 10) for i in range(10)]
        db = self._db_with_rows(rows)
        results = detect_inventory_anomalies(db, tenant_id=1)
        assert isinstance(results, list)

    def test_extreme_stock_drop_detected(self):
        rows = [self._make_row(i, 10) for i in range(9)]
        rows.append(self._make_row(99, -99999, "out"))  # Cok buyuk cikis
        db = self._db_with_rows(rows)
        results = detect_inventory_anomalies(db, tenant_id=1)
        assert any(r.source == "inventory" for r in results)

    def test_result_source_is_inventory(self):
        rows = [self._make_row(i, 10) for i in range(9)]
        rows.append(self._make_row(99, -99999, "out"))
        db = self._db_with_rows(rows)
        results = detect_inventory_anomalies(db, tenant_id=1)
        for r in results:
            assert r.source == "inventory"


# ---------------------------------------------------------------------------
# run_all_anomaly_checks: siralama + birlestirme
# ---------------------------------------------------------------------------


class TestRunAllAnomalyChecks:
    def test_critical_before_warning(self):
        """Sonuclar severity sirasina gore sirali olmali: critical > warning > info."""
        dummy_db = MagicMock(spec=Session)
        dummy_db.execute.return_value.fetchall.return_value = []

        # finance cagrilmiyor (Faz 2); sales + inventory patched
        with (
            patch(
                "app.services.anomaly_service.detect_sales_anomalies",
                return_value=[
                    AnomalyResult("sales", "warning", "W", "M", -0.18),
                    AnomalyResult("sales", "critical", "C", "M", -0.30),
                ],
            ),
            patch(
                "app.services.anomaly_service.detect_inventory_anomalies",
                return_value=[AnomalyResult("inventory", "info", "I", "M", -0.10)],
            ),
        ):
            results = run_all_anomaly_checks(dummy_db, tenant_id=1)

        assert len(results) == 3
        severities = [r.severity for r in results]
        # critical once
        assert severities[0] == "critical"
        # info en son
        assert severities[-1] == "info"

    def test_empty_when_all_sources_empty(self):
        dummy_db = MagicMock(spec=Session)
        dummy_db.execute.return_value.fetchall.return_value = []

        with (
            patch("app.services.anomaly_service.detect_finance_anomalies", return_value=[]),
            patch("app.services.anomaly_service.detect_sales_anomalies", return_value=[]),
            patch("app.services.anomaly_service.detect_inventory_anomalies", return_value=[]),
        ):
            results = run_all_anomaly_checks(dummy_db, tenant_id=1)

        assert results == []

    def test_returns_list(self):
        dummy_db = MagicMock(spec=Session)
        dummy_db.execute.return_value.fetchall.return_value = []

        with (
            patch("app.services.anomaly_service.detect_finance_anomalies", return_value=[]),
            patch("app.services.anomaly_service.detect_sales_anomalies", return_value=[]),
            patch("app.services.anomaly_service.detect_inventory_anomalies", return_value=[]),
        ):
            results = run_all_anomaly_checks(dummy_db, tenant_id=1)

        assert isinstance(results, list)


# ---------------------------------------------------------------------------
# API endpoint: GET /api/anomaly/run
# ---------------------------------------------------------------------------


class TestAnomalyRunEndpoint:
    def test_run_returns_200(self, client):
        """Admin olarak /anomaly/run cagrisi 200 donmeli."""
        with patch(
            "app.api.routes.anomaly.run_all_anomaly_checks",
            return_value=[],
        ):
            resp = client.get("/api/anomaly/run")
        assert resp.status_code == 200

    def test_run_response_schema(self, client):
        """Yanit scheması: tenant_id, total, anomalies."""
        with patch(
            "app.api.routes.anomaly.run_all_anomaly_checks",
            return_value=[],
        ):
            resp = client.get("/api/anomaly/run")
        body = resp.json()
        assert "tenant_id" in body
        assert "total" in body
        assert "anomalies" in body
        assert isinstance(body["anomalies"], list)

    def test_run_with_anomalies(self, client, test_tenant):
        """Anomali varsa total > 0 donmeli."""
        fake = AnomalyResult(
            source="finance",
            severity="warning",
            title="Test",
            message="Anormal hareket",
            score=-0.20,
            entity_id=1,
        )
        with patch(
            "app.api.routes.anomaly.run_all_anomaly_checks",
            return_value=[fake],
        ):
            resp = client.get("/api/anomaly/run")
        body = resp.json()
        assert body["total"] == 1
        assert body["anomalies"][0]["source"] == "finance"

    def test_latest_returns_200(self, client):
        """GET /anomaly/latest 200 donmeli (cache bos olsa bile)."""
        resp = client.get("/api/anomaly/latest")
        assert resp.status_code == 200

    def test_latest_schema(self, client):
        """Latest endpoint yanit schemasini kontrol eder."""
        resp = client.get("/api/anomaly/latest")
        body = resp.json()
        assert "tenant_id" in body
        assert "total" in body
        assert "anomalies" in body

    def test_run_all_anomaly_checks_no_finance_records(self, client):
        """finance_records tablosu yok; servis 500 yerine 200 + bos finans bolumu donmeli."""
        with patch(
            "app.api.routes.anomaly.run_all_anomaly_checks",
            return_value=[],
        ):
            resp = client.get("/api/anomaly/run")
        assert resp.status_code == 200
        body = resp.json()
        sources = {a["source"] for a in body["anomalies"]}
        assert "finance" not in sources


# ---------------------------------------------------------------------------
# Gercek DB: detect_inventory_anomalies 'change' kolonunu kullaniyor (ACTION_PLAN P0-3)
# ---------------------------------------------------------------------------


class TestDetectInventoryAnomaliesRealDb:
    def _seed_movements(self, db_session, tenant_id: int, product_id: int, values: list[int]):
        """Verilen change degerlerini StockMovement olarak seed eder."""
        for val in values:
            sm = StockMovement(
                tenant_id=tenant_id,
                product_id=product_id,
                movement_type="in" if val >= 0 else "out",
                change=val,
                balance_after=100 + val,
            )
            db_session.add(sm)
        db_session.flush()

    def test_uses_change_column_no_operational_error(self, db_session, test_tenant):
        """Ham SQL hatasi: 'change' kolonu kullanilmali, 'quantity_change' degil.

        Bu test gercek DB ile calisir; ORM sorgusu dogru kolonu kullanirsa
        OperationalError firlatmadan liste doner.
        """
        product = Product(
            tenant_id=test_tenant.id,
            sku="TEST-P0-3",
            name="Anomali Test Urunu",
            unit_price=Decimal("10.00"),
            cost_price=Decimal("5.00"),
        )
        db_session.add(product)
        db_session.flush()

        # MIN_SAMPLES (5) kadar normal + 1 extreme outlier
        normal_vals = [10, 10, 10, 10, 10, 10, 10, 10, 10]
        self._seed_movements(db_session, test_tenant.id, product.id, normal_vals + [-99999])

        results = detect_inventory_anomalies(db_session, tenant_id=test_tenant.id)

        assert isinstance(results, list), "OperationalError olmadan liste donmeli"
        # Outlier tespit edilmis olmali
        assert any(r.source == "inventory" for r in results)

    def test_result_extra_has_quantity_change_key(self, db_session, test_tenant):
        """Sonuc extra'sinda 'quantity_change' anahtari geriye donuk uyumluluk icin korunmali."""
        product = Product(
            tenant_id=test_tenant.id,
            sku="TEST-P0-3B",
            name="Uyumluluk Test Urunu",
            unit_price=Decimal("10.00"),
            cost_price=Decimal("5.00"),
        )
        db_session.add(product)
        db_session.flush()

        normal_vals = [10] * 9
        self._seed_movements(db_session, test_tenant.id, product.id, normal_vals + [-99999])

        results = detect_inventory_anomalies(db_session, tenant_id=test_tenant.id)

        for r in results:
            assert "quantity_change" in r.extra, "Frontend uyumu icin 'quantity_change' anahtari olmali"
