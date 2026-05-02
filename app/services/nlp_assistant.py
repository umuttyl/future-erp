from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import sqlglot
from google import genai
from openai import OpenAI
from sqlalchemy import text
from sqlalchemy.engine import Result
from sqlalchemy.orm import Session

from app.core.config import settings


ALLOWED_TABLES = {
    "products",
    "sales_records",
    "sales_items",
    "sales_forecast_results",
    "stock_movements",
}


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


def _schema_prompt() -> str:
    return """You are an expert data analyst.

Task: Convert Turkish natural language into a single SQL SELECT query for the given schema.

Schema (PostgreSQL compatible, but must also work on SQLite when possible):

Table: products
  - id (int, pk)
  - sku (varchar)
  - name (varchar)
  - category (varchar, nullable)
  - unit_price (numeric)
  - cost_price (numeric)
  - stock_quantity (int)
  - reorder_level (int)

Table: sales_records
  - id (int, pk)
  - record_no (varchar)
  - sale_date (date)
  - customer_name (varchar, nullable)
  - total_amount (numeric)

Table: sales_items
  - id (int, pk)
  - sales_record_id (int, fk -> sales_records.id)
  - product_id (int, fk -> products.id)
  - quantity (int)
  - unit_price (numeric)
  - line_total (numeric)

Table: sales_forecast_results
  - id (int, pk)
  - model_name (varchar)
  - scope (varchar)
  - product_id (int, nullable)
  - forecast_start (date)
  - horizon_days (int)
  - result_payload (json)
  - created_at (datetime)

Table: stock_movements
  - id (int, pk)
  - product_id (int, fk -> products.id)
  - movement_type (varchar: 'in' | 'out' | 'adjust')
  - change (int)
  - balance_after (int)
  - reference (varchar, nullable)
  - note (varchar, nullable)
  - created_at (datetime)

Rules:
- Output MUST be valid JSON with keys: sql, params
- sql MUST be a single SELECT statement (no INSERT/UPDATE/DELETE/DDL, no multiple statements)
- Use only the allowed tables: products, sales_records, sales_items, sales_forecast_results, stock_movements
- Never use '*' (select explicit columns)
- Use named parameters like :limit, :start_date, :end_date, :product_id when needed
- If user asks "en yüksek kâr" but no cost data exists, interpret as "en yüksek ciro" (sum line_total)
- Default limit to 5 when user asks top N and N not specified
- Prefer human-friendly column aliases in Turkish when possible (e.g. "urun_adi", "toplam_ciro", "stok")
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
        '- Asla SQL\'i tekrarlama, sonuçları tablo olarak tekrar dökme.\n\n'
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


def _validate_sql(sql: str) -> None:
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
        "CREATE", "GRANT", "REVOKE", "COPY", "VACUUM", "ATTACH",
        "DETACH", "PRAGMA",
    ]
    up = raw.upper()
    if any(k in up for k in bad_keywords):
        raise UnsafeSQL("Non-SELECT keywords are not allowed.")

    tables = {t.name for t in expr.find_all(sqlglot.expressions.Table)}
    unknown = {t for t in tables if t not in ALLOWED_TABLES}
    if unknown:
        raise UnsafeSQL(f"Unknown/forbidden tables: {sorted(unknown)}")


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
        raise RuntimeError("Set OPENAI_API_KEY or GEMINI_API_KEY in .env to enable NLP assistant.")

    client = _gemini_client()
    tried = [settings.GEMINI_MODEL] + [m for m in _CANDIDATE_MODELS if m != settings.GEMINI_MODEL]
    last_err: Exception | None = None
    content = ""
    for model_name in tried:
        try:
            parts = [system_prompt] if user_prompt is None else [system_prompt, user_prompt]
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


def nl_to_sql(*, user_text: str) -> NL2SQLResult:
    system = _schema_prompt()
    content = _generate_content(system, user_text)

    obj = _extract_json(content)
    sql = str(obj.get("sql", "")).strip()
    params = obj.get("params", {}) or {}
    if not isinstance(params, dict):
        raise ValueError("params must be an object/dict.")

    _validate_sql(sql)
    return NL2SQLResult(sql=sql, params=params)


def execute_safe_sql(db: Session, *, sql: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    _validate_sql(sql)
    with db.get_bind().connect() as conn:
        res: Result = conn.execute(text(sql), params)
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


def run_nlp_query(db: Session, *, user_text: str) -> NlpAnswer:
    r = nl_to_sql(user_text=user_text)
    rows = execute_safe_sql(db, sql=r.sql, params=r.params)

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
    answer, chart_hint = summarize_result(user_text=user_text, sql=r.sql, data=normalized)
    return NlpAnswer(
        sql=r.sql,
        data=normalized,
        columns=columns,
        answer=answer,
        chart_hint=chart_hint,
    )


def run_nlp_query_tuple(db: Session, *, user_text: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Eski arayüz (ikinci öğe rows)."""
    res = run_nlp_query(db, user_text=user_text)
    return res.sql, res.data
