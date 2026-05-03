from __future__ import annotations

from typing import FrozenSet

# --- permission strings (API + UI) ---
ADMIN_ACCESS = "admin.access"
ADMIN_USERS_READ = "admin.users.read"
ADMIN_USERS_WRITE = "admin.users.write"
CATALOG_PRODUCT_READ = "catalog.product.read"
CATALOG_PRODUCT_WRITE = "catalog.product.write"
CATALOG_PRODUCT_DELETE = "catalog.product.delete"
STOCK_ADJUST = "stock.adjust"
SALES_READ = "sales.read"
SALES_WRITE = "sales.write"
FINANCE_READ = "finance.read"
FORECAST_RUN = "forecast.run"
AI_INSIGHTS_READ = "ai.insights.read"
NLP_QUERY_EXECUTE = "nlp.query.execute"

ALL_PERMISSIONS: FrozenSet[str] = frozenset(
    {
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
    }
)

ROLE_ADMIN = "admin"
ROLE_MANAGER = "manager"
ROLE_EMPLOYEE = "employee"

PERMISSION_MATRIX: dict[str, FrozenSet[str]] = {
    ROLE_ADMIN: ALL_PERMISSIONS,
    ROLE_MANAGER: frozenset(
        {
            CATALOG_PRODUCT_READ,
            CATALOG_PRODUCT_WRITE,
            STOCK_ADJUST,
            SALES_READ,
            SALES_WRITE,
            FINANCE_READ,
            FORECAST_RUN,
            AI_INSIGHTS_READ,
            NLP_QUERY_EXECUTE,
        }
    ),
    ROLE_EMPLOYEE: frozenset(
        {
            CATALOG_PRODUCT_READ,
            SALES_READ,
            AI_INSIGHTS_READ,
        }
    ),
}


def role_permissions(role: str) -> FrozenSet[str]:
    return PERMISSION_MATRIX.get(role, frozenset())


def role_has_permission(role: str, permission: str) -> bool:
    return permission in role_permissions(role)
