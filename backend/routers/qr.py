"""
QR generation router.

A QR code is a URL that encodes the token:
    {FRONTEND_BASE_URL}/qr/{token}

The frontend's /qr/[token] page renders the actual QR image via qrcode.react,
so the backend only needs to store and return the token + URL.
"""

from __future__ import annotations

import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request

from models import GenerateQRRequest, GenerateQRResponse, PaymentStatus
from database import Database

router = APIRouter(prefix="/generate-qr", tags=["qr"])


def get_db(request: Request) -> Database:
    return request.app.state.db


def build_qr_url(request: Request, token: str) -> str:
    base = os.getenv("FRONTEND_BASE_URL", str(request.base_url).rstrip("/"))
    return f"{base}/qr/{token}"


@router.post("", response_model=GenerateQRResponse, summary="Generate QR token for a paid user")
def generate_qr(body: GenerateQRRequest, request: Request, db: Database = Depends(get_db)):
    """
    Generate a cryptographically secure, URL-safe token and store it on the user.

    Rules:
    - User must exist.
    - User must have payment_status == "paid".
    - If a token already exists it is returned as-is (idempotent).
    """
    user = db.get_user(body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.payment_status != PaymentStatus.paid:
        raise HTTPException(
            status_code=400,
            detail="QR can only be generated for users with payment_status='paid'",
        )

    # Idempotent: reuse existing token if already generated
    if not user.qr_token:
        # 32 bytes → 43 URL-safe Base64 characters; effectively unguessable
        user.qr_token = secrets.token_urlsafe(32)
        db.update_user(user)

    qr_url = build_qr_url(request, user.qr_token)

    return GenerateQRResponse(
        user_id=user.id,
        qr_token=user.qr_token,
        qr_url=qr_url,
    )
