"""
Users router — CRUD for participant management (admin-facing).
"""

from __future__ import annotations

import os
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status

from models import PaymentStatus, PaymentUpdate, User, UserCreate, UserResponse
from database import Database

router = APIRouter(prefix="/users", tags=["users"])


# ---------------------------------------------------------------------------
# Dependency: pull database from app state
# ---------------------------------------------------------------------------

def get_db(request: Request) -> Database:
    return request.app.state.db


def build_qr_url(request: Request, token: str | None) -> str | None:
    if not token:
        return None
    base = os.getenv("FRONTEND_BASE_URL", str(request.base_url).rstrip("/"))
    return f"{base}/qr/{token}"


def user_to_response(user: User, request: Request) -> UserResponse:
    return UserResponse(
        **user.model_dump(),
        qr_url=build_qr_url(request, user.qr_token),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=List[UserResponse], summary="List all users")
def list_users(request: Request, db: Database = Depends(get_db)):
    """Return every participant — used by the admin dashboard."""
    users = db.get_all_users()
    return [user_to_response(u, request) for u in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED,
             summary="Register a new user")
def create_user(body: UserCreate, request: Request, db: Database = Depends(get_db)):
    """Create a new participant record."""
    new_user = User(
        id=f"usr_{uuid.uuid4().hex[:8]}",
        name=body.name,
        phone=body.phone,
        payment_status=PaymentStatus.pending,
    )
    try:
        created = db.create_user(new_user)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return user_to_response(created, request)


@router.get("/{user_id}", response_model=UserResponse, summary="Get a single user")
def get_user(user_id: str, request: Request, db: Database = Depends(get_db)):
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_to_response(user, request)


@router.patch("/{user_id}/payment", response_model=UserResponse,
              summary="Update payment status")
def update_payment(
    user_id: str,
    body: PaymentUpdate,
    request: Request,
    db: Database = Depends(get_db),
):
    """Toggle a participant's payment status (pending ↔ paid)."""
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.payment_status = body.payment_status
    if body.payment_status == PaymentStatus.pending:
        # Cancelled payments must revoke QR access and clear attendance state.
        user.qr_token = None
        user.checked_in = False
        user.checked_in_at = None
    updated = db.update_user(user)
    return user_to_response(updated, request)


@router.delete("/{user_id}/checkin", response_model=UserResponse,
               summary="Cancel check-in")
def cancel_checkin(user_id: str, request: Request, db: Database = Depends(get_db)):
    """Clear a participant's attendance state without changing payment or QR."""
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.checked_in = False
    user.checked_in_at = None
    updated = db.update_user(user)
    return user_to_response(updated, request)
