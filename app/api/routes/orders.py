from typing import List, Optional

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import NotFoundException, ValidationException
from app.core.permissions import ORDERS_READ, ORDERS_WRITE
from app.schemas.orders import (
    CustomerOrderCreate,
    CustomerOrderOut,
    CustomerOrderUpdate,
    DeliveryNoteCreate,
    DeliveryNoteOut,
    InvoiceCreate,
    InvoicePrintData,
    InvoiceOut,
)
from app.services.orders_service import orders_service

router = APIRouter()


# ─── Customer Orders ──────────────────────────────────────────────────────────

@router.get("", response_model=List[CustomerOrderOut])
def list_orders(
    order_status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(ORDERS_READ)),
    db: Session = Depends(get_db),
):
    return orders_service.list_orders(db, ctx.tenant_id, status=order_status, skip=skip, limit=limit)


@router.post("", response_model=CustomerOrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    body: CustomerOrderCreate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    principal: AuthPrincipal = Depends(require_permission(ORDERS_WRITE)),
    db: Session = Depends(get_db),
):
    try:
        return orders_service.create_order(db, ctx.tenant_id, body, created_by_user_id=principal.user_id)
    except ValueError as e:
        raise ValidationException(str(e))


@router.get("/{order_id}", response_model=CustomerOrderOut)
def get_order(
    order_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(ORDERS_READ)),
    db: Session = Depends(get_db),
):
    order = orders_service.get_order(db, ctx.tenant_id, order_id)
    if not order:
        raise NotFoundException("Order not found")
    return order


@router.patch("/{order_id}", response_model=CustomerOrderOut)
def update_order(
    order_id: int,
    body: CustomerOrderUpdate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(ORDERS_WRITE)),
    db: Session = Depends(get_db),
):
    order = orders_service.get_order(db, ctx.tenant_id, order_id)
    if not order:
        raise NotFoundException("Order not found")
    try:
        return orders_service.update_order(db, ctx.tenant_id, order, body)
    except ValueError as e:
        raise ValidationException(str(e))


@router.post("/{order_id}/confirm", response_model=CustomerOrderOut)
def confirm_order(
    order_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(ORDERS_WRITE)),
    db: Session = Depends(get_db),
):
    order = orders_service.get_order(db, ctx.tenant_id, order_id)
    if not order:
        raise NotFoundException("Order not found")
    try:
        return orders_service.confirm_order(db, ctx.tenant_id, order)
    except ValueError as e:
        raise ValidationException(str(e))


@router.post("/{order_id}/cancel", response_model=CustomerOrderOut)
def cancel_order(
    order_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(ORDERS_WRITE)),
    db: Session = Depends(get_db),
):
    order = orders_service.get_order(db, ctx.tenant_id, order_id)
    if not order:
        raise NotFoundException("Order not found")
    try:
        return orders_service.cancel_order(db, ctx.tenant_id, order)
    except ValueError as e:
        raise ValidationException(str(e))


# ─── Delivery Notes ───────────────────────────────────────────────────────────

@router.get("/{order_id}/delivery-notes", response_model=List[DeliveryNoteOut])
def list_delivery_notes(
    order_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(ORDERS_READ)),
    db: Session = Depends(get_db),
):
    order = orders_service.get_order(db, ctx.tenant_id, order_id)
    if not order:
        raise NotFoundException("Order not found")
    return orders_service.list_delivery_notes(db, ctx.tenant_id, order_id)


@router.post(
    "/{order_id}/delivery-notes",
    response_model=DeliveryNoteOut,
    status_code=status.HTTP_201_CREATED,
)
def create_delivery_note(
    order_id: int,
    body: DeliveryNoteCreate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    principal: AuthPrincipal = Depends(require_permission(ORDERS_WRITE)),
    db: Session = Depends(get_db),
):
    order = orders_service.get_order(db, ctx.tenant_id, order_id)
    if not order:
        raise NotFoundException("Order not found")
    try:
        return orders_service.create_delivery_note(
            db, ctx.tenant_id, order, body, created_by_user_id=principal.user_id
        )
    except ValueError as e:
        raise ValidationException(str(e))


# ─── Invoices ─────────────────────────────────────────────────────────────────

