from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import sqlglot
import structlog
from google import genai
from openai import OpenAI
from sqlalchemy import text
from sqlalchemy.engine import Result
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.module_config import ModuleKey, allowed_tables_for_modules

logger = structlog.get_logger(__name__)

NLP_FRIENDLY_DB_FAILURE = (
    "Üzgünüm, bu isteğinizi veritabanından çekemedim. Daha farklı bir şekilde sorabilir misiniz?"
)

# Varsayılan tablo whitelist (geriye uyumluluk için korunur)
ALLOWED_TABLES = {
    "products",
    "sales_records",
    "sales_items",
    "sales_forecast_results",
    "stock_movements",
}

# Admin: tüm platform tablolarına erişim (cross-tenant)
_ADMIN_ALL_TABLES: set[str] = {
    "products", "sales_records", "sales_items", "sales_forecast_results",
    "stock_movements", "customers", "suppliers",
    "supply_orders", "tenants", "users",
}

# Role bazında erişilebilir tablolar (module_config'den bağımsız ek kısıtlar)
_ROLE_TABLE_RESTRICTIONS: dict[str, set[str]] = {
    "admin": set(),   # Kısıt yok — tüm tablolara erişim
    "manager": set(), # Kısıt yok — tüm tablolara erişim
    "employee": {     # Sadece kendi işiyle ilgili tablolar (tüm tenant verisine değil)
        "products",
        "sales_records",
        "sales_items",
        "stock_movements",
    },
}


def _build_allowed_tables(
    user_role: str,
    active_modules: list[str] | None = None,
) -> set[str]:
    """Kullanıcı rolü ve aktif modüllere göre izin verilen tablo kümesini döner."""
    # Admin tüm platform tablolarına erişir (cross-tenant)
    if user_role == "admin":
        return _ADMIN_ALL_TABLES.copy()

    if active_modules:
        module_tables = set(allowed_tables_for_modules(active_modules))
    else:
        module_tables = ALLOWED_TABLES.copy()

    role_restriction = _ROLE_TABLE_RESTRICTIONS.get(user_role)
    if role_restriction:
        # Employee: sadece role_restriction içindeki tablolar
        return module_tables & role_restriction
    # Manager: modüle göre tüm tablolar
    return module_tables


_MODULE_LABELS: dict[str, str] = {
    ModuleKey.SALES: "Satış Yönetimi",
    ModuleKey.INVENTORY: "Stok Takibi",
    ModuleKey.FINANCE: "Finans",
    ModuleKey.CRM: "Müşteri Yönetimi",
    ModuleKey.SUPPLIERS: "Tedarikçi",
    ModuleKey.PURCHASING: "Satınalma",
    ModuleKey.HR: "İnsan Kaynakları",
    ModuleKey.AI: "AI Analiz",
}


def _role_context_for_prompt(
    user_role: str,
    active_modules: list[str] | None,
    tenant_name: str = "",
) -> str:
    """Sistem prompt'una eklenecek role-aware bağlam metni üretir."""
    company = f" {tenant_name}" if tenant_name else ""

    if user_role == "admin":
        return (
            f"ROL BAĞLAMI: Sen bir PLATFORM YÖNETİCİSİ asistanısın (süper admin).{company}\n"
            "- TÜM şirketlerin verilerine (ürün, satış, stok, finans, müşteri, çalışan) tam erişimin var.\n"
            "- Tenantlar arası karşılaştırma, platform geneli istatistik, şirket bazlı analiz yapabilirsin.\n"
            "- `tenants` tablosundan şirket listesini, `users` tablosundan kullanıcıları sorgulayabilirsin.\n"
            "- Sorgularda tenant_id filtresi zorunlu değil; istersen tüm veya belirli bir şirketi sorgula.\n"
            "Türkçe yanıt ver; platform odaklı, veri-driven ve özlü ol."
        )

    if user_role == "manager":
        if active_modules:
            active_labels = [_MODULE_LABELS.get(m, m) for m in active_modules]
            modules_note = f"\n- Aktif ERP modüllerin: {', '.join(active_labels)}"
        else:
            modules_note = ""
        return (
            f"ROL BAĞLAMI: Sen{company} şirketinin STRATEJİK İŞ ASİSTANISIN (şirket müdürü/sahibi).{modules_note}\n"
            "- Şirketin tüm verilerine (satış, stok, finans, müşteri, tedarikçi) erişim hakkın var.\n"
            "- Ciro tahminleri, envanter optimizasyonu, müşteri analizi, karlılık konularında derin analiz yap.\n"
            "- SADECE kendi şirketinin verilerini görürsün; başka şirket bilgisi paylaşma.\n"
            "Türkçe yanıt ver; stratejik, veriye dayalı ve iş odaklı ol."
        )

    # Employee
    allowed_ops = []
    if active_modules:
        if ModuleKey.SALES in active_modules:
            allowed_ops.append("satış kayıtları")
        if ModuleKey.INVENTORY in active_modules:
            allowed_ops.append("stok durumu")
        if ModuleKey.CRM in active_modules:
            allowed_ops.append("müşteri bilgileri")
    if not allowed_ops:
        allowed_ops = ["ürün bilgileri", "stok durumu"]

    return (
        f"ROL BAĞLAMI: Sen{company} şirketinde çalışan bir OPERASYONEL ÇALIŞAN asistanısın.\n"
        f"- Sadece şu konularda yardım edersin: {', '.join(allowed_ops)}.\n"
        "- Şirket finansalları (kâr, zarar, maaş, ciro toplamı) hakkında KESİNLİKLE bilgi verme.\n"
        "- İK ve çalışan kayıtlarına erişimin YOK.\n"
        "- Eğer bunları sorarlarsa Türkçe olarak: 'Bu bilgiye erişim yetkiniz bulunmuyor.' de.\n"
        "Türkçe yanıt ver; kısa, net ve göreve odaklı ol."
    )


_INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(previous|all)\s+(instructions?|prompts?)|"
    r"system\s*:|<\|im_start\|>|<\|im_end\|>|"
    r"\[INST\]|\[/INST\]|###\s*instruction|"
    r"you\s+are\s+now|forget\s+(your|all)\s+(previous|instructions?))",
    re.IGNORECASE,
)
_MAX_INPUT_CHARS = 500


def _sanitize_user_input(text: str) -> str:
    """Prompt injection kalıplarını kaldır ve uzunluğu sınırla."""
    cleaned = _INJECTION_PATTERNS.sub("", text)
    return cleaned[:_MAX_INPUT_CHARS].strip()


class UnsafeSQL(Exception):
    pass


@dataclass
class NL2SQLResult:
    sql: str
    params: Dict[str, Any]


@dataclass
class NlpAnswer:
    sql: str
    data: List[Dict[str, Any]]
    columns: List[str]
    answer: str
    chart_hint: Optional[Dict[str, Any]] = None


@dataclass
class ChatOnlyReply:
    """LLM yanıtı yalnızca doğal dil; veritabanı sorgusu yok."""

    message: str


def _unified_nlp_system_prompt(
    user_role: str = "manager",
    active_modules: list[str] | None = None,
    tenant_name: str = "",
) -> str:
    allowed = _build_allowed_tables(user_role, active_modules)
    allowed_tables_list = ", ".join(sorted(allowed)) if allowed else "products"
    role_context = _role_context_for_prompt(user_role, active_modules, tenant_name)

    is_admin = user_role == "admin"

    # Admin için cross-tenant schema ve kurallar; diğer roller için tenant-scoped
    if is_admin:
        tenant_filter_rule = (
            "- PLATFORM ADMIN olarak tenant_id filtresi zorunlu değil — tüm şirketlerin verilerine erişebilirsin.\n"
            "- Belirli bir şirket sorgusu için WHERE tenant_id = X kullanabilirsin.\n"
            "- Şirket adı için tenants tablosunu JOIN edebilirsin (tenants.id = <tablo>.tenant_id).\n"
            "- Tenant bazlı gruplama: GROUP BY tenant_id veya GROUP BY t.name (JOIN tenants t ON t.id = tenant_id)."
        )
        extra_schema = """
Table: tenants
  - id, slug, name, sector, is_active, created_at

Table: users
  - id, tenant_id, email, full_name, role ('admin'|'manager'|'employee')
"""
    else:
        tenant_filter_rule = "- Every referenced table MUST be filtered with tenant_id = :tid (bind :tid)"
        extra_schema = ""

    return f"""You are the Future ERP AI assistant (Sen Future ERP AI asistanısın).

{role_context}

CRITICAL: If the user is ONLY greeting or chatting (e.g. "Merhaba", "Nasılsın", "Ne yapabilirsin?", "Teşekkürler"),
you MUST NOT produce SQL. Reply in Turkish in a warm, natural, friendly way (reply_type "chat").

ONLY when the user clearly asks for specific data or a report (e.g. "En çok satan ürünler", "Son 30 gün ciro")
should you use reply_type "sql" with one safe SELECT.

Use reply_type "chat" (no SQL) when:
- Greetings, thanks, small talk ("merhaba", "teşekkürler").
- Conceptual or general questions that do NOT require querying tables.

Use reply_type "sql" ONLY when the user clearly wants factual rows or aggregates from the database:
lists, counts, sums, rankings, "top N", filters by date/SKU/customer, stock below threshold, etc.

Output EXACTLY one JSON object (no markdown fences, no prose outside JSON):

Chat-only:
{{ "reply_type": "chat", "message": "<answer in Turkish, clear and concise>" }}

Database query:
{{ "reply_type": "sql", "sql": "<single SELECT>", "params": {{ }} }}

ALLOWED TABLES for this user: {allowed_tables_list}
DO NOT reference any table not in this list.

Schema (SQLite-friendly):{extra_schema}
Table: products
  - id, tenant_id (int, fk), sku, name, category, unit_price, cost_price, stock_quantity, reorder_level

Table: sales_records
  - id, tenant_id, record_no, sale_date, customer_name, total_amount

Table: sales_items
  - id, tenant_id, sales_record_id, product_id, quantity, unit_price, line_total

Table: sales_forecast_results
  - id, tenant_id, model_name, scope, product_id, forecast_start, horizon_days, result_payload, created_at

Table: stock_movements
  - id, tenant_id, product_id, movement_type ('in'|'out'|'adjust'), change, balance_after, reference, created_at

Table: customers
  - id, tenant_id, name, email, phone, address, customer_type, notes, created_at

Table: suppliers
  - id, tenant_id, name, contact_person, email, phone, payment_terms, notes, created_at

Table: supply_orders
  - id, tenant_id, product_id, quantity, status, created_at

SQL rules (only when reply_type is "sql"):
- sql MUST be a single SELECT (no INSERT/UPDATE/DELETE/DDL, no multiple statements)
- Use ONLY tables from the ALLOWED TABLES list above
- Never use SELECT * (explicit columns)
{tenant_filter_rule}
- Named parameters :limit, :start_date, :end_date, :product_id as needed
- Default LIMIT 5 when user asks "top" without N
- Prefer Turkish-friendly column aliases (urun_adi, toplam_ciro, stok, sirket_adi)
"""


