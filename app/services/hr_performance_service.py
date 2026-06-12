"""HR servisi: çok boyutlu performans (satış + görev aktivitesi) + görev yönetimi."""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.sales import SalesRecord
from app.models.team_task import TeamTask
from app.models.user import User


def _display_name(user: User) -> str:
    if user.full_name and user.full_name.strip():
        return user.full_name.strip()
    return user.email.split("@", 1)[0]


def _composite_score(
    sales_count: int,
    revenue: float,
    max_revenue: float,
    tasks_done: int,
    tasks_total: int,
    max_tasks_done: int,
    tenant_has_sales: bool,
) -> int:
    """
    Sektörden bağımsız çok boyutlu skor.
    - Satış yapan kiracılar: %60 ciro + %15 satış adedi + %25 görev tamamlama
    - Satış olmayan kiracılar: %80 görev tamamlama + %20 görev yükleme (normalised)
    """
    task_completion = tasks_done / max(tasks_total, 1)           # 0.0-1.0
    task_load_norm = tasks_done / max(max_tasks_done, 1)          # 0.0-1.0 team içi sıralama

    if tenant_has_sales:
        revenue_ratio = revenue / max(max_revenue, 1)
        sales_component = revenue_ratio * 60 + min(sales_count, 20) * 0.75  # 0–75
        task_component = task_completion * 25                                 # 0–25
        raw = sales_component + task_component
    else:
        raw = task_load_norm * 80 + task_completion * 20                      # 0–100

    return max(1, min(100, int(raw)))


def _insight(
    sales_count: int,
    revenue: float,
    tasks_done: int,
    tasks_total: int,
    tenant_has_sales: bool,
) -> str:
    if tenant_has_sales:
        if sales_count == 0 and tasks_done == 0:
            return "Henüz kayıtlı aktivite yok; veriler biriktiğinde skor otomatik güncellenir."
        if sales_count == 0:
            compl = f"{tasks_done}/{tasks_total} görev tamamlandı."
            return f"Satış atfı bulunmuyor; görev verimliliği ön plana çıkıyor. {compl}"
        if revenue >= 100_000:
            return "Hedeflerin üzerinde üstün satış performansı."
        if revenue >= 50_000:
            return "Beklentilerin üzerinde stabil satış performansı."
        if revenue >= 10_000:
            return "Hedeflere yakın satış hacmi; gelişim alanları mevcut."
        return "Satış hacmi düşük; hedeflerle kıyaslanması önerilir."
    else:
        if tasks_total == 0:
            return "Henüz atanmış görev yok; ilk görevler eklendikçe performans ölçülecek."
        rate = int(tasks_done / tasks_total * 100)
        if rate >= 80:
            return f"Görev tamamlama oranı yüksek (%{rate}); ekip içinde öne çıkan isim."
        if rate >= 50:
            return f"Görev tamamlama oranı %{rate}; devam eden işlerde ivme artırılabilir."
        return f"Görev tamamlama oranı %{rate}; önceliklendirme ve takip önerilir."


