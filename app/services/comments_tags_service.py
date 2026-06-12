from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from app.models.record_comment import RecordComment
from app.models.record_tag import RecordTag


# ── Comments ──────────────────────────────────────────────────────────────────

def list_comments(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
) -> list[RecordComment]:
    return (
        db.execute(
            select(RecordComment)
            .where(
                RecordComment.tenant_id == tenant_id,
                RecordComment.entity_type == entity_type,
                RecordComment.entity_id == entity_id,
            )
            .order_by(RecordComment.created_at.desc())
        )
        .scalars()
        .all()
    )


def add_comment(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
    user_id: int,
    author_name: str,
    body: str,
) -> RecordComment:
    c = RecordComment(
        tenant_id=tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        author_name=author_name,
        body=body.strip(),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def delete_comment(
    db: Session,
    *,
    tenant_id: int,
    comment_id: int,
    user_id: int,
    is_manager: bool,
) -> bool:
    row = db.get(RecordComment, comment_id)
    if row is None or row.tenant_id != tenant_id:
        return False
    if not is_manager and row.user_id != user_id:
        return False
    db.delete(row)
    db.commit()
    return True


# ── Tags ──────────────────────────────────────────────────────────────────────

def list_tags(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
) -> list[str]:
    rows = (
        db.execute(
            select(RecordTag.tag)
            .where(
                RecordTag.tenant_id == tenant_id,
                RecordTag.entity_type == entity_type,
                RecordTag.entity_id == entity_id,
            )
            .order_by(RecordTag.tag)
        )
        .scalars()
        .all()
    )
    return list(rows)


def add_tag(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
    tag: str,
) -> bool:
    tag = tag.strip()
    existing = db.execute(
        select(RecordTag).where(
            RecordTag.tenant_id == tenant_id,
            RecordTag.entity_type == entity_type,
            RecordTag.entity_id == entity_id,
            RecordTag.tag == tag,
        )
    ).scalar_one_or_none()
    if existing:
        return False
    db.add(RecordTag(
        tenant_id=tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        tag=tag,
    ))
    db.commit()
    return True


def batch_tags_for_entity_type(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
) -> dict[int, list[str]]:
    """Return {entity_id: [tag, ...]} for all entities of given type."""
    rows = db.execute(
        select(RecordTag.entity_id, RecordTag.tag)
        .where(
            RecordTag.tenant_id == tenant_id,
            RecordTag.entity_type == entity_type,
        )
        .order_by(RecordTag.entity_id, RecordTag.tag)
    ).all()
    result: dict[int, list[str]] = {}
    for entity_id, tag in rows:
        result.setdefault(entity_id, []).append(tag)
    return result


def remove_tag(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
    tag: str,
) -> bool:
    row = db.execute(
        select(RecordTag).where(
            RecordTag.tenant_id == tenant_id,
            RecordTag.entity_type == entity_type,
            RecordTag.entity_id == entity_id,
            RecordTag.tag == tag.strip(),
        )
    ).scalar_one_or_none()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True