def _summary_prompt(user_text: str, sql: str, data: List[Dict[str, Any]]) -> str:
    trimmed = data[:20]
    return (
        "Sen bir ERP asistanısın. Aşağıdaki kullanıcı sorusuna, sağlanan SQL sonuç verisine "
        "dayanarak Türkçe, kısa ve akıcı bir cevap üret.\n\n"
        "Kurallar:\n"
        "- Yanıt MUTLAKA geçerli JSON olmalı ve şu alanları içermeli:\n"
        '  { "answer": string, "chart_hint": { "type": "bar"|"line"|"pie"|"none", '
        '"x": string|null, "y": string|null, "title": string } }\n'
        "- 'answer' en fazla 4 cümle; gerekiyorsa rakamları para/adet olarak yorumla "
        "(Türk Lirası için ₺ kullan).\n"
        "- Eğer veri tablosu/satır yoksa bunu nazikçe belirt.\n"
        "- 'chart_hint' en uygun grafik önerisidir. İki kolon varsa kategori/metrik çifti "
        'bar/pie verir. Zaman kolonu (date/month) varsa "line". Uygun değilse "none".\n'
        "- Asla SQL'i tekrarlama, sonuçları tablo olarak tekrar dökme.\n\n"
        f"Kullanıcı sorusu:\n{user_text}\n\n"
        f"Üretilen SQL:\n{sql}\n\n"
        f"Sonuç verisi (ilk {len(trimmed)} satır):\n{json.dumps(trimmed, default=_json_default, ensure_ascii=False)}"
    )


def _json_default(o: Any) -> Any:
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    return str(o)


def _openai_client() -> OpenAI:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set in environment (.env).")
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def _gemini_client() -> genai.Client:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set in environment (.env).")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def _extract_json(text_out: str) -> Dict[str, Any]:
    text_out = text_out.strip()
    m = re.search(r"\{[\s\S]*\}", text_out)
    if not m:
        raise ValueError("Model output did not contain JSON object.")
    return json.loads(m.group(0))


