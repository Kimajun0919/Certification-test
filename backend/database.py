"""
Database abstraction layer.

The abstract base class `Database` defines the interface every backend must
implement.  Two concrete implementations are provided:

  - InMemoryDatabase   – zero-dependency, great for local dev / testing
  - GoogleSheetsDatabase – wraps Google Sheets via the Sheets API v4

Switch between them by setting DATABASE_BACKEND in your .env file.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from copy import deepcopy
from datetime import datetime
from typing import Dict, List, Optional

from models import PaymentStatus, User


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class Database(ABC):
    @abstractmethod
    def get_user(self, user_id: str) -> Optional[User]: ...

    @abstractmethod
    def get_user_by_token(self, token: str) -> Optional[User]: ...

    @abstractmethod
    def get_all_users(self) -> List[User]: ...

    @abstractmethod
    def create_user(self, user: User) -> User: ...

    @abstractmethod
    def update_user(self, user: User) -> User: ...


# ---------------------------------------------------------------------------
# In-memory implementation (default)
# ---------------------------------------------------------------------------

class InMemoryDatabase(Database):
    """Thread-unsafe in-memory store — suitable for single-worker dev servers.

    For multi-worker production use, replace with GoogleSheetsDatabase or a
    proper SQL backend (PostgreSQL + SQLAlchemy is the recommended upgrade
    path; the same interface is preserved).
    """

    def __init__(self) -> None:
        self._users: Dict[str, User] = {}
        self._token_index: Dict[str, str] = {}  # token → user_id
        self._seed()

    # ------------------------------------------------------------------
    # Seed data
    # ------------------------------------------------------------------

    def _seed(self) -> None:
        seed = [
            User(id="usr_001", name="Alice Kim",    phone="010-1234-5678", payment_status=PaymentStatus.paid),
            User(id="usr_002", name="Bob Lee",      phone="010-8765-4321", payment_status=PaymentStatus.pending),
            User(id="usr_003", name="Charlie Park", phone="010-1111-2222", payment_status=PaymentStatus.paid),
            User(id="usr_004", name="Diana Choi",   phone="010-9999-0000", payment_status=PaymentStatus.pending),
        ]
        for user in seed:
            self._store(user)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _store(self, user: User) -> None:
        """Write user to primary store and keep token index consistent."""
        old = self._users.get(user.id)
        if old and old.qr_token and old.qr_token != user.qr_token:
            # Remove stale token mapping
            self._token_index.pop(old.qr_token, None)

        self._users[user.id] = deepcopy(user)
        if user.qr_token:
            self._token_index[user.qr_token] = user.id

    # ------------------------------------------------------------------
    # Database interface
    # ------------------------------------------------------------------

    def get_user(self, user_id: str) -> Optional[User]:
        return deepcopy(self._users.get(user_id))

    def get_user_by_token(self, token: str) -> Optional[User]:
        user_id = self._token_index.get(token)
        if user_id:
            return deepcopy(self._users.get(user_id))
        return None

    def get_all_users(self) -> List[User]:
        return [deepcopy(u) for u in self._users.values()]

    def create_user(self, user: User) -> User:
        if user.id in self._users:
            raise ValueError(f"User {user.id!r} already exists")
        self._store(user)
        return deepcopy(user)

    def update_user(self, user: User) -> User:
        if user.id not in self._users:
            raise KeyError(f"User {user.id!r} not found")
        self._store(user)
        return deepcopy(user)


# ---------------------------------------------------------------------------
# Google Sheets implementation
# ---------------------------------------------------------------------------

class GoogleSheetsDatabase(Database):
    """Persists all data in a Google Sheets spreadsheet.

    Sheet layout (one header row, then one row per user):
        A: id | B: name | C: phone | D: payment_status
        E: qr_token | F: checked_in | G: checked_in_at

    Set up:
        1. Create a Service Account in Google Cloud Console.
        2. Share the spreadsheet with the service account email.
        3. Download the JSON key file and set GOOGLE_SA_KEY_FILE in .env.
        4. Set GOOGLE_SHEETS_ID to your spreadsheet ID.
        5. Set DATABASE_BACKEND=sheets in .env.
    """

    HEADER = ["id", "name", "phone", "payment_status",
              "qr_token", "checked_in", "checked_in_at"]
    SHEET_NAME = "Users"

    def __init__(self, spreadsheet_id: str, credentials_file: str) -> None:
        try:
            import gspread
            from google.oauth2.service_account import Credentials
        except ImportError as exc:
            raise RuntimeError(
                "Google Sheets backend requires 'gspread' and "
                "'google-auth'. Run: pip install gspread google-auth"
            ) from exc

        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
        ]
        creds = Credentials.from_service_account_file(credentials_file, scopes=scopes)
        self._client = gspread.authorize(creds)
        self._spreadsheet_id = spreadsheet_id
        self._ws = self._get_or_create_worksheet()

    # ------------------------------------------------------------------
    # Worksheet setup
    # ------------------------------------------------------------------

    def _get_or_create_worksheet(self):
        sh = self._client.open_by_key(self._spreadsheet_id)
        try:
            ws = sh.worksheet(self.SHEET_NAME)
        except Exception:
            ws = sh.add_worksheet(title=self.SHEET_NAME, rows=1000, cols=len(self.HEADER))
            ws.append_row(self.HEADER)
        return ws

    # ------------------------------------------------------------------
    # Row <-> User conversion
    # ------------------------------------------------------------------

    def _row_to_user(self, row: list) -> Optional[User]:
        if not row or not row[0]:
            return None
        # Pad short rows
        row = row + [""] * (len(self.HEADER) - len(row))
        try:
            return User(
                id=row[0],
                name=row[1],
                phone=row[2],
                payment_status=PaymentStatus(row[3]) if row[3] else PaymentStatus.pending,
                qr_token=row[4] or None,
                checked_in=str(row[5]).lower() in ("true", "1", "yes"),
                checked_in_at=datetime.fromisoformat(row[6]) if row[6] else None,
            )
        except Exception:
            return None

    def _user_to_row(self, user: User) -> list:
        return [
            user.id,
            user.name,
            user.phone,
            user.payment_status,
            user.qr_token or "",
            str(user.checked_in),
            user.checked_in_at.isoformat() if user.checked_in_at else "",
        ]

    # ------------------------------------------------------------------
    # Database interface
    # ------------------------------------------------------------------

    def _all_rows(self) -> list:
        """Return all data rows (excluding header)."""
        return self._ws.get_all_values()[1:]

    def _find_row_index(self, user_id: str) -> Optional[int]:
        """Return 1-based sheet row index for the given user_id, or None."""
        rows = self._ws.get_all_values()
        for i, row in enumerate(rows):
            if row and row[0] == user_id:
                return i + 1  # Sheets rows are 1-indexed
        return None

    def get_user(self, user_id: str) -> Optional[User]:
        for row in self._all_rows():
            if row and row[0] == user_id:
                return self._row_to_user(row)
        return None

    def get_user_by_token(self, token: str) -> Optional[User]:
        for row in self._all_rows():
            if len(row) > 4 and row[4] == token:
                return self._row_to_user(row)
        return None

    def get_all_users(self) -> List[User]:
        users = []
        for row in self._all_rows():
            user = self._row_to_user(row)
            if user:
                users.append(user)
        return users

    def create_user(self, user: User) -> User:
        self._ws.append_row(self._user_to_row(user))
        return user

    def update_user(self, user: User) -> User:
        idx = self._find_row_index(user.id)
        if idx is None:
            raise KeyError(f"User {user.id!r} not found in sheet")
        self._ws.update(f"A{idx}:G{idx}", [self._user_to_row(user)])
        return user


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_database() -> Database:
    """Read DATABASE_BACKEND from environment and return the correct instance."""
    import os
    backend = os.getenv("DATABASE_BACKEND", "memory").lower()

    if backend == "sheets":
        spreadsheet_id = os.environ["GOOGLE_SHEETS_ID"]
        credentials_file = os.environ["GOOGLE_SA_KEY_FILE"]
        return GoogleSheetsDatabase(spreadsheet_id, credentials_file)

    # Default: in-memory
    return InMemoryDatabase()
