from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class EmployeePerformanceOut(BaseModel):
    """AI destekli performans satırı (kiracı içi çalışan)."""

    id: int = Field(description="Kullanıcı (çalışan) ID")
    full_name: str = Field(description="Görünen ad")
    email: str = Field(description="Kurumsal e-posta")
    is_active: bool = Field(description="Hesap aktif mi")
    role: str
    department: Optional[str] = None
    ai_score: int = Field(ge=1, le=100, description="Verimlilik skoru 1-100")
    ai_insight: str = Field(description="Kısa AI değerlendirmesi")
