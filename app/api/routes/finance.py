from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services.finance_service import finance_service


router = APIRouter()


@router.get("/summary")
def finance_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return finance_service.summary(db, start_date=start_date, end_date=end_date)


@router.get("/monthly")
def finance_monthly(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    return finance_service.monthly_revenue(db, start_date=start_date, end_date=end_date)


@router.get("/top-customers")
def finance_top_customers(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = 5,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    return finance_service.top_customers(
        db, start_date=start_date, end_date=end_date, limit=limit
    )


@router.get("/top-products")
def finance_top_products(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = 5,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    return finance_service.top_products(
        db, start_date=start_date, end_date=end_date, limit=limit
    )