def _validate_sql(
    sql: str,
    allowed_tables: set[str] | None = None,
    cross_tenant: bool = False,
) -> None:
    raw = sql.strip()

    if ";" in raw:
        raise UnsafeSQL("Multiple statements are not allowed.")
    if re.search(r"(--|/\*)", raw):
        raise UnsafeSQL("SQL comments are not allowed.")

    try:
        expr = sqlglot.parse_one(raw, read="postgres")
    except Exception as e:  # pragma: no cover
        raise UnsafeSQL(f"SQL parse failed: {e}") from e

    if expr is None:
        raise UnsafeSQL("Empty SQL.")

    if expr.key != "select":
        raise UnsafeSQL("Only SELECT queries are allowed.")

    bad_keywords = [
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
        "CREATE", "GRANT", "REVOKE", "COPY", "VACUUM", "ATTACH", "DETACH", "PRAGMA",
    ]
    up = raw.upper()
    if any(k in up for k in bad_keywords):
        raise UnsafeSQL("Non-SELECT keywords are not allowed.")

    # Rol/modüle göre dinamik tablo whitelist kullan; yoksa varsayılan
    effective_allowed = allowed_tables if allowed_tables is not None else ALLOWED_TABLES
    tables = {t.name for t in expr.find_all(sqlglot.expressions.Table)}
    unknown = {t for t in tables if t not in effective_allowed}
    if unknown:
        raise UnsafeSQL(f"Unknown/forbidden tables: {sorted(unknown)}")

    # Admin cross-tenant sorgularında :tid filtresi zorunlu değil
    if not cross_tenant and ":tid" not in raw.lower():
        raise UnsafeSQL("Sorgu kiracı filtresi (:tid) içermiyor.")


_CANDIDATE_MODELS = [
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-pro-latest",
]


def _generate_content(system_prompt: str, user_prompt: Optional[str] = None) -> str:
    """Birden fazla modeli deneyerek metin üretir."""
    if settings.OPENAI_API_KEY:
        client = _openai_client()
        messages = [{"role": "system", "content": system_prompt}]
        if user_prompt is not None:
            messages.append({"role": "user", "content": user_prompt})
        resp = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            temperature=0,
        )
        return resp.choices[0].message.content or ""

    if not settings.GEMINI_API_KEY:
        raise RuntimeError(
            "Set OPENAI_API_KEY or GEMINI_API_KEY in .env to enable NLP assistant."
        )

    client = _gemini_client()
    tried = [settings.GEMINI_MODEL] + [
        m for m in _CANDIDATE_MODELS if m != settings.GEMINI_MODEL
    ]
    last_err: Exception | None = None
    content = ""
    for model_name in tried:
        try:
            parts = (
                [system_prompt] if user_prompt is None else [system_prompt, user_prompt]
            )
            resp = client.models.generate_content(model=model_name, contents=parts)
            content = (getattr(resp, "text", "") or "").strip()
            if content:
                return content
        except Exception as e:
            last_err = e
            continue
    if not content:
        raise RuntimeError(f"Model generation failed: {last_err}")
    return content


def interpret_nlp_request(
    *,
    user_text: str,
    user_role: str = "manager",
    active_modules: list[str] | None = None,
    tenant_name: str = "",
) -> ChatOnlyReply | NL2SQLResult:
    """LLM çıktısı: doğal dil sohbet veya güvenli SELECT sorgusu."""
    cross_tenant = user_role == "admin"
    safe_text = _sanitize_user_input(user_text)
    allowed = _build_allowed_tables(user_role, active_modules)
    system = _unified_nlp_system_prompt(
        user_role=user_role, active_modules=active_modules, tenant_name=tenant_name
    )
    # Kullanıcı girdisi sistem talimatından net biçimde ayrılır (prompt injection önlemi).
    tagged_input = f"<user_input>{safe_text}</user_input>"
    content = (_generate_content(system, tagged_input) or "").strip()
    if not content:
        raise ValueError("Empty model output.")

    obj: Dict[str, Any] | None = None
    try:
        obj = _extract_json(content)
    except Exception:
        return ChatOnlyReply(message=content[:8000])

    assert obj is not None
    rtype = str(obj.get("reply_type", "")).strip().lower()
    msg = str(obj.get("message", "")).strip()
    sql = str(obj.get("sql", "")).strip()
    params = obj.get("params", {}) or {}
    if not isinstance(params, dict):
        raise ValueError("params must be an object/dict.")

    if rtype == "chat":
        return ChatOnlyReply(message=msg or content[:8000])

    if rtype == "sql":
        if not sql:
            return ChatOnlyReply(
                message=msg
                or "Veritabanından veri çekmek için sorunuzu netleştirin (ör. tarih aralığı, ürün veya müşteri adı)."
            )
        _validate_sql(sql, allowed_tables=allowed, cross_tenant=cross_tenant)
        return NL2SQLResult(sql=sql, params=params)

    # Eski / belirsiz: yalnızca sql+params veya serbest JSON
    if sql:
        try:
            _validate_sql(sql, allowed_tables=allowed, cross_tenant=cross_tenant)
            return NL2SQLResult(sql=sql, params=params)
        except UnsafeSQL:
            logger.info(
                "nlp_sql_rejected_using_chat_fallback", extra={"preview": sql[:120]}
            )
            return ChatOnlyReply(message=msg or content[:8000])

    if msg:
        return ChatOnlyReply(message=msg)
    return ChatOnlyReply(message=content[:8000])


