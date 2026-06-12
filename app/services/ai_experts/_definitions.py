from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ExpertDefinition:
    key: str
    name: str
    icon: str
    description: str
    tables: set[str]
    keywords: list[str]
    system_prompt_addon: str


EXPERTS: dict[str, ExpertDefinition] = {
    "sales": ExpertDefinition(
        key="sales",
        name="Sales Expert",
        icon="📈",
        description="Sales trends, revenue analysis, top-selling products, period comparisons",
        tables={"sales_records", "sales_items", "products", "customers"},
        keywords=[
            "sales", "revenue", "income", "order", "best seller", "sold",
            "satış", "ciro", "gelir", "sipariş", "en çok satan", "satılan",
        ],
        system_prompt_addon="""
EXPERT MODE — SALES ANALYST:
- Periodic sales trends (daily/weekly/monthly/yearly comparisons)
- Revenue and quantity analysis per product; growth rates
- Sales distribution by customer
- Top / bottom selling products and categories
- Sales target vs. actuals comparison
Always include concrete numbers, growth percentages, and trend direction in each answer.""",
    ),

    "stock": ExpertDefinition(
        key="stock",
        name="Stock Expert",
        icon="📦",
        description="Stock levels, critical items, movement history, reorder suggestions",
        tables={"products", "stock_movements", "supply_orders", "suppliers"},
        keywords=[
            "stock", "inventory", "warehouse", "running low", "shortage", "supply",
            "reorder", "shelf", "stok", "envanter", "depo", "tükeniyor", "eksik", "tedarik",
        ],
        system_prompt_addon="""
EXPERT MODE — STOCK / INVENTORY ANALYST:
- Critical stock levels and reorder warnings
- Stock movement analysis (in/out/return/adjustment)
- Slow-moving and fast-moving products
- Supplier lead times and order recommendations
- Stock turnover rate calculations
Clearly warn when stock is low and specify recommended order quantities.""",
    ),

    "finance": ExpertDefinition(
        key="finance",
        name="Finance Expert",
        icon="💰",
        description="Profit & loss, cash flow, cashbook transactions, accounts receivable",
        tables={
            "sales_records", "sales_items", "products",
            "cash_transactions", "cash_accounts",
            "account_movements", "customers",
        },
        keywords=[
            "finance", "money", "cash", "profit", "loss", "expense", "accounts",
            "cashbook", "bank", "collection", "payment", "vat", "gross", "net",
            "finans", "para", "nakit", "kâr", "zarar", "gider", "cari",
        ],
        system_prompt_addon="""
EXPERT MODE — FINANCE ANALYST:
- Gross and net profit calculations (VAT-inclusive vs exclusive)
- Cash flow: cashbook and bank account movements
- Accounts receivable: customer debt/credit/balance summary
- Collection tracking and overdue receivables
- Period-over-period income vs expense comparison
Write monetary values with the appropriate currency symbol; show VAT separately.""",
    ),

    "team": ExpertDefinition(
        key="team",
        name="Team Expert",
        icon="👥",
        description="Employee performance, task tracking, sales commissions",
        tables={"sales_records", "team_tasks", "users"},
        keywords=[
            "team", "employee", "staff", "task", "commission", "performance",
            "assigned", "completed", "ekip", "çalışan", "personel", "görev",
        ],
        system_prompt_addon="""
EXPERT MODE — TEAM / PERFORMANCE ANALYST:
- Sales performance per employee vs. targets
- Task completion rates; overdue and pending tasks
- Commission calculations (sales × commission rate)
- Team productivity metrics and comparative rankings
Show individual performance with concrete metrics (count, currency amount, rate).""",
    ),

    "marketing": ExpertDefinition(
        key="marketing",
        name="Marketing Expert",
        icon="🎯",
        description="Customer segmentation, repeat purchase rate, churn risk, customer lifetime value",
        tables={"customers", "sales_records", "sales_items"},
        keywords=[
            "customer", "customers", "segment", "loyalty", "churn", "risk",
            "value", "ltv", "marketing", "campaign", "most valuable", "repeat",
            "shopping", "health score", "müşteri", "segment", "sadakat",
        ],
        system_prompt_addon="""
EXPERT MODE — MARKETING / CUSTOMER ANALYST:
- Customer lifetime value (LTV) and order frequency
- Churn risk: customers who haven't ordered in a long time
- Top customer ranking by total spend
- Customer segmentation: frequent buyers / one-time / dormant
- Average order value and revenue per customer
Explicitly list actionable customer names where recommendations apply.""",
    ),
}


def get_expert(key: str) -> ExpertDefinition | None:
    return EXPERTS.get(key)
