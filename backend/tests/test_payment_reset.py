from fastapi.testclient import TestClient

from main import app


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
