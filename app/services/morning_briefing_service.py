from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.customer_order import CustomerOrder
from app.models.product import Product
from app.models.sales import SalesRecord
from app.models.team_task import TeamTask


@dataclass
class BriefingItem:
    title: str
    body: str
    priority: str  # "high" | "medium" | "low"
    icon: str
    action_label: Optional[str] = None
    action_url: Optional[str] = None


def _is_en(language: str) -> bool:
    return not (language or "en").lower().startswith("tr")


def build_morning_briefing(
    db: Session,
    *,
    tenant_id: int,
    language: str = "en",
    permissions: list[str] | None = None,
) -> list[BriefingItem]:
    en = _is_en(language)
    items: list[BriefingItem] = []
    today = date.today()
    yesterday = today - timedelta(days=1)
    week_start = today - timedelta(days=8)  # 7-day window before yesterday

    # Determine which sections this user can see (None = manager/admin = see all)
    all_access = permissions is None
    can_stock   = all_access or "stock.adjust" in permissions
    can_sales   = all_access or "sales.read" in permissions
    can_finance = all_access or "finance.read" in permissions
    can_orders  = all_access or "orders.read" in permissions
    can_tasks   = all_access or "hr.tasks.read" in permissions

    # 1. Critical stock
    if not can_stock:
        critical = []
    else:
        critical = db.scalars(
        select(Product).where(
            Product.tenant_id == tenant_id,
            Product.reorder_level > 0,
            Product.stock_quantity <= Product.reorder_level,
        )
    ).all()
    if critical:
        names = ", ".join(p.name for p in critical[:3])
        if len(critical) > 3:
            suffix = f" and {len(critical) - 3} more products" if en else f" ve {len(critical) - 3} ürün daha"
        else:
            suffix = ""
        items.append(BriefingItem(
            title=(f"{len(critical)} products at critical stock level" if en
                   else f"{len(critical)} ürün kritik stok seviyesinde"),
            body=f"{names}{suffix}",
            priority="high",
            icon="📦",
            action_label="Go to Stock" if en else "Stoka Git",
            action_url="/stock",
        ))

    # 2. Yesterday's sales vs. prior-week average
    if can_sales:
        yesterday_sum = float(db.scalar(
            select(func.coalesce(func.sum(SalesRecord.total_amount), 0)).where(
                SalesRecord.tenant_id == tenant_id,
                SalesRecord.sale_date == yesterday,
            )
        ) or 0)

        week_avg = float(db.scalar(
            select(func.coalesce(func.avg(SalesRecord.total_amount), 0)).where(
                SalesRecord.tenant_id == tenant_id,
                SalesRecord.sale_date >= week_start,
                SalesRecord.sale_date < yesterday,
            )
        ) or 0)

        if yesterday_sum > 0 or week_avg > 0:
            if week_avg > 0:
                pct = ((yesterday_sum - week_avg) / week_avg) * 100
                sign = "+" if pct >= 0 else ""
                priority = "low" if pct >= -10 else "medium"
                if en:
                    direction = "above" if pct >= 0 else "below"
                    body = f"Yesterday: {yesterday_sum:,.0f} — {sign}{pct:.0f}% {direction} the weekly average."
                else:
                    direction = "üstünde" if pct >= 0 else "altında"
                    body = f"Dün: ₺{yesterday_sum:,.0f} — haftalık ortalamanın {sign}{pct:.0f}% {direction}."
            else:
                priority = "low"
                body = (f"Yesterday's sales: {yesterday_sum:,.0f}" if en
                        else f"Dünkü satış: ₺{yesterday_sum:,.0f}")
            items.append(BriefingItem(
                title="Yesterday's sales summary" if en else "Dünkü satış özeti",
                body=body,
                priority=priority,
                icon="📈",
                action_label="View Sales" if en else "Satışları Gör",
                action_url="/sales",
            ))

    # 3. Overdue tasks
    if can_tasks:
        overdue_count = db.scalar(
            select(func.count(TeamTask.id)).where(
                TeamTask.tenant_id == tenant_id,
                TeamTask.due_date < today,
                TeamTask.status.notin_(["done", "completed", "cancelled"]),
            )
        ) or 0
        if overdue_count > 0:
            items.append(BriefingItem(
                title=(f"{overdue_count} overdue tasks" if en else f"{overdue_count} gecikmiş görev"),
                body=("Overdue tasks are waiting to be completed by the team." if en
                      else "Süresi geçmiş görevler ekip tarafından tamamlanmayı bekliyor."),
                priority="high" if overdue_count >= 5 else "medium",
                icon="✅",
                action_label="Go to Tasks" if en else "Görevlere Git",
                action_url="/team",
            ))

    # 4. Pending customer orders
    if can_orders:
        pending_count = db.scalar(
            select(func.count(CustomerOrder.id)).where(
                CustomerOrder.tenant_id == tenant_id,
                CustomerOrder.status.in_(["pending", "confirmed"]),
            )
        ) or 0
        if pending_count > 0:
            items.append(BriefingItem(
                title=(f"{pending_count} orders awaiting action" if en
                       else f"{pending_count} sipariş işlem bekliyor"),
                body=("Customer orders are pending approval or preparation." if en
                      else "Müşteri siparişleri onay veya hazırlık aşamasında."),
                priority="medium",
                icon="🛒",
                action_label="Go to Orders" if en else "Siparişlere Git",
                action_url="/sales-orders",
            ))

    # Fallback — everything looks good
    if not items:
        items.append(BriefingItem(
            title="All good!" if en else "Her şey yolunda!",
            body=("No critical issues requiring attention. Have a great day!" if en
                  else "Dikkat gerektiren kritik bir durum yok. İyi çalışmalar!"),
            priority="low",
            icon="✨",
        ))

    return items[:5]
