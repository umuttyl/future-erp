"""Uygulama genelinde kullanilan yapilandirilmis istisnaiar.

Her route'ta dogrudan FastAPI Response uretilir; bunun yerine
bu siniflari firlatiriz, main.py icindeki global handler tek tip JSON döner:

    {"error": {"code": "...", "message": "..." [, "details": ...]}}
"""


class AppException(Exception):
    """Taban istisnai (tum kodlu bizim hatular)."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "APP_ERROR",
        status_code: int = 400,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class NotFoundException(AppException):
    """Kaynak yok — 404."""

    def __init__(
        self,
        message: str = "Kaynak bulunamadı.",
        *,
        code: str = "NOT_FOUND",
    ) -> None:
        super().__init__(message, code=code, status_code=404)


class ValidationException(AppException):
    """Gecersiz girdi veya iş kuralı ihlâli — 400."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "VALIDATION_ERROR",
    ) -> None:
        super().__init__(message, code=code, status_code=400)


class UnauthorizedException(AppException):
    """Kimlik doğrulanmadı — 401."""

    def __init__(
        self,
        message: str = "Oturum gerekli.",
        *,
        code: str = "UNAUTHORIZED",
    ) -> None:
        super().__init__(message, code=code, status_code=401)


class PermissionException(AppException):
    """Yetkisiz erisim — 403."""

    def __init__(
        self,
        message: str = "Bu islem için yetkiniz yok.",
        *,
        code: str = "PERMISSION_DENIED",
    ) -> None:
        super().__init__(message, code=code, status_code=403)


class ConflictException(AppException):
    """Cakisma — 409 (ornegin duplicated SKU)."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "CONFLICT",
    ) -> None:
        super().__init__(message, code=code, status_code=409)


class InternalError(AppException):
    """Beklenmeyen sunucu hatasi — 500."""

    def __init__(
        self,
        message: str = "Bir sunucu hatasi olustu. Lütfen daha sonra deneyin.",
        *,
        code: str = "INTERNAL_ERROR",
    ) -> None:
        super().__init__(message, code=code, status_code=500)
