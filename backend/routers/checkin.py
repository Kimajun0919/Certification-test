"""
Check-in router.

Validates the token scanned from the QR code and updates attendance state.
All state transitions are logged; responses are colour-coded by the frontend.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request

from models import CheckinRequest, CheckinResponse
from database import Database

router = APIRouter(prefix="/checkin", tags=["checkin"])


def get_db(request: Request) -> Database:
    return request.app.state.db


@router.post("", response_model=CheckinResponse, summary="Validate QR token and record attendance")
def checkin(body: CheckinRequest, request: Request, db: Database = Depends(get_db)):
    """
    Token validation logic:

    1. Token not found                    → status="invalid"
    2. Token found, already checked in    → status="already_checked"
    3. Token found, first check-in        → status="success", update DB
    """
    token = body.qr_token.strip()

    # --- Lookup -------------------------------------------------------
    user = db.get_user_by_token(token)

    if not user:
        return CheckinResponse(
            status="invalid",
            message="QR code is invalid or has been revoked.",
        )

    # --- Duplicate guard ----------------------------------------------
    if user.checked_in:
        return CheckinResponse(
            status="already_checked",
            message=f"{user.name} has already checked in at "
                    f"{user.checked_in_at.strftime('%H:%M:%S') if user.checked_in_at else 'unknown time'}.",
            user=user,
        )

    # --- Record check-in ----------------------------------------------
    user.checked_in = True
    user.checked_in_at = datetime.now(tz=timezone.utc)
    db.update_user(user)

    return CheckinResponse(
        status="success",
        message=f"Welcome, {user.name}! Check-in recorded at "
                f"{user.checked_in_at.strftime('%H:%M:%S')} UTC.",
        user=user,
    )