class HrPerformanceService:
    # ── Performans ────────────────────────────────────────────────────────────

    def list_employee_performance(self, db: Session, tenant_id: int) -> List[dict]:
        users = list(
            db.scalars(
                select(User)
                .where(User.tenant_id == tenant_id)
                .where(User.is_platform_admin.is_(False))   # platform admin çalışan listesinde görünmemeli
                .order_by(User.is_active.desc(), User.id.asc())
            ).all()
        )

        # Satış verisi
        sales_rows = db.execute(
            select(
                SalesRecord.created_by_user_id,
                func.count().label("cnt"),
                func.coalesce(func.sum(SalesRecord.total_amount), 0).label("rev"),
            )
            .where(
                SalesRecord.tenant_id == tenant_id,
                SalesRecord.created_by_user_id.is_not(None),
            )
            .group_by(SalesRecord.created_by_user_id)
        ).all()

        sales_stats: dict[int, tuple[int, float]] = {
            r.created_by_user_id: (int(r.cnt), float(r.rev)) for r in sales_rows
        }
        max_revenue = max((v[1] for v in sales_stats.values()), default=0.0)
        tenant_has_sales = len(sales_rows) > 0

        # Görev verisi: toplam + tamamlanan (assignee bazlı)
        task_rows = db.execute(
            select(
                TeamTask.assignee_id,
                func.count().label("total"),
                func.sum(case((TeamTask.status == "done", 1), else_=0)).label("done_cnt"),
            )
            .where(
                TeamTask.tenant_id == tenant_id,
                TeamTask.assignee_id.is_not(None),
            )
            .group_by(TeamTask.assignee_id)
        ).all()

        task_stats: dict[int, tuple[int, int]] = {
            r.assignee_id: (int(r.total), int(r.done_cnt or 0)) for r in task_rows
        }
        max_tasks_done = max((v[1] for v in task_stats.values()), default=0)

        result: List[dict] = []
        for u in users:
            s_cnt, s_rev = sales_stats.get(u.id, (0, 0.0))
            t_total, t_done = task_stats.get(u.id, (0, 0))
            result.append(
                {
                    "id": u.id,
                    "full_name": _display_name(u),
                    "email": u.email,
                    "is_active": bool(u.is_active),
                    "role": u.role,
                    "role_kind": getattr(u, "role_kind", None),
                    "department": u.department,
                    "sales_count": s_cnt,
                    "sales_revenue": s_rev,
                    "tasks_total": t_total,
                    "tasks_done": t_done,
                    "ai_score": _composite_score(
                        s_cnt, s_rev, max_revenue,
                        t_done, t_total, max_tasks_done,
                        tenant_has_sales,
                    ),
                    "ai_insight": _insight(s_cnt, s_rev, t_done, t_total, tenant_has_sales),
                }
            )
        return result

    # ── Görev CRUD ────────────────────────────────────────────────────────────

    def list_tasks(
        self,
        db: Session,
        tenant_id: int,
        *,
        assignee_id: Optional[int] = None,
        status: Optional[str] = None,
    ) -> List[TeamTask]:
        stmt = (
            select(TeamTask)
            .where(TeamTask.tenant_id == tenant_id)
            .order_by(TeamTask.due_date.asc().nulls_last(), TeamTask.id.desc())
        )
        if assignee_id is not None:
            stmt = stmt.where(TeamTask.assignee_id == assignee_id)
        if status is not None:
            stmt = stmt.where(TeamTask.status == status)
        return list(db.scalars(stmt).all())

    def get_task(self, db: Session, tenant_id: int, task_id: int) -> Optional[TeamTask]:
        return db.scalar(
            select(TeamTask).where(TeamTask.id == task_id, TeamTask.tenant_id == tenant_id)
        )

    def create_task(
        self,
        db: Session,
        tenant_id: int,
        *,
        title: str,
        description: Optional[str],
        assignee_id: Optional[int],
        due_date: Optional[date],
        priority: str,
        status: str,
        created_by_user_id: Optional[int],
        customer_id: Optional[int] = None,
        supply_order_id: Optional[int] = None,
    ) -> TeamTask:
        task = TeamTask(
            tenant_id=tenant_id,
            title=title.strip(),
            description=description,
            assignee_id=assignee_id,
            due_date=due_date,
            priority=priority,
            status=status,
            created_by_user_id=created_by_user_id,
            customer_id=customer_id,
            supply_order_id=supply_order_id,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def update_task(
        self,
        db: Session,
        tenant_id: int,
        task_id: int,
        *,
        title: Optional[str] = None,
        description: Optional[str] = None,
        assignee_id: Optional[int] = None,
        due_date: Optional[date] = None,
        priority: Optional[str] = None,
        status: Optional[str] = None,
        customer_id: Optional[int] = None,
        supply_order_id: Optional[int] = None,
    ) -> Optional[TeamTask]:
        task = self.get_task(db, tenant_id, task_id)
        if task is None:
            return None
        if title is not None:
            task.title = title.strip()
        if description is not None:
            task.description = description
        if assignee_id is not None:
            task.assignee_id = assignee_id
        if due_date is not None:
            task.due_date = due_date
        if priority is not None:
            task.priority = priority
        if status is not None:
            task.status = status
        if customer_id is not None:
            task.customer_id = customer_id
        if supply_order_id is not None:
            task.supply_order_id = supply_order_id
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def delete_task(self, db: Session, tenant_id: int, task_id: int) -> bool:
        task = self.get_task(db, tenant_id, task_id)
        if task is None:
            return False
        db.delete(task)
        db.commit()
        return True


hr_performance_service = HrPerformanceService()
