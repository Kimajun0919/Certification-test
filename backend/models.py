"""
Pydantic models for the QR check-in system.
These models serve as the single source of truth for data shapes across
the API, database layer, and Google Sheets integration.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator
import re


class PaymentStatus(str, Enum):
    pending = "pending"
    paid = "paid"


# ---------------------------------------------------------------------------
# Core domain model
# ---------------------------------------------------------------------------

class User(BaseModel):
    id: str
    name: str
    phone: str
    payment_status: PaymentStatus = PaymentStatus.pending
    qr_token: Optional[str] = None
    checked_in: bool = False
    checked_in_at: Optional[datetime] = None

    model_config = {"use_enum_values": True}


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=7, max_length=20)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        # Allow digits, spaces, hyphens, plus sign
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\+?\d{7,15}$", cleaned):
            raise ValueError("Invalid phone number format")
        return v


class PaymentUpdate(BaseModel):
    payment_status: PaymentStatus


class GenerateQRRequest(BaseModel):
    user_id: str = Field(..., min_length=1)


class CheckinRequest(BaseModel):
    qr_token: str = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Response envelopes
# ---------------------------------------------------------------------------

class GenerateQRResponse(BaseModel):
    user_id: str
    qr_token: str
    qr_url: str


class CheckinResponse(BaseModel):
    status: str          # "success" | "already_checked" | "invalid"
    message: str
    user: Optional[User] = None


class UserResponse(BaseModel):
    """User model exposed through the API (same fields, explicit serialisation)."""
    id: str
    name: str
    phone: str
    payment_status: str
    qr_token: Optional[str]
    checked_in: bool
    checked_in_at: Optional[datetime]
    qr_url: Optional[str] = None  # populated by the router
