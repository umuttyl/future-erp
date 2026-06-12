from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.nlp_assistant import NlpAnswer, run_nlp_query

from ._definitions import EXPERTS, get_expert


def auto_route_expert(user_text: str) -> str:
    """Kullanıcı sorgusunu en uygun uzmana yönlendir (keyword skor tabanlı).

    Birden fazla uzman eşleşirse en yüksek skorlu seçilir.
    Eşleşme yoksa varsayılan olarak 'sales' döner.
    """
    text_lower = user_text.lower()
    scores: dict[str, int] = {}

    for key, expert in EXPERTS.items():
        score = sum(1 for kw in expert.keywords if kw in text_lower)
        if score > 0:
            scores[key] = score

    if not scores:
        return "sales"

    return max(scores, key=lambda k: scores[k])


def run_expert_query(
    db: Session,
    *,
    user_text: str,
    expert_key: str,
    tenant_id: int,
    user_role: str = "manager",
    active_modules: list[str] | None = None,
    tenant_name: str = "",
) -> NlpAnswer:
    expert = get_expert(expert_key)
    addon = expert.system_prompt_addon if expert else ""

    return run_nlp_query(
        db,
        user_text=user_text,
        tenant_id=tenant_id,
        user_role=user_role,
        active_modules=active_modules,
        tenant_name=tenant_name,
        expert_addon=addon,
    )
