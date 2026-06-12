from __future__ import annotations
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.deps import AuthPrincipal, require_permission
from app.models.user import User
from app.services.comments_tags_service import (
    add_comment, delete_comment, list_comments,
    add_tag, remove_tag, list_tags, batch_tags_for_entity_type,
)

router = APIRouter(prefix="/comments-tags", tags=["comments-tags"])

EntityType = Literal["customer", "product", "order"]

PRESET_TAGS = ["VIP", "Late Payer", "Fast Shipping", "Loyal Customer", "Special Price"]


# ── Schemas ───────────────────────────────────────────────────────────────────

class CommentOut(BaseModel):
    id: int
    author_name: str
    body: str
    created_at: str
    user_id: int

    model_config = {"from_attributes": True}


class CommentIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


class TagIn(BaseModel):
    tag: str = Field(..., min_length=1, max_length=100)


class RecordDataOut(BaseModel):
    tags: list[str]
    comments: list[CommentOut]
    preset_tags: list[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_author(principal: AuthPrincipal, db: Session) -> str:
    user = db.scalar(
        select(User).where(
            User.id == principal.user_id,
            User.tenant_id == principal.tenant_id,
        )
    )
    if user and user.full_name:
        return user.full_name
    return principal.email.split("@")[0]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{entity_type}/{entity_id}", response_model=RecordDataOut)
def get_record_data(
    entity_type: EntityType,
    entity_id: int,
    principal: AuthPrincipal = Depends(require_permission("sales.read")),
    db: Session = Depends(get_db),
):
    tags = list_tags(db, tenant_id=principal.tenant_id, entity_type=entity_type, entity_id=entity_id)
    comments = list_comments(db, tenant_id=principal.tenant_id, entity_type=entity_type, entity_id=entity_id)
    return RecordDataOut(
        tags=tags,
        preset_tags=PRESET_TAGS,
        comments=[
            CommentOut.model_validate({
                "id": c.id,
                "author_name": c.author_name,
                "body": c.body,
                "created_at": c.created_at.isoformat(),
                "user_id": c.user_id,
            })
            for c in comments
        ],
    )


@router.post("/{entity_type}/{entity_id}/comments", response_model=CommentOut)
def create_comment(
    entity_type: EntityType,
    entity_id: int,
    payload: CommentIn,
    principal: AuthPrincipal = Depends(require_permission("sales.write")),
    db: Session = Depends(get_db),
):
    author = _resolve_author(principal, db)
    c = add_comment(
        db,
        tenant_id=principal.tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=principal.user_id,
        author_name=author,
        body=payload.body,
    )
    return CommentOut.model_validate({
        "id": c.id,
        "author_name": c.author_name,
        "body": c.body,
        "created_at": c.created_at.isoformat(),
        "user_id": c.user_id,
    })


@router.delete("/comments/{comment_id}")
def remove_comment(
    comment_id: int,
    principal: AuthPrincipal = Depends(require_permission("sales.write")),
    db: Session = Depends(get_db),
):
    is_manager = principal.is_platform_admin or principal.role_kind == "owner"
    ok = delete_comment(
        db,
        tenant_id=principal.tenant_id,
        comment_id=comment_id,
        user_id=principal.user_id,
        is_manager=is_manager,
    )
    if not ok:
        raise HTTPException(404, "Yorum bulunamadı veya yetkiniz yok")
    return {"ok": True}


@router.post("/{entity_type}/{entity_id}/tags")
def create_tag(
    entity_type: EntityType,
    entity_id: int,
    payload: TagIn,
    principal: AuthPrincipal = Depends(require_permission("sales.write")),
    db: Session = Depends(get_db),
):
    add_tag(
        db,
        tenant_id=principal.tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        tag=payload.tag,
    )
    return {"ok": True}


@router.get("/{entity_type}/all-tags", response_model=dict[int, list[str]])
def get_all_tags_for_type(
    entity_type: EntityType,
    principal: AuthPrincipal = Depends(require_permission("sales.read")),
    db: Session = Depends(get_db),
):
    return batch_tags_for_entity_type(db, tenant_id=principal.tenant_id, entity_type=entity_type)


@router.delete("/{entity_type}/{entity_id}/tags/{tag}")
def delete_tag(
    entity_type: EntityType,
    entity_id: int,
    tag: str,
    principal: AuthPrincipal = Depends(require_permission("sales.write")),
    db: Session = Depends(get_db),
):
    ok = remove_tag(
        db,
        tenant_id=principal.tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        tag=tag,
    )
    if not ok:
        raise HTTPException(404, "Etiket bulunamadı")
    return {"ok": True}
