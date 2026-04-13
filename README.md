# QR Event Check-in System

A production-ready, full-stack system for managing event registrations, payment confirmation, QR code generation, and on-site check-in via camera scan.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Browser (React + TypeScript + Tailwind)                      │
│                                                               │
│  /            Home — links to Admin & Scanner                 │
│  /admin       Admin dashboard — manage users, payments, QRs   │
│  /scanner     Staff camera scanner — calls /checkin           │
│  /qr/:token   Attendee QR page — shows QR code + status       │
└────────────────────────┬──────────────────────────────────────┘
                         │ HTTP (Vite proxy in dev)
                         ▼
┌───────────────────────────────────────────────────────────────┐
│  FastAPI (Python)                                             │
│                                                               │
│  GET  /users                   List all participants          │
│  POST /users                   Create participant             │
│  GET  /users/{id}              Get one participant            │
│  PATCH /users/{id}/payment     Update payment status          │
│  POST /generate-qr             Generate QR token (paid only)  │
│  POST /checkin                 Validate token, mark attended  │
│  GET  /health                  Health check                   │
└────────────────────────┬──────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                        │
      InMemoryDatabase        GoogleSheetsDatabase
      (default / dev)         (set DATABASE_BACKEND=sheets)
```

---

## Folder Structure

```
.
├── backend/
│   ├── main.py               # FastAPI app, lifespan, CORS, router wiring
│   ├── models.py             # Pydantic models (User, CheckinResponse, …)
│   ├── database.py           # Abstract DB + InMemory + GoogleSheets impls
│   ├── routers/
│   │   ├── users.py          # CRUD for participants
│   │   ├── qr.py             # QR token generation
│   │   └── checkin.py        # Check-in validation
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    ├── index.html
    ├── vite.config.ts        # Dev proxy: /api → http://localhost:8000
    ├── tailwind.config.js
    ├── package.json
    └── src/
        ├── main.tsx
        ├── App.tsx            # BrowserRouter + route table
        ├── index.css          # Tailwind directives + reusable classes
        ├── types/index.ts     # TypeScript types (mirrors Pydantic models)
        ├── api/client.ts      # Axios instance + typed API functions
        ├── components/
        │   ├── Navbar.tsx
        │   ├── StatusBadge.tsx
        │   └── LoadingSpinner.tsx
        └── pages/
            ├── HomePage.tsx
            ├── QRPage.tsx     # /qr/:token — attendee view
            ├── ScannerPage.tsx # /scanner — staff camera page
            └── AdminPage.tsx   # /admin — management dashboard
```

---

## Running Locally

### Prerequisites

- Python 3.11+
- Node.js 18+

---

### 1. Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy env file and edit if needed
cp .env.example .env

# Start the server (auto-reloads on code changes)
uvicorn main:app --reload --port 8000
```

API docs available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc:       http://localhost:8000/redoc

---

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy env file (no changes needed for local dev)
cp .env.example .env

# Start dev server
npm run dev
```

Open http://localhost:5173

---

## Database Backends

### In-Memory (default)

No configuration needed. Data is seeded with 4 sample users on startup and **lost on restart**. Ideal for development and demos.

### Google Sheets

1. Create a Google Cloud project and enable the **Google Sheets API**.
2. Create a **Service Account** and download the JSON key.
3. Create a spreadsheet and share it with the service account email (Editor).
4. Set the following in `backend/.env`:

```env
DATABASE_BACKEND=sheets
GOOGLE_SHEETS_ID=your_spreadsheet_id
GOOGLE_SA_KEY_FILE=service_account.json
```

The backend creates the `Users` worksheet automatically with the correct headers.

**Column mapping:**

| Col | Field          |
|-----|----------------|
| A   | id             |
| B   | name           |
| C   | phone          |
| D   | payment_status |
| E   | qr_token       |
| F   | checked_in     |
| G   | checked_in_at  |

---

## Check-in Flow

```
Admin marks payment_status = "paid"
        ↓
POST /generate-qr  →  stores secrets.token_urlsafe(32) on user
        ↓
QR URL sent to user:  http://your-domain/qr/<token>
        ↓
Attendee shows QR page on phone at event entrance
        ↓
Staff scans with /scanner page
        ↓
POST /checkin { qr_token }
  ├─ invalid token     → { status: "invalid" }        ❌
  ├─ already checked   → { status: "already_checked" } ⚠️
  └─ first check-in    → { status: "success" }         ✅  (writes checked_in + checked_in_at)
```

---

## API Reference

### `GET /users`
Returns all participants.

### `POST /users`
```json
{ "name": "Alice Kim", "phone": "010-1234-5678" }
```

### `PATCH /users/{id}/payment`
```json
{ "payment_status": "paid" }
```

### `POST /generate-qr`
```json
{ "user_id": "usr_001" }
```
Response:
```json
{
  "user_id": "usr_001",
  "qr_token": "xK2p…",
  "qr_url": "http://localhost:5173/qr/xK2p…"
}
```

### `POST /checkin`
```json
{ "qr_token": "xK2p…" }
```
Response:
```json
{
  "status": "success",
  "message": "Welcome, Alice Kim! Check-in recorded at 09:31:04 UTC.",
  "user": { … }
}
```

### `GET /health`
```json
{ "status": "ok", "version": "1.0.0" }
```

---

## Security Notes

- Tokens are generated with `secrets.token_urlsafe(32)` — 256 bits of entropy.
- Duplicate check-in is prevented at the database layer (atomic read-then-write).
- CORS origins are allowlist-controlled via `CORS_ORIGINS` env variable.
- All inputs are validated by Pydantic before reaching business logic.

---

## Production Checklist

- [ ] Set `FRONTEND_BASE_URL` and `CORS_ORIGINS` to real domain(s).
- [ ] Switch to `DATABASE_BACKEND=sheets` or add PostgreSQL (swap `database.py`).
- [ ] Run FastAPI with multiple workers: `uvicorn main:app --workers 4`.
  - ⚠️ InMemoryDatabase is not thread-safe across workers — use Sheets or SQL.
- [ ] Serve frontend build (`npm run build`) via CDN or nginx.
- [ ] Add HTTPS (Let's Encrypt / Cloudflare).
- [ ] Restrict `/admin` behind authentication (e.g., HTTP Basic or OAuth2).
