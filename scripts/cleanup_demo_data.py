"""One-time script: delete all demo tenants and their users (keeps platform admin)."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select
from app.core.db import SessionLocal
from app.models.tenant import Tenant
from app.models.user import User

db = SessionLocal()
try:
    # Find and delete all non-platform-admin users (tenant users)
    users_deleted = db.execute(
        delete(User).where(User.is_platform_admin.is_(False))
    ).rowcount

    # Delete all tenants
    tenants_deleted = db.execute(delete(Tenant)).rowcount

    db.commit()
    print(f"Deleted {users_deleted} tenant users and {tenants_deleted} tenants.")
    print("Platform admin account preserved.")
    print("You can now sign up fresh at /signup.")
except Exception as e:
    db.rollback()
    print(f"Error: {e}")
finally:
    db.close()
