from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# In dev/test, use a much higher limit so localhost testing isn't blocked.
# In production, the per-route limits apply normally.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[] if settings.is_production else ["1000/minute"],  # type: ignore[arg-type]
)
