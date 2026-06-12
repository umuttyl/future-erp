from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class EmployeePerformanceOut(BaseModel):
    """Çok boyutlu performans satırı — satış, görev ve aktivite bazlı."""

    id: int = Field(description="Kullanıcı (çalışan) ID")
    full_name: str = Field(description="Görünen ad")
    email: str = Field(description="Kurumsal e-posta")
    is_active: bool = Field(description="Hesap aktif mi")
    role: str
    role_kind: Optional[str] = None
    department: Optional[str] = None
    ai_score: int = Field(ge=1, le=100, description="Verimlilik skoru 1-100")
    ai_insight: str = Field(description="Kısa AI değerlendirmesi")
    # Satış boyutu
    sales_count: int = Field(default=0, description="Oluşturduğu satış sayısı")
    sales_revenue: float = Field(default=0.0, description="Toplam satış cirosu")
    # Görev boyutu
    tasks_total: int = Field(default=0, description="Atanan toplam görev sayısı")
    tasks_done: int = Field(default=0, description="Tamamlanan görev sayısı")


class TeamTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    description: Optional[str] = Field(None, max_length=1024)
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: str = Field("medium", pattern="^(low|medium|high)$")
    status: str = Field("todo", pattern="^(todo|in_progress|done)$")
    customer_id: Optional[int] = None
    supply_order_id: Optional[int] = None


class TeamTaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    description: Optional[str] = Field(None, max_length=1024)
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: Optional[str] = Field(None, pattern="^(low|medium|high)$")
    status: Optional[str] = Field(None, pattern="^(todo|in_progress|done)$")
    customer_id: Optional[int] = None
    supply_order_id: Optional[int] = None


class TeamTaskOut(BaseModel):
    id: int
    tenant_id: int
    title: str
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None
    created_by_user_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: str
    status: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    supply_order_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
