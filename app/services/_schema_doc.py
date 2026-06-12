"""Schema documentation generator for NLP prompts.

Generates a single source of truth for table/column documentation
from SQLAlchemy metadata. Prevents drift between models and LLM prompts.
"""
from __future__ import annotations

from sqlalchemy import MetaData

# Tables shown to the LLM (whitelist).
_DEFAULT_NLP_TABLES = {
    "products",
    "sales_records",
    "sales_items",
    "sales_forecast_results",
    "stock_movements",
    "customers",
    "suppliers",
    "supply_orders",
    # Finance / accounts
    "account_movements",
    "cash_accounts",
    "cash_transactions",
    # Team / HR
    "team_tasks",
}

_ADMIN_EXTRA_TABLES = {"tenants", "users"}

# Column-level hints for tables whose raw column names mislead the LLM
_COLUMN_HINTS: dict[str, str] = {
    "tenants": (
        "-- id, name (şirket adı), slug, is_active (1=aktif), sector (sektör kodu), "
        "active_modules (JSON text, sorgu için kullanma), created_at  "
        "-- Aktif şirket sayısı: SELECT COUNT(*) FROM tenants WHERE is_active = 1"
    ),
}


def nlp_table_whitelist(*, include_admin: bool = False) -> set[str]:
    return _DEFAULT_NLP_TABLES | (_ADMIN_EXTRA_TABLES if include_admin else set())


# Relationship hints added to schema doc so the LLM knows how to JOIN tables.
_RELATIONSHIP_HINTS: dict[str, str] = {
    "sales_items": (
        "JOIN sales_records ON sales_records.id = sales_items.sales_record_id  "
        "JOIN products ON products.id = sales_items.product_id  "
        "-- sales_items has no product_name; use products.name via JOIN"
    ),
    "sales_records": (
        "JOIN customers ON customers.id = sales_records.customer_id (nullable)  "
        "-- sale_date is a DATE column; filter with strftime('%Y-%m', sale_date)"
    ),
    "stock_movements": "JOIN products ON products.id = stock_movements.product_id",
    "account_movements": (
        "JOIN customers ON customers.id = account_movements.customer_id (nullable)  "
        "-- debit increases balance (charge), credit decreases balance (payment)"
    ),
    "cash_transactions": "JOIN cash_accounts ON cash_accounts.id = cash_transactions.account_id",
    "supply_orders": "JOIN suppliers ON suppliers.id = supply_orders.supplier_id",
    "team_tasks": "-- assigned_user_id references users.id (but users table not whitelisted for non-admin)",
}


def build_nlp_schema_doc(metadata: MetaData, *, include_admin: bool = False) -> str:
    """Build a schema description block for LLM prompts from SQLAlchemy MetaData."""
    allowed = nlp_table_whitelist(include_admin=include_admin)
    blocks: list[str] = []
    for table in sorted(metadata.sorted_tables, key=lambda t: t.name):
        if table.name not in allowed:
            continue
        cols = ", ".join(c.name for c in table.columns)
        rel_hint = _RELATIONSHIP_HINTS.get(table.name, "")
        col_hint = _COLUMN_HINTS.get(table.name, "")
        hint_line = ""
        if col_hint:
            hint_line += f"\n  Notes: {col_hint}"
        if rel_hint:
            hint_line += f"\n  Relationships: {rel_hint}"
        blocks.append(f"Table: {table.name}\n  Columns: {cols}{hint_line}")
    return "\n\n".join(blocks)
