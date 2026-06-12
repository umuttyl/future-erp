from __future__ import annotations
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, func
from app.models.base import Base


class RecordComment(Base):
    __tablename__ = "record_comments"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)   # "customer" | "product" | "order"
    entity_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    author_name = Column(String(150), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
