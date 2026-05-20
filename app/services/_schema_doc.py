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
}

_ADMIN_EXTRA_TABLES = {"tenants", "users"}


def nlp_table_whitelist(*, include_admin: bool = False) -> set[str]:
    return _DEFAULT_NLP_TABLES | (_ADMIN_EXTRA_TABLES if include_admin else set())


def build_nlp_schema_doc(metadata: MetaData, *, include_admin: bool = False) -> str:
    """Build a schema description block for LLM prompts from SQLAlchemy MetaData."""
    allowed = nlp_table_whitelist(include_admin=include_admin)
    blocks: list[str] = []
    for table in sorted(metadata.sorted_tables, key=lambda t: t.name):
        if table.name not in allowed:
            continue
        cols = ", ".join(c.name for c in table.columns)
        blocks.append(f"Table: {table.name}\n  - {cols}")
    return "\n\n".join(blocks)
