"""Bulk data import endpoints — Excel and CSV file upload."""
from __future__ import annotations

import io
import re
from decimal import Decimal, InvalidOperation
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, require_permission
from app.core.permissions import CATALOG_PRODUCT_WRITE, CUSTOMERS_WRITE
from app.models.customer import Customer
from app.models.product import Product

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ImportRowError(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: List[ImportRowError]


# ─── Column normalisation ──────────────────────────────────────────────────────

_PRODUCT_COL_MAP: dict[str, str] = {
    # sku
    "SKU": "sku", "Ürün Kodu": "sku", "urun_kodu": "sku",
    "Kod": "sku", "kod": "sku", "Code": "sku", "code": "sku", "sku": "sku",
    # name
    "Ürün Adı": "name", "urun_adi": "name", "Ad": "name",
    "Name": "name", "name": "name", "product_name": "name",
    # category
    "Kategori": "category", "category": "category", "Category": "category",
    # unit_price
    "Birim Fiyat": "unit_price", "birim_fiyat": "unit_price",
    "Fiyat": "unit_price", "Price": "unit_price", "unit_price": "unit_price",
    # cost_price
    "Maliyet": "cost_price", "maliyet": "cost_price",
    "Cost": "cost_price", "cost_price": "cost_price", "Maliyet Fiyatı": "cost_price",
    # tax_rate
    "KDV (%)": "tax_rate", "KDV": "tax_rate", "kdv": "tax_rate",
    "Tax Rate": "tax_rate", "tax_rate": "tax_rate", "KDV Oranı": "tax_rate",
    # stock_quantity
    "Stok": "stock_quantity", "stock_quantity": "stock_quantity",
    "Miktar": "stock_quantity", "Stock": "stock_quantity", "Stok Miktarı": "stock_quantity",
    # reorder_level
    "Min. Stok": "reorder_level", "reorder_level": "reorder_level",
    "Reorder Level": "reorder_level", "Minimum Stok": "reorder_level",
}

_CUSTOMER_COL_MAP: dict[str, str] = {
    # name
    "Müşteri Adı": "name", "musteri_adi": "name",
    "Ad": "name", "Name": "name", "name": "name", "customer_name": "name",
    # email
    "E-posta": "email", "email": "email", "Email": "email", "E-Mail": "email",
    # phone
    "Telefon": "phone", "phone": "phone", "Phone": "phone", "Tel": "phone",
    # address
    "Adres": "address", "address": "address", "Address": "address",
    # customer_type
    "Müşteri Tipi": "customer_type", "customer_type": "customer_type",
    "Type": "customer_type", "Tip": "customer_type",
    # notes
    "Notlar": "notes", "notes": "notes", "Notes": "notes",
}


def _normalise_cols(df: pd.DataFrame, col_map: dict[str, str]) -> pd.DataFrame:
    rename: dict[str, str] = {}
    for raw_col in df.columns:
        stripped = str(raw_col).strip()
        if stripped in col_map:
            rename[raw_col] = col_map[stripped]
    return df.rename(columns=rename)


async def _read_upload(file: UploadFile) -> pd.DataFrame:
    content = await file.read()
    fn = (file.filename or "").lower()
    if fn.endswith(".csv"):
        try:
            return pd.read_csv(io.BytesIO(content), dtype=str)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"CSV parse error: {exc}")
    else:
        try:
            return pd.read_excel(io.BytesIO(content), dtype=str)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Excel parse error: {exc}")


def _decimal(val: object, default: Decimal = Decimal("0")) -> Decimal:
    if val is None or str(val).strip() in ("", "nan", "NaN", "None"):
        return default
    try:
        cleaned = re.sub(r"[^\d.,\-]", "", str(val)).replace(",", ".")
        if not cleaned:
            return default
        return Decimal(cleaned)
    except InvalidOperation:
        return default


def _int(val: object, default: int = 0) -> int:
    try:
        s = str(val).strip()
        if s in ("", "nan", "NaN", "None"):
            return default
        return int(float(s.replace(",", ".")))
    except (ValueError, TypeError):
        return default


def _str(val: object) -> Optional[str]:
    s = str(val).strip()
    return None if s.lower() in ("", "nan", "none") else s


# ─── Templates ────────────────────────────────────────────────────────────────

