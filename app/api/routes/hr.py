from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_current_principal, get_tenant_ctx, require_permission
from app.core.exceptions import NotFoundException
from app.core.permissions import HR_PERFORMANCE_READ, HR_TASKS_WRITE
from app.schemas.hr import (
    EmployeePerformanceOut,
    TeamTaskCreate,
    TeamTaskOut,
    TeamTaskUpdate,
)
from app.services.hr_performance_service import hr_performance_service

router = APIRouter()


def _task_out(task) -> TeamTaskOut:
    assignee_name: Optional[str] = None
    if task.assignee:
        u = task.assignee
        assignee_name = (u.full_name or "").strip() or u.email.split("@")[0]
    customer_name: Optional[str] = None
    if task.customer:
        customer_name = task.customer.name
    return TeamTaskOut(
        id=task.id,
        tenant_id=task.tenant_id,
        title=task.title,
        description=task.description,
        assignee_id=task.assignee_id,
        assignee_name=assignee_name,
        created_by_user_id=task.created_by_user_id,
        due_date=task.due_date,
        priority=task.priority,
        status=task.status,
        customer_id=task.customer_id,
        customer_name=customer_name,
        supply_order_id=task.supply_order_id,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.get("/employee-performance", response_model=List[EmployeePerformanceOut])
def get_employee_performance(
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(HR_PERFORMANCE_READ)),
    db: Session = Depends(get_db),
):
    raw = hr_performance_service.list_employee_performance(db, ctx.tenant_id)
    return [EmployeePerformanceOut.model_validate(r) for r in raw]


@router.get("/tasks", response_model=List[TeamTaskOut])
def list_tasks(
    assignee_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    ctx: TenantContext = Depends(get_tenant_ctx),
    principal: AuthPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    # Staff can only see their own tasks; owners/managers can see all
    effective_assignee = assignee_id if principal.role_kind == "owner" else principal.user_id
    tasks = hr_performance_service.list_tasks(db, ctx.tenant_id, assignee_id=effective_assignee, status=status)
    return [_task_out(t) for t in tasks]


@router.post("/tasks", response_model=TeamTaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TeamTaskCreate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    principal: AuthPrincipal = Depends(require_permission(HR_TASKS_WRITE)),
    db: Session = Depends(get_db),
):
    task = hr_performance_service.create_task(
        db,
        ctx.tenant_id,
        title=payload.title,
        description=payload.description,
        assignee_id=payload.assignee_id,
        due_date=payload.due_date,
        priority=payload.priority,
        status=payload.status,
        created_by_user_id=principal.user_id,
        customer_id=payload.customer_id,
        supply_order_id=payload.supply_order_id,
    )

    if task.assignee_id:
        from app.realtime.notification_ws_hub import notification_manager
        from app.services.notification_service import notification_service
        ws_payload = {
            "type": "info",
            "source": "task_assigned",
            "message": f"New task assigned to you: {task.title}",
            "task_id": task.id,
            "task_title": task.title,
            "for_user_id": task.assignee_id,
            "due_date": str(task.due_date) if task.due_date else None,
        }
        notification_service.save(
            db,
            tenant_id=ctx.tenant_id,
            kind="info",
            message=f"New task assigned to you: {task.title}",
            source="task_assigned",
            payload=ws_payload,
        )
        await notification_manager.broadcast_to_tenant(ctx.tenant_id, ws_payload)

    return _task_out(task)


@router.patch("/tasks/{task_id}", response_model=TeamTaskOut)
async def update_task(
    task_id: int,
    payload: TeamTaskUpdate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    principal: AuthPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    from sqlalchemy import select as sa_select
    from sqlalchemy.orm import joinedload
    from app.models.team_task import TeamTask as TeamTaskModel
    from app.models.user import User as UserModel
    from app.core.permissions import user_permissions

    existing = db.scalar(
        sa_select(TeamTaskModel).where(
            TeamTaskModel.id == task_id,
            TeamTaskModel.tenant_id == ctx.tenant_id,
        )
    )
    if existing is None:
        raise NotFoundException("Task not found.", code="TASK_NOT_FOUND")

    if principal.role_kind == "staff":
        # Staff can only update status of their own assigned tasks
        if existing.assignee_id != principal.user_id:
            raise NotFoundException("Task not found.", code="TASK_NOT_FOUND")
        # Staff may only change status; all other fields stay untouched
        task_title = None
        task_description = None
        task_assignee_id = None
        task_due_date = None
        task_priority = None
        task_status = payload.status
        task_customer_id = None
        task_supply_order_id = None
    else:
        # Owners/managers need HR_TASKS_WRITE permission
        user = db.scalar(
            sa_select(UserModel)
            .where(UserModel.id == principal.user_id, UserModel.tenant_id == principal.tenant_id)
            .options(joinedload(UserModel.job_role))
        )
        if user is None or HR_TASKS_WRITE not in user_permissions(user):
            from app.core.exceptions import PermissionException
            raise PermissionException(code="PERMISSION_DENIED")
        task_title = payload.title
        task_description = payload.description
        task_assignee_id = payload.assignee_id
        task_due_date = payload.due_date
        task_priority = payload.priority
        task_status = payload.status
        task_customer_id = payload.customer_id
        task_supply_order_id = payload.supply_order_id

    old_status = existing.status
    task = hr_performance_service.update_task(
        db,
        ctx.tenant_id,
        task_id,
        title=task_title,
        description=task_description,
        assignee_id=task_assignee_id,
        due_date=task_due_date,
        priority=task_priority,
        status=task_status,
        customer_id=task_customer_id,
        supply_order_id=task_supply_order_id,
    )
    if task is None:
        raise NotFoundException("Task not found.", code="TASK_NOT_FOUND")

    if payload.status == "done" and old_status and old_status != "done":
        from app.realtime.notification_ws_hub import notification_manager
        assignee_name = ""
        if task.assignee:
            u = task.assignee
            assignee_name = (u.full_name or "").strip() or u.email.split("@")[0]
        ws_payload = {
            "type": "info",
            "source": "task_completed",
            "message": f"Task completed: {task.title}" + (f" — {assignee_name}" if assignee_name else ""),
            "task_id": task.id,
            "task_title": task.title,
            "assignee_name": assignee_name,
        }
        await notification_manager.broadcast_to_tenant(ctx.tenant_id, ws_payload)

    return _task_out(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(HR_TASKS_WRITE)),
    db: Session = Depends(get_db),
):
    deleted = hr_performance_service.delete_task(db, ctx.tenant_id, task_id)
    if not deleted:
        raise NotFoundException("Task not found.", code="TASK_NOT_FOUND")