@router.get("/{order_id}/invoices", response_model=List[InvoiceOut])
def list_invoices(
    order_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(ORDERS_READ)),
    db: Session = Depends(get_db),
):
    order = orders_service.get_order(db, ctx.tenant_id, order_id)
    if not order:
        raise NotFoundException("Order not found")
    return orders_service.list_invoices(db, ctx.tenant_id, order_id)


@router.post(
    "/{order_id}/invoices",
    response_model=InvoiceOut,
    status_code=status.HTTP_201_CREATED,
)
def create_invoice(
    order_id: int,
    body: InvoiceCreate,
    delivery_note_id: Optional[int] = None,
    ctx: TenantContext = Depends(get_tenant_ctx),
    principal: AuthPrincipal = Depends(require_permission(ORDERS_WRITE)),
    db: Session = Depends(get_db),
):
    order = orders_service.get_order(db, ctx.tenant_id, order_id)
    if not order:
        raise NotFoundException("Order not found")
    try:
        return orders_service.create_invoice(
            db, ctx.tenant_id, order, body,
            delivery_note_id=delivery_note_id,
            created_by_user_id=principal.user_id,
        )
    except ValueError as e:
        raise ValidationException(str(e))


@router.get("/{order_id}/invoices/{invoice_id}/print-data", response_model=InvoicePrintData)
def get_invoice_print_data(
    order_id: int,
    invoice_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(ORDERS_READ)),
    db: Session = Depends(get_db),
):
    data = orders_service.get_invoice_print_data(db, ctx.tenant_id, order_id, invoice_id)
    if not data:
        raise NotFoundException("Invoice not found")
    return data


@router.get("/{order_id}/invoices/{invoice_id}/efatura-xml")
def download_efatura_xml(
    order_id: int,
    invoice_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(ORDERS_READ)),
    db: Session = Depends(get_db),
):
    data = orders_service.get_invoice_print_data(db, ctx.tenant_id, order_id, invoice_id)
    if not data:
        raise NotFoundException("Invoice not found")
    xml = _build_efatura_xml(data)
    filename = f"efatura_{data.invoice_no.replace('/', '-')}.xml"
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_efatura_xml(d: InvoicePrintData) -> str:
    import uuid

    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    doc_uuid = str(uuid.uuid4()).upper()
    issue_date = d.invoice_date.strftime("%Y-%m-%d")

    invoice_lines: list[str] = []
    for item in d.items:
        net = item.line_total - item.tax_amount
        invoice_lines.append(f"""    <cac:InvoiceLine>
      <cbc:ID>{item.product_id}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">{item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="{esc(d.currency)}">{net:.2f}</cbc:LineExtensionAmount>
      <cac:Item><cbc:Name>{esc(item.product_name)}</cbc:Name></cac:Item>
      <cac:Price><cbc:PriceAmount currencyID="{esc(d.currency)}">{item.unit_price:.2f}</cbc:PriceAmount></cac:Price>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="{esc(d.currency)}">{item.tax_amount:.2f}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="{esc(d.currency)}">{net:.2f}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="{esc(d.currency)}">{item.tax_amount:.2f}</cbc:TaxAmount>
          <cbc:Percent>{item.tax_rate:.0f}</cbc:Percent>
          <cac:TaxCategory>
            <cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
    </cac:InvoiceLine>""")

    lines_xml = "\n".join(invoice_lines)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TEMELFATURA</cbc:ProfileID>
  <cbc:ID>{esc(d.invoice_no)}</cbc:ID>
  <cbc:UUID>{doc_uuid}</cbc:UUID>
  <cbc:IssueDate>{issue_date}</cbc:IssueDate>
  <cbc:IssueTime>00:00:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>{esc(d.currency)}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>{esc(d.company_name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>{esc(d.company_address or "")}</cbc:StreetName></cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>{esc(d.company_tax_number or "")}</cbc:CompanyID>
        <cac:TaxScheme><cbc:Name>VKN</cbc:Name></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>{esc(d.customer_name or "")}</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="{esc(d.currency)}">{d.tax_total:.2f}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="{esc(d.currency)}">{d.subtotal:.2f}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="{esc(d.currency)}">{d.subtotal:.2f}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="{esc(d.currency)}">{d.total_amount:.2f}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="{esc(d.currency)}">{d.total_amount:.2f}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
{lines_xml}
</Invoice>"""
