import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Any, Optional

from dependencies import get_db
from models.feedback import Feedback

router = APIRouter(prefix="/feedback", tags=["feedback"])

_TASK_KEYS = ["task_1", "task_2", "task_3", "task_4"]
_TASK_LABELS = {
    "task_1": "Create Chapter Event",
    "task_2": "Create Tour Event",
    "task_3": "Review Generated Sessions",
    "task_4": "Review Event Summary",
}
_STATUS_VALUES = ["worked", "confusing", "failed", "not_tested"]
_RATING_VALUES = ["good", "okay", "frustrating"]


def _compute_summary(responses: dict) -> dict:
    return {
        "overall_rating": responses.get("overall_rating"),
        "worked": sum(1 for k in _TASK_KEYS if responses.get(k) == "worked"),
        "confusing": sum(1 for k in _TASK_KEYS if responses.get(k) == "confusing"),
        "failed": sum(1 for k in _TASK_KEYS if responses.get(k) == "failed"),
        "not_tested": sum(1 for k in _TASK_KEYS if responses.get(k) == "not_tested"),
    }


class FeedbackIn(BaseModel):
    feature: str
    version: str
    responses: dict[str, Any]
    time_to_complete: Optional[int] = None


@router.post("", status_code=201)
def submit_feedback(payload: FeedbackIn, db: Session = Depends(get_db)):
    if not payload.feature or not payload.version:
        raise HTTPException(status_code=422, detail="feature and version are required")
    summary = _compute_summary(payload.responses)
    record = Feedback(
        feature=payload.feature,
        version=payload.version,
        responses=json.dumps(payload.responses),
        summary=json.dumps(summary),
        time_to_complete=payload.time_to_complete,
    )
    db.add(record)
    db.commit()
    return {"status": "ok", "id": str(record.id)}


@router.get("")
def list_feedback(
    feature: Optional[str] = Query(None),
    version: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Feedback)
    if feature:
        q = q.filter(Feedback.feature == feature)
    if version:
        q = q.filter(Feedback.version == version)
    rows = q.order_by(Feedback.submitted_at.desc()).all()

    # Aggregate rating counts
    rating_counts = {r: 0 for r in _RATING_VALUES}
    task_breakdown = {
        k: {s: 0 for s in _STATUS_VALUES}
        for k in _TASK_KEYS
    }
    entries = []

    for row in rows:
        try:
            resp = json.loads(row.responses)
        except Exception:
            resp = {}
        try:
            summ = json.loads(row.summary) if row.summary else {}
        except Exception:
            summ = {}

        # Rating
        rating = resp.get("overall_rating") or summ.get("overall_rating")
        if rating in rating_counts:
            rating_counts[rating] += 1

        # Task breakdown
        for key in _TASK_KEYS:
            val = resp.get(key)
            if val in _STATUS_VALUES:
                task_breakdown[key][val] += 1

        entries.append({
            "id": str(row.id),
            "feature": row.feature,
            "version": row.version,
            "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
            "time_to_complete": row.time_to_complete,
            "overall_rating": rating,
            "responses": resp,
        })

    task_breakdown_list = [
        {
            "key": k,
            "label": _TASK_LABELS[k],
            **task_breakdown[k],
        }
        for k in _TASK_KEYS
    ]

    return {
        "total": len(rows),
        "rating_counts": rating_counts,
        "task_breakdown": task_breakdown_list,
        "entries": entries,
    }

