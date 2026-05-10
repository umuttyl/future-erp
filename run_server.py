"""Backend'i proje kökünden başlatır (çalışma dizini yanlışsa köke geçer)."""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parent


def main() -> None:
    os.chdir(ROOT)
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(
        "app.main:app",
        host=os.environ.get("HOST", "127.0.0.1"),
        port=port,
        reload=True,
    )


if __name__ == "__main__":
    main()
