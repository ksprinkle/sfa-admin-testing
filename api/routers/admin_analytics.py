from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_admin
from api.schemas.executive_analytics import ExecutiveAnalyticsOut, ExecutiveSummaryOut
from api.services.executive_analytics_projection import (
    get_executive_analytics_projection,
    get_executive_summary_projection,
)


router = APIRouter(
    prefix="/admin/analytics",
    tags=["Admin Analytics"],
)


@router.get("/executive-dashboard", response_model=ExecutiveAnalyticsOut)
def get_executive_dashboard_metrics(
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    return get_executive_analytics_projection(db)


@router.get("/executive-summary", response_model=ExecutiveSummaryOut)
def get_executive_summary_metrics(
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    return get_executive_summary_projection(db)
