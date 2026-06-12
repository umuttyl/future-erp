from __future__ import annotations
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint, func
from app.models.base import Base


class RecordTag(Base):
    __tablename__ = "record_tags"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)   # "customer" | "product" | "order"
    entity_id = Column(Integer, nullable=False)
    tag = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "entity_type", "entity_id", "tag", name="uq_record_tag"),
    )
