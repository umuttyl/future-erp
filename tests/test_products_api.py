"""Urun endpointleri için iskelet testler."""

from sqlalchemy.orm import Session

from app.models.product import Product


def test_list_products_empty(client):
    resp = client.get("/api/products")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_product_not_found(client):
    resp = client.get("/api/products/99999")
    assert resp.status_code == 404
    body = resp.json()
    assert body["error"]["code"] == "PRODUCT_NOT_FOUND"


def test_list_products_returns_rows(client, db_session: Session, test_tenant):
    db_session.add(
        Product(
            tenant_id=test_tenant.id,
            sku="SKU-T1",
            name="Test Ürün",
            category=None,
            unit_price=10,
            cost_price=5,
            stock_quantity=3,
            reorder_level=1,
        )
    )
    db_session.flush()

    resp = client.get("/api/products")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["sku"] == "SKU-T1"
    assert data[0]["name"] == "Test Ürün"