@router.get("/template/products")
def products_template(
    _: AuthPrincipal = Depends(require_permission(CATALOG_PRODUCT_WRITE)),
) -> StreamingResponse:
    cols = ["SKU", "Product Name", "Category", "Unit Price", "Cost", "VAT (%)", "Stock", "Min. Stock"]
    sample = {
        "SKU": "PROD-001", "Product Name": "Sample Product", "Category": "General",
        "Unit Price": "150.00", "Cost": "80.00", "VAT (%)": "20",
        "Stock": "100", "Min. Stock": "10",
    }
    df = pd.DataFrame([sample], columns=cols)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        df.to_excel(w, index=False, sheet_name="Products")
    buf.seek(0)
    return StreamingResponse(
        buf,
        headers={
            "Content-Disposition": 'attachment; filename="product_template.xlsx"',
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
    )


@router.get("/template/customers")
def customers_template(
    _: AuthPrincipal = Depends(require_permission(CUSTOMERS_WRITE)),
) -> StreamingResponse:
    cols = ["Customer Name", "Email", "Phone", "Address", "Customer Type", "Notes"]
    sample = {
        "Customer Name": "Sample Company Ltd.", "Email": "info@sample.com",
        "Phone": "+1 555 000 0000", "Address": "123 Main St, City",
        "Customer Type": "B2B", "Notes": "",
    }
    df = pd.DataFrame([sample], columns=cols)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        df.to_excel(w, index=False, sheet_name="Customers")
    buf.seek(0)
    return StreamingResponse(
        buf,
        headers={
            "Content-Disposition": 'attachment; filename="customer_template.xlsx"',
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
    )


# ─── Products import ──────────────────────────────────────────────────────────

@router.post("/products", response_model=ImportResult)
async def import_products(
    file: UploadFile = File(...),
    principal: AuthPrincipal = Depends(require_permission(CATALOG_PRODUCT_WRITE)),
    db: Session = Depends(get_db),
) -> ImportResult:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")
    df = await _read_upload(file)
    df = _normalise_cols(df, _PRODUCT_COL_MAP)

    if "name" not in df.columns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Required column missing: 'Product Name' (or 'name').",
        )

    existing_skus: set[str] = set(
        db.scalars(select(Product.sku).where(Product.tenant_id == principal.tenant_id))
    )

    imported = 0
    skipped = 0
    errors: list[ImportRowError] = []

    for idx, row in df.iterrows():
        row_num = int(idx) + 2  # 1-based + header row
        name = _str(row.get("name"))
        if not name:
            errors.append(ImportRowError(row=row_num, message="Product name is empty — row skipped."))
            continue

        sku_raw = _str(row.get("sku"))
        if sku_raw and sku_raw in existing_skus:
            skipped += 1
            continue

        # Auto-generate SKU if not provided
        if not sku_raw:
            base = re.sub(r"[^A-Z0-9]", "", name.upper())[:8] or "PRD"
            candidate = base
            n = 1
            while candidate in existing_skus:
                candidate = f"{base}-{n}"
                n += 1
            sku_raw = candidate

        product = Product(
            tenant_id=principal.tenant_id,
            sku=sku_raw,
            name=name,
            category=_str(row.get("category")),
            unit_price=_decimal(row.get("unit_price"), Decimal("0")),
            cost_price=_decimal(row.get("cost_price"), Decimal("0")),
            tax_rate=_decimal(row.get("tax_rate"), Decimal("20")),
            stock_quantity=_int(row.get("stock_quantity"), 0),
            reorder_level=_int(row.get("reorder_level"), 0),
        )
        db.add(product)
        existing_skus.add(sku_raw)
        imported += 1

    db.commit()
    return ImportResult(imported=imported, skipped=skipped, errors=errors)


# ─── Customers import ─────────────────────────────────────────────────────────

@router.post("/customers", response_model=ImportResult)
async def import_customers(
    file: UploadFile = File(...),
    principal: AuthPrincipal = Depends(require_permission(CUSTOMERS_WRITE)),
    db: Session = Depends(get_db),
) -> ImportResult:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")
    df = await _read_upload(file)
    df = _normalise_cols(df, _CUSTOMER_COL_MAP)

    if "name" not in df.columns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Required column missing: 'Customer Name' (or 'name').",
        )

    imported = 0
    skipped = 0
    errors: list[ImportRowError] = []

    for idx, row in df.iterrows():
        row_num = int(idx) + 2
        name = _str(row.get("name"))
        if not name:
            errors.append(ImportRowError(row=row_num, message="Customer name is empty — row skipped."))
            continue

        ctype_raw = (_str(row.get("customer_type")) or "B2B").upper()
        ctype = ctype_raw if ctype_raw in ("B2B", "B2C", "RETAIL", "WHOLESALE") else "B2B"

        customer = Customer(
            tenant_id=principal.tenant_id,
            name=name,
            email=_str(row.get("email")),
            phone=_str(row.get("phone")),
            address=_str(row.get("address")),
            customer_type=ctype,
            notes=_str(row.get("notes")),
        )
        db.add(customer)
        imported += 1

    db.commit()
    return ImportResult(imported=imported, skipped=skipped, errors=errors)
