from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.db import ensure_database_exists


def main() -> None:
    url = make_url(settings.DATABASE_URL)
    db_name = url.database
    if not db_name:
        raise SystemExit("DATABASE_URL does not include a database name.")

    ensure_database_exists()
    print(f"OK: database ensured: {db_name}")


if __name__ == "__main__":
    main()

