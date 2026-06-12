from __future__ import annotations

from typing import TYPE_CHECKING, FrozenSet

if TYPE_CHECKING:
    from app.models.user import User


def derive_role_label(is_platform_admin: bool, role_kind: str) -> str:
    """is_platform_admin + role_kind → 'admin' | 'manager' | 'employee' türetilmiş etiket.

    Bu, eski `role` string'inin TEK türetme noktasıdır. DB'de saklanmaz;
    yalnızca görüntü/geriye-uyumluluk amaçlı API yanıtlarında hesaplanır.
    Kaynak gerçek alanlar: is_platform_admin (platform) + role_kind (tenant içi).
    """
    if is_platform_admin:
        return "admin"
    return "manager" if role_kind == "owner" else "employee"

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
HR_PERFORMANCE_READ = "hr.performance.read"
HR_TASKS_READ = "hr.tasks.read"
HR_TASKS_WRITE = "hr.tasks.write"
CUSTOMERS_READ = "customers.read"
CUSTOMERS_WRITE = "customers.write"
SUPPLIERS_READ = "suppliers.read"
CASHBOOK_READ = "cashbook.read"
CASHBOOK_WRITE = "cashbook.write"
ACCOUNTS_READ = "accounts.read"
ACCOUNTS_WRITE = "accounts.write"
ORDERS_READ = "orders.read"
ORDERS_WRITE = "orders.write"

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
    }
)

def user_permissions(user: "User") -> FrozenSet[str]:
    """Kullanıcının efektif izin kümesini döner.

    1. is_platform_admin=True → SaaS operatörü; ALL_PERMISSIONS
    2. role_kind='owner'      → tenant sahibi; ALL_PERMISSIONS
    3. role_kind='staff' + job_role → JobRoleTemplate izinleri
    4. Hiçbiri               → boş küme
    """
    if user.is_platform_admin:
        return ALL_PERMISSIONS
    if user.role_kind == "owner":
        return ALL_PERMISSIONS
    if user.role_kind == "staff" and user.job_role is not None:
        return frozenset(user.job_role.permissions or [])
    return frozenset()