def execute_safe_sql(
    db: Session,
    *,
    sql: str,
    params: Dict[str, Any],
    tenant_id: int,
    cross_tenant: bool = False,
) -> List[Dict[str, Any]]:
    _validate_sql(sql, cross_tenant=cross_tenant)
    merged = {**params} if cross_tenant else {**params, "tid": tenant_id}
    with db.get_bind().connect() as conn:
        res: Result = conn.execute(text(sql), merged)
        rows = res.mappings().all()
        return [dict(r) for r in rows]


def summarize_result(
    *, user_text: str, sql: str, data: List[Dict[str, Any]]
) -> tuple[str, Optional[Dict[str, Any]]]:
    """Sonuç verisini Türkçe doğal dil cevap + grafik önerisine dönüştür."""
    if not data:
        return (
            "Sorduğun sorguyla eşleşen veri bulunamadı. Tarih aralığını veya filtreleri genişletmeyi deneyebilirsin.",
            {"type": "none", "x": None, "y": None, "title": ""},
        )

    prompt = _summary_prompt(user_text, sql, data)
    try:
        content = _generate_content(prompt)
    except Exception:
        return _fallback_summary(data), _fallback_chart_hint(data)

    try:
        obj = _extract_json(content)
        answer = str(obj.get("answer", "")).strip() or _fallback_summary(data)
        hint = obj.get("chart_hint") or _fallback_chart_hint(data)
        return answer, hint
    except Exception:
        return _fallback_summary(data), _fallback_chart_hint(data)


def _fallback_summary(data: List[Dict[str, Any]]) -> str:
    return f"Sorgu {len(data)} satır döndürdü. Detaylar tabloda listelenmiştir."


def _fallback_chart_hint(data: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not data:
        return {"type": "none", "x": None, "y": None, "title": ""}
    cols = list(data[0].keys())
    numeric = [c for c in cols if isinstance(data[0].get(c), (int, float, Decimal))]
    non_numeric = [c for c in cols if c not in numeric]
    if numeric and non_numeric:
        return {"type": "bar", "x": non_numeric[0], "y": numeric[-1], "title": ""}
    return {"type": "none", "x": None, "y": None, "title": ""}


def run_nlp_query(
    db: Session,
    *,
    user_text: str,
    tenant_id: int,
    user_role: str = "manager",
    active_modules: list[str] | None = None,
    tenant_name: str = "",
) -> NlpAnswer:
    try:
        routed = interpret_nlp_request(
            user_text=user_text,
            user_role=user_role,
            active_modules=active_modules,
            tenant_name=tenant_name,
        )
        if isinstance(routed, ChatOnlyReply):
            return NlpAnswer(
                sql="",
                data=[],
                columns=[],
                answer=routed.message,
                chart_hint={"type": "none", "x": None, "y": None, "title": ""},
            )

        cross_tenant = user_role == "admin"
        rows = execute_safe_sql(
            db, sql=routed.sql, params=routed.params, tenant_id=tenant_id, cross_tenant=cross_tenant
        )

        normalized: List[Dict[str, Any]] = []
        for row in rows:
            item: Dict[str, Any] = {}
            for k, v in row.items():
                if isinstance(v, Decimal):
                    item[k] = float(v)
                elif isinstance(v, (date, datetime)):
                    item[k] = v.isoformat()
                else:
                    item[k] = v
            normalized.append(item)

        columns = list(normalized[0].keys()) if normalized else []
        answer, chart_hint = summarize_result(
            user_text=user_text, sql=routed.sql, data=normalized
        )
        return NlpAnswer(
            sql=routed.sql,
            data=normalized,
            columns=columns,
            answer=answer,
            chart_hint=chart_hint,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("nlp_query_fallback", reason=str(exc))
        return NlpAnswer(
            sql="",
            data=[],
            columns=[],
            answer=NLP_FRIENDLY_DB_FAILURE,
            chart_hint={"type": "none", "x": None, "y": None, "title": ""},
        )


def run_nlp_query_tuple(
    db: Session, *, user_text: str, tenant_id: int
) -> Tuple[str, List[Dict[str, Any]]]:
    """Eski arayz (ikinci oge rows) - geriye donuk uyumluluk."""
    res = run_nlp_query(db, user_text=user_text, tenant_id=tenant_id)
    return res.sql, res.data
