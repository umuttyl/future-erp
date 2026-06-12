"""Seeds the 4 built-in JobRoleTemplate rows for a newly created tenant."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.permissions import (
    ACCOUNTS_READ,
    ACCOUNTS_WRITE,
    ADMIN_ACCESS,
    ADMIN_USERS_READ,
    ADMIN_USERS_WRITE,
    AI_INSIGHTS_READ,
    CASHBOOK_READ,
    CASHBOOK_WRITE,
    CATALOG_PRODUCT_DELETE,
    CATALOG_PRODUCT_READ,
    CATALOG_PRODUCT_WRITE,
    CUSTOMERS_READ,
    CUSTOMERS_WRITE,
    FINANCE_READ,
    FORECAST_RUN,
    HR_PERFORMANCE_READ,
    HR_TASKS_READ,
    HR_TASKS_WRITE,
    NLP_QUERY_EXECUTE,
    ORDERS_READ,
    ORDERS_WRITE,
    SALES_READ,
    SALES_WRITE,
    STOCK_ADJUST,
    SUPPLIERS_READ,
)
from app.models.job_role_template import JobRoleTemplate

# Maps old Turkish name → new English name for existing tenant migration
_LEGACY_NAME_MAP: dict[str, str] = {
    "Sahip": "Owner",
    "Kasiyer": "Cashier",
    "Depocu": "Warehouse Staff",
    "Satış Temsilcisi": "Sales Representative",
    "Muhasebe Asistanı": "Finance Staff",
}

_SYSTEM_ROLES: list[dict] = [
    {
        "name": "Owner",
        "permissions": sorted([
            ADMIN_ACCESS,
            ADMIN_USERS_READ,
            ADMIN_USERS_WRITE,
            CATALOG_PRODUCT_READ,
            CATALOG_PRODUCT_WRITE,
            CATALOG_PRODUCT_DELETE,
            STOCK_ADJUST,
            SALES_READ,
            SALES_WRITE,
            FINANCE_READ,
            FORECAST_RUN,
            AI_INSIGHTS_READ,
            NLP_QUERY_EXECUTE,
            HR_PERFORMANCE_READ,
            HR_TASKS_READ,
            HR_TASKS_WRITE,
            CUSTOMERS_READ,
            CUSTOMERS_WRITE,
            SUPPLIERS_READ,
            CASHBOOK_READ,
            CASHBOOK_WRITE,
            ACCOUNTS_READ,
            ACCOUNTS_WRITE,
            ORDERS_READ,
            ORDERS_WRITE,
        ]),
        "is_system": True,
    },
    {
        "name": "Cashier",
        "permissions": sorted([
            SALES_WRITE, SALES_READ, CUSTOMERS_READ,
            CATALOG_PRODUCT_READ, CASHBOOK_WRITE,
            NLP_QUERY_EXECUTE, AI_INSIGHTS_READ,
            HR_TASKS_READ, HR_TASKS_WRITE,
        ]),
        "is_system": True,
    },
    {
        "name": "Warehouse Staff",
        "permissions": sorted([
            STOCK_ADJUST, CATALOG_PRODUCT_READ, CATALOG_PRODUCT_WRITE,
            SUPPLIERS_READ, ORDERS_READ,
            NLP_QUERY_EXECUTE, AI_INSIGHTS_READ,
            HR_TASKS_READ, HR_TASKS_WRITE,
        ]),
        "is_system": True,
    },
    {
        "name": "Sales Representative",
        "permissions": sorted([
            SALES_WRITE, SALES_READ, CUSTOMERS_WRITE, CUSTOMERS_READ,
            CATALOG_PRODUCT_READ,
            NLP_QUERY_EXECUTE, AI_INSIGHTS_READ,
            HR_TASKS_READ, HR_TASKS_WRITE,
        ]),
        "is_system": True,
    },
    {
        "name": "Finance Staff",
        "permissions": sorted([
            CASHBOOK_READ, CASHBOOK_WRITE, ACCOUNTS_READ, ACCOUNTS_WRITE,
            CUSTOMERS_READ, FINANCE_READ,
            NLP_QUERY_EXECUTE, AI_INSIGHTS_READ,
            HR_TASKS_READ, HR_TASKS_WRITE,
        ]),
        "is_system": True,
    },
]


def seed_system_roles(db: Session, tenant_id: int) -> list[JobRoleTemplate]:
    """Upsert system roles for *tenant_id*.

    Creates missing roles for new tenants; syncs permissions for existing ones.
    Also migrates legacy Turkish role names to English equivalents.
    """
    from sqlalchemy import select

    # Migrate any legacy Turkish-named roles to English first
    for old_name, new_name in _LEGACY_NAME_MAP.items():
        legacy = db.scalar(
            select(JobRoleTemplate).where(
                JobRoleTemplate.tenant_id == tenant_id,
                JobRoleTemplate.name == old_name,
            )
        )
        if legacy:
            legacy.name = new_name
            db.add(legacy)
    db.flush()  # must flush before upsert loop so renamed rows are visible

    result: list[JobRoleTemplate] = []
    for r in _SYSTEM_ROLES:
        existing = db.scalar(
            select(JobRoleTemplate).where(
                JobRoleTemplate.tenant_id == tenant_id,
                JobRoleTemplate.name == r["name"],
            )
        )
        if existing:
            existing.permissions = r["permissions"]
            existing.is_system = True
            db.add(existing)
            result.append(existing)
        else:
            new_role = JobRoleTemplate(
                tenant_id=tenant_id,
                name=r["name"],
                permissions=r["permissions"],
                is_system=True,
            )
            db.add(new_role)
            result.append(new_role)
    db.flush()
    return result
