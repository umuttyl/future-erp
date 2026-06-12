from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.account_movement import AccountMovement
from app.models.audit_log import AuditLog
from app.models.customer_order import CustomerOrder, CustomerOrderItem
from app.models.delivery_note import DeliveryNote, DeliveryNoteItem
from app.models.invoice import Invoice
from app.models.product import Product

from app.models.tenant import Tenant
from app.schemas.orders import (
    CustomerOrderCreate,
    CustomerOrderUpdate,
    DeliveryNoteCreate,
    InvoiceCreate,
    InvoicePrintData,
    InvoicePrintItem,
)



class OrdersService:

    # ─── Customer Orders ──────────────────────────────────────────────────────

    def list_orders(
        self,
        db: Session,
        tenant_id: int,
        *,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[CustomerOrder]:
        stmt = (
            select(CustomerOrder)
            .options(selectinload(CustomerOrder.items))
            .where(CustomerOrder.tenant_id == tenant_id)
            .order_by(CustomerOrder.id.desc())
            .offset(skip)
            .limit(limit)
        )
        if status:
            stmt = stmt.where(CustomerOrder.status == status)
        return list(db.scalars(stmt).all())

    def get_order(self, db: Session, tenant_id: int, order_id: int) -> Optional[CustomerOrder]:
        stmt = (
            select(CustomerOrder)
            .options(selectinload(CustomerOrder.items))
            .where(CustomerOrder.tenant_id == tenant_id, CustomerOrder.id == order_id)
        )
        return db.scalar(stmt)

    def create_order(
        self,
        db: Session,
        tenant_id: int,
        data: CustomerOrderCreate,
        created_by_user_id: Optional[int] = None,
    ) -> CustomerOrder:
        order = CustomerOrder(
            tenant_id=tenant_id,
            order_no=data.order_no,
            order_date=data.order_date,
            customer_id=data.customer_id,
            customer_name=data.customer_name,
            notes=data.notes,
            status="draft",
            created_by_user_id=created_by_user_id,
        )
        db.add(order)
        db.flush()

        total_amount = Decimal("0")
        tax_total = Decimal("0")

        for i in data.items:
            product: Optional[Product] = db.scalar(
                select(Product).where(Product.tenant_id == tenant_id, Product.id == i.product_id)
            )
            if product is None:
                raise ValueError(f"Ürün bulunamadı: {i.product_id}")

            tax_rate = (
                i.tax_rate if i.tax_rate is not None else product.tax_rate
            ).quantize(Decimal("0.01"))
            line_total = (i.unit_price * i.quantity).quantize(Decimal("0.01"))
            tax_amount = (line_total * tax_rate / (100 + tax_rate)).quantize(Decimal("0.01"))

            item = CustomerOrderItem(
                tenant_id=tenant_id,
                order_id=order.id,
                product_id=i.product_id,
                quantity=i.quantity,
                unit_price=i.unit_price,
                tax_rate=tax_rate,
                line_total=line_total,
                tax_amount=tax_amount,
            )
            db.add(item)
            total_amount += line_total
            tax_total += tax_amount

        order.total_amount = total_amount
        order.tax_total = tax_total
        db.commit()
        db.refresh(order)
        return order

    def update_order(
        self,
        db: Session,
        tenant_id: int,
        order: CustomerOrder,
        data: CustomerOrderUpdate,
    ) -> CustomerOrder:
        if order.tenant_id != tenant_id:
            raise ValueError("tenant mismatch")
        payload = data.model_dump(exclude_unset=True)
        for k, v in payload.items():
            setattr(order, k, v)
        db.commit()
        db.refresh(order)
        return order

    def confirm_order(self, db: Session, tenant_id: int, order: CustomerOrder) -> CustomerOrder:
        if order.tenant_id != tenant_id:
            raise ValueError("tenant mismatch")
        if order.status != "draft":
            raise ValueError(f"Sipariş onaylanamaz, mevcut durum: {order.status}")
        order.status = "confirmed"
        db.commit()
        db.refresh(order)
        return order

    def cancel_order(self, db: Session, tenant_id: int, order: CustomerOrder) -> CustomerOrder:
        if order.tenant_id != tenant_id:
            raise ValueError("tenant mismatch")
        if order.status in ("invoiced", "cancelled"):
            raise ValueError(f"Sipariş iptal edilemez, mevcut durum: {order.status}")
        order.status = "cancelled"
        db.commit()
        db.refresh(order)
        return order

    # ─── Delivery Notes ───────────────────────────────────────────────────────

    def list_delivery_notes(
        self, db: Session, tenant_id: int, order_id: int
    ) -> List[DeliveryNote]:
        stmt = (
            select(DeliveryNote)
            .where(DeliveryNote.tenant_id == tenant_id, DeliveryNote.order_id == order_id)
            .order_by(DeliveryNote.id.desc())
        )
        return list(db.scalars(stmt).all())

    def get_delivery_note(
        self, db: Session, tenant_id: int, dn_id: int
    ) -> Optional[DeliveryNote]:
        stmt = select(DeliveryNote).where(
            DeliveryNote.tenant_id == tenant_id, DeliveryNote.id == dn_id
        )
        return db.scalar(stmt)

    def create_delivery_note(
        self,
        db: Session,
        tenant_id: int,
        order: CustomerOrder,
        data: DeliveryNoteCreate,
        created_by_user_id: Optional[int] = None,
    ) -> DeliveryNote:
        if order.tenant_id != tenant_id:
            raise ValueError("tenant mismatch")
        if order.status not in ("confirmed", "shipped"):
            raise ValueError(f"İrsaliye oluşturmak için sipariş onaylı olmalıdır (mevcut: {order.status})")

        dn = DeliveryNote(
            tenant_id=tenant_id,
            order_id=order.id,
            delivery_no=data.delivery_no,
            delivery_date=data.delivery_date,
            status="draft",
            notes=data.notes,
            created_by_user_id=created_by_user_id,
        )
        db.add(dn)
        db.flush()

        for i in data.items:
            product: Optional[Product] = db.scalar(
                select(Product).where(Product.tenant_id == tenant_id, Product.id == i.product_id)
            )
            if product is None:
                raise ValueError(f"Ürün bulunamadı: {i.product_id}")
            new_stock = (product.stock_quantity or 0) - i.quantity
            if new_stock < 0:
                raise ValueError(
                    f"Yetersiz stok: {product.name} - mevcut {product.stock_quantity}, çıkış {i.quantity}"
                )
            product.stock_quantity = new_stock

            db.add(DeliveryNoteItem(
                tenant_id=tenant_id,
                delivery_note_id=dn.id,
                order_item_id=i.order_item_id,
                product_id=i.product_id,
                quantity=i.quantity,
            ))

        dn.status = "sent"
        if order.status == "confirmed":
            order.status = "shipped"

        db.commit()
        db.refresh(dn)
        return dn

    # ─── Invoices ─────────────────────────────────────────────────────────────

    def list_invoices(
        self, db: Session, tenant_id: int, order_id: int
    ) -> List[Invoice]:
        stmt = (
            select(Invoice)
            .where(Invoice.tenant_id == tenant_id, Invoice.order_id == order_id)
            .order_by(Invoice.id.desc())
        )
        return list(db.scalars(stmt).all())

    def get_invoice(self, db: Session, tenant_id: int, invoice_id: int) -> Optional[Invoice]:
        stmt = select(Invoice).where(
            Invoice.tenant_id == tenant_id, Invoice.id == invoice_id
        )
        return db.scalar(stmt)

    def create_invoice(
        self,
        db: Session,
        tenant_id: int,
        order: CustomerOrder,
        data: InvoiceCreate,
        delivery_note_id: Optional[int] = None,
        created_by_user_id: Optional[int] = None,
    ) -> Invoice:
        if order.tenant_id != tenant_id:
            raise ValueError("tenant mismatch")
        if order.status not in ("confirmed", "shipped"):
            raise ValueError(f"Fatura oluşturmak için sipariş onaylı/sevk edilmiş olmalıdır (mevcut: {order.status})")

        invoice = Invoice(
            tenant_id=tenant_id,
            order_id=order.id,
            delivery_note_id=delivery_note_id,
            invoice_no=data.invoice_no,
            invoice_date=data.invoice_date,
            customer_id=order.customer_id,
            customer_name=order.customer_name,
            total_amount=order.total_amount,
            tax_total=order.tax_total,
            status="draft",
            notes=data.notes,
            created_by_user_id=created_by_user_id,
        )
        db.add(invoice)
        db.flush()

        # Cari borç hareketi (Accounts Receivable)
        if order.customer_id or order.customer_name:
            db.add(AccountMovement(
                tenant_id=tenant_id,
                customer_id=order.customer_id,
                movement_type="debit",
                amount=order.total_amount,
                description=f"Fatura {data.invoice_no} – {order.customer_name or 'Sipariş'} {order.order_no}",
                reference=data.invoice_no,
                movement_date=data.invoice_date,
            ))

        # NOT: SalesRecord burada oluşturulmaz.
        # Finance P&L kaydı yalnızca müşteriden ödeme tahsil edildiğinde oluşur (cash basis).
        # Ödeme alındığında accounts.py → record_payment() içinde SalesRecord + SalesItems yaratılır.
        order.status = "invoiced"
        invoice.status = "sent"

        if created_by_user_id:
            db.add(AuditLog(
                actor_tenant_id=tenant_id,
                actor_user_id=created_by_user_id,
                action="orders.invoice",
                target_entity_type="invoice",
                target_entity_id=invoice.id,
                payload={"invoice_no": data.invoice_no, "order_no": order.order_no, "total": float(order.total_amount)},
            ))

        db.commit()
        db.refresh(invoice)
        return invoice

    def get_invoice_print_data(
        self,
        db: Session,
        tenant_id: int,
        order_id: int,
        invoice_id: int,
    ) -> Optional[InvoicePrintData]:
        invoice = self.get_invoice(db, tenant_id, invoice_id)
        if invoice is None or invoice.order_id != order_id:
            return None
        order = self.get_order(db, tenant_id, order_id)
        if order is None:
            return None
        tenant = db.get(Tenant, tenant_id)

        product_ids = [item.product_id for item in order.items]
        products_by_id: dict[int, Product] = {}
        if product_ids:
            rows = db.scalars(
                select(Product).where(
                    Product.tenant_id == tenant_id,
                    Product.id.in_(product_ids),
                )
            ).all()
            products_by_id = {p.id: p for p in rows}

        subtotal = sum((item.line_total - item.tax_amount for item in order.items), Decimal("0"))

        return InvoicePrintData(
            invoice_id=invoice.id,
            invoice_no=invoice.invoice_no,
            invoice_date=invoice.invoice_date,
            order_id=order.id,
            order_no=order.order_no,
            order_date=order.order_date,
            customer_name=invoice.customer_name or order.customer_name,
            notes=invoice.notes or order.notes,
            subtotal=subtotal,
            tax_total=order.tax_total,
            total_amount=order.total_amount,
            items=[
                InvoicePrintItem(
                    product_id=item.product_id,
                    product_name=products_by_id[item.product_id].name
                    if item.product_id in products_by_id
                    else f"Ürün #{item.product_id}",
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    tax_rate=item.tax_rate,
                    line_total=item.line_total,
                    tax_amount=item.tax_amount,
                )
                for item in order.items
            ],
            company_name=tenant.name if tenant else "",
            company_address=tenant.address if tenant else None,
            company_phone=tenant.phone if tenant else None,
            company_tax_number=tenant.tax_number if tenant else None,
            company_logo_url=tenant.logo_url if tenant else None,
            currency=tenant.currency if tenant else "TRY",
        )


orders_service = OrdersService()
