from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.exceptions import ValidationException
from app.services.nlp_assistant import UnsafeSQL, run_nlp_query

router = APIRouter()


class NLQueryRequest(BaseModel):
    text: str = Field(min_length=3, max_length=500)


class ChartHint(BaseModel):
    type: str = Field(default="none")
    x: Optional[str] = None
    y: Optional[str] = None
    title: Optional[str] = ""


class NLQueryResponse(BaseModel):
    sql: str
    columns: List[str]
    data: List[Dict[str, Any]]
    answer: str
    chart_hint: Optional[ChartHint] = None


@router.post("/query", response_model=NLQueryResponse)
def nlp_query(payload: NLQueryRequest, db: Session = Depends(get_db)):
    try:
        result = run_nlp_query(db, user_text=payload.text)
        return NLQueryResponse(
            sql=result.sql,
            columns=result.columns,
            data=result.data,
            answer=result.answer,
            chart_hint=ChartHint(**result.chart_hint) if result.chart_hint else None,
        )
    except UnsafeSQL as e:
        raise ValidationException(f"Guvenilmeyen sorgu reddedildi: {e}", code="UNSAFE_SQL") from e
    except RuntimeError as e:
        raise ValidationException(str(e), code="NLP_CONFIGURATION_ERROR") from e
