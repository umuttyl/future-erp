from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict, Field


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    permissions: List[str]
    is_system: bool
    created_at: datetime


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    permissions: List[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    permissions: List[str] | None = None
