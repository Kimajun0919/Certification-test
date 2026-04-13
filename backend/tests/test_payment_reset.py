from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import _normalize_user_state
from main import app
from models import PaymentStatus, User


def test_get_user_by_token_returns_user():
    with TestClient(app) as client:
        qr_res = client.post("/generate-qr", json={"user_id": "usr_001"})
        assert qr_res.status_code == 200
        token = qr_res.json()["qr_token"]

        user_res = client.get(f"/users/token/{token}")
        assert user_res.status_code == 200
        payload = user_res.json()
        assert payload["id"] == "usr_001"
        assert payload["name"] == "Alice Kim"
        assert payload["qr_token"] == token


def test_pending_user_state_is_normalized():
    user = User(
        id="usr_sheet_pending",
        name="Pending User",
        phone="010-2222-3333",
        payment_status=PaymentStatus.pending,
        qr_token="stale-token",
        checked_in=True,
    )

    normalized = _normalize_user_state(user)

    assert normalized.payment_status == PaymentStatus.pending
    assert normalized.qr_token is None
    assert normalized.checked_in is False
    assert normalized.checked_in_at is None


def test_cancel_payment_resets_qr_and_attendance():
    with TestClient(app) as client:
        qr_res = client.post("/generate-qr", json={"user_id": "usr_001"})
        assert qr_res.status_code == 200
        token = qr_res.json()["qr_token"]

        checkin_res = client.post("/checkin", json={"qr_token": token})
        assert checkin_res.status_code == 200
        assert checkin_res.json()["status"] == "success"

        payment_res = client.patch(
            "/users/usr_001/payment",
            json={"payment_status": "pending"},
        )
        assert payment_res.status_code == 200
        payload = payment_res.json()
        assert payload["payment_status"] == "pending"
        assert payload["qr_token"] is None
        assert payload["qr_url"] is None
        assert payload["checked_in"] is False
        assert payload["checked_in_at"] is None

        revoked_res = client.post("/checkin", json={"qr_token": token})
        assert revoked_res.status_code == 200
        assert revoked_res.json()["status"] == "invalid"


def test_cancel_checkin_clears_attendance_but_keeps_qr_valid():
    with TestClient(app) as client:
        qr_res = client.post("/generate-qr", json={"user_id": "usr_003"})
        assert qr_res.status_code == 200
        token = qr_res.json()["qr_token"]

        checkin_res = client.post("/checkin", json={"qr_token": token})
        assert checkin_res.status_code == 200
        assert checkin_res.json()["status"] == "success"

        cancel_res = client.delete("/users/usr_003/checkin")
        assert cancel_res.status_code == 200
        payload = cancel_res.json()
        assert payload["checked_in"] is False
        assert payload["checked_in_at"] is None
        assert payload["payment_status"] == "paid"
        assert payload["qr_token"] == token
        assert payload["qr_url"] is not None

        recheckin_res = client.post("/checkin", json={"qr_token": token})
        assert recheckin_res.status_code == 200
        assert recheckin_res.json()["status"] == "success"
