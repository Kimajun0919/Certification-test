"""
Database abstraction layer.

InMemoryDatabase   – 로컬 개발용
GoogleSheetsDatabase – 실제 운영용 (Google Sheets API v4)

실제 시트 컬럼 구조:
  A  타임스탬프
  B  1. 소속 다락방
  C  2. 소속 순
  D  3. 이름              → name
  E  4. 성별
  F  5. 연락처            → phone
  G  6. (출발 차량) ...
  H  7. (복귀 차량) ...
  I  중보로 함께하겠습니다
  J  회비 입금 안내
  K  입금완료여부         → payment_status  ("완료" → paid)
  L  qr_token            → 자동 추가
  M  checked_in          → 자동 추가
  N  checked_in_at       → 자동 추가
"""

from __future__ import annotations

import json
import os
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
# In-memory (개발용)
# ---------------------------------------------------------------------------

class InMemoryDatabase(Database):
    def __init__(self) -> None:
        self._users: Dict[str, User] = {}
        self._token_index: Dict[str, str] = {}
        self._seed()

    def _seed(self) -> None:
        for user in [
            User(id="usr_001", name="Alice Kim",    phone="010-1234-5678", payment_status=PaymentStatus.paid),
            User(id="usr_002", name="Bob Lee",      phone="010-8765-4321", payment_status=PaymentStatus.pending),
            User(id="usr_003", name="Charlie Park", phone="010-1111-2222", payment_status=PaymentStatus.paid),
            User(id="usr_004", name="Diana Choi",   phone="010-9999-0000", payment_status=PaymentStatus.pending),
        ]:
            self._store(user)

    def _store(self, user: User) -> None:
        old = self._users.get(user.id)
        if old and old.qr_token and old.qr_token != user.qr_token:
            self._token_index.pop(old.qr_token, None)
        self._users[user.id] = deepcopy(user)
        if user.qr_token:
            self._token_index[user.qr_token] = user.id

    def get_user(self, user_id: str) -> Optional[User]:
        return deepcopy(self._users.get(user_id))

    def get_user_by_token(self, token: str) -> Optional[User]:
        uid = self._token_index.get(token)
        return deepcopy(self._users.get(uid)) if uid else None

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
# Google Sheets (운영용)
# ---------------------------------------------------------------------------

# 기존 시트의 고정 컬럼 인덱스 (0-based)
_COL_NAME    = 3   # D: 이름
_COL_PHONE   = 5   # F: 연락처
_COL_PAYMENT = 10  # K: 입금완료여부

# 자동 추가되는 컬럼 인덱스
_COL_TOKEN      = 11  # L: qr_token
_COL_CHECKED_IN = 12  # M: checked_in
_COL_CHECKED_AT = 13  # N: checked_in_at

# 입금완료 값으로 인정하는 문자열
_PAID_VALUES = {"완료", "o", "y", "yes", "true", "1", "paid", "✓", "v"}


def _parse_payment(val: str) -> PaymentStatus:
    return PaymentStatus.paid if val.strip().lower() in _PAID_VALUES else PaymentStatus.pending


class GoogleSheetsDatabase(Database):
    """
    실제 구글 폼 응답 시트와 연동.
    - 기존 컬럼은 수정하지 않음
    - L(qr_token) / M(checked_in) / N(checked_in_at) 헤더가 없으면 자동 추가
    - Service Account 인증은 파일 또는 환경변수(JSON 문자열) 모두 지원
    """

    SHEET_NAME = "시트1"          # 시트 탭 이름 (기본값, 다르면 환경변수로 변경 가능)
    EXTRA_HEADERS = ["qr_token", "checked_in", "checked_in_at"]

    def __init__(self, spreadsheet_id: str, credentials) -> None:
        try:
            import gspread
        except ImportError as e:
            raise RuntimeError("pip install gspread 를 먼저 실행하세요.") from e

        self._client = gspread.authorize(credentials)
        self._sid = spreadsheet_id
        sheet_name = os.getenv("GOOGLE_SHEET_NAME", self.SHEET_NAME)
        print(f"[sheets] connecting to spreadsheet={spreadsheet_id}, sheet={sheet_name}")
        try:
            self._ws = self._client.open_by_key(self._sid).worksheet(sheet_name)
            print(f"[sheets] connected OK. row count: {self._ws.row_count}")
        except Exception as e:
            print(f"[sheets] connection error: {type(e).__name__}: {e}")
            raise
        self._ensure_extra_columns()

    # ------------------------------------------------------------------
    # 추가 컬럼 헤더 보장
    # ------------------------------------------------------------------

    def _ensure_extra_columns(self) -> None:
        """L·M·N 헤더가 없으면 1행에 자동으로 추가."""
        header_row = self._ws.row_values(1)
        # 컬럼이 부족하면 패딩
        while len(header_row) < _COL_TOKEN + 1:
            header_row.append("")

        changed = False
        for i, h in enumerate(self.EXTRA_HEADERS):
            col = _COL_TOKEN + i
            if col >= len(header_row) or header_row[col].strip() == "":
                # gspread는 1-indexed
                self._ws.update_cell(1, col + 1, h)
                changed = True

        if changed:
            print("[sheets] extra columns (qr_token / checked_in / checked_in_at) added to header row")

    # ------------------------------------------------------------------
    # 행 <-> User 변환
    # ------------------------------------------------------------------

    def _row_to_user(self, row: list, row_index: int) -> Optional[User]:
        """row_index: 1-based 시트 행 번호 (헤더=1, 첫 데이터=2)."""
        if not row or not any(row):
            return None

        def get(idx: int) -> str:
            return row[idx].strip() if idx < len(row) else ""

        name  = get(_COL_NAME)
        phone = get(_COL_PHONE)
        if not name and not phone:
            return None

        payment_val = get(_COL_PAYMENT)
        qr_token    = get(_COL_TOKEN) or None
        checked_in  = get(_COL_CHECKED_IN).lower() in ("true", "1", "yes")
        checked_at_str = get(_COL_CHECKED_AT)
        checked_at  = datetime.fromisoformat(checked_at_str) if checked_at_str else None

        return User(
            id=str(row_index),           # 행 번호를 ID로 사용
            name=name,
            phone=phone,
            payment_status=_parse_payment(payment_val),
            qr_token=qr_token,
            checked_in=checked_in,
            checked_in_at=checked_at,
        )

    # ------------------------------------------------------------------
    # 헬퍼
    # ------------------------------------------------------------------

    def _all_data(self) -> list:
        """헤더를 포함한 모든 행 반환."""
        return self._ws.get_all_values()

    def _find_row(self, user_id: str) -> Optional[int]:
        """user_id(행 번호 문자열) → 1-based 시트 행 인덱스."""
        try:
            return int(user_id)
        except ValueError:
            return None

    def _update_extra_cols(self, row_idx: int, user: User) -> None:
        """L·M·N 컬럼만 업데이트 (기존 데이터 보존)."""
        self._ws.update(
            f"L{row_idx}:N{row_idx}",
            [[
                user.qr_token or "",
                str(user.checked_in),
                user.checked_in_at.isoformat() if user.checked_in_at else "",
            ]]
        )

    # ------------------------------------------------------------------
    # Database interface
    # ------------------------------------------------------------------

    def get_all_users(self) -> List[User]:
        rows = self._all_data()
        users = []
        for i, row in enumerate(rows[1:], start=2):  # 헤더(row 1) 스킵
            user = self._row_to_user(row, i)
            if user:
                users.append(user)
        return users

    def get_user(self, user_id: str) -> Optional[User]:
        row_idx = self._find_row(user_id)
        if not row_idx:
            return None
        row = self._ws.row_values(row_idx)
        return self._row_to_user(row, row_idx)

    def get_user_by_token(self, token: str) -> Optional[User]:
        rows = self._all_data()
        for i, row in enumerate(rows[1:], start=2):
            if len(row) > _COL_TOKEN and row[_COL_TOKEN].strip() == token:
                return self._row_to_user(row, i)
        return None

    def create_user(self, user: User) -> User:
        """구글 폼 데이터가 이미 있으므로 일반적으로 사용 안 함."""
        raise NotImplementedError("Google Sheets 모드에서는 폼을 통해 등록합니다.")

    def update_user(self, user: User) -> User:
        row_idx = self._find_row(user.id)
        if not row_idx:
            raise KeyError(f"User {user.id!r} not found")
        # K열: 입금완료여부 → "완료" / "" 로 기록
        payment_val = "완료" if user.payment_status == PaymentStatus.paid else ""
        self._ws.update_cell(row_idx, _COL_PAYMENT + 1, payment_val)
        # L·M·N열: qr_token / checked_in / checked_in_at
        self._update_extra_cols(row_idx, user)
        return user


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_database() -> Database:
    backend = os.getenv("DATABASE_BACKEND", "memory").lower()

    if backend == "sheets":
        try:
            from google.oauth2.service_account import Credentials
        except ImportError as e:
            raise RuntimeError("pip install google-auth 를 먼저 실행하세요.") from e

        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]

        # 디버그: 어떤 환경변수가 주입됐는지 확인
        sheet_keys = [k for k in os.environ if "GOOGLE" in k or "DATABASE" in k]
        print(f"[sheets] available env keys: {sheet_keys}")

        spreadsheet_id = os.environ.get("GOOGLE_SHEETS_ID") or os.environ.get("GOOGLE_SHEET_ID")
        if not spreadsheet_id:
            raise RuntimeError(
                f"GOOGLE_SHEETS_ID 환경변수가 없습니다. "
                f"현재 환경변수 키 목록: {list(os.environ.keys())}"
            )

        # 방법 1: 환경변수에 JSON 내용 직접 (Railway 등 클라우드)
        key_json_str = os.getenv("GOOGLE_SA_KEY_JSON")
        if key_json_str:
            key_data = json.loads(key_json_str)
            # Railway 등 일부 환경에서 private_key의 \n이 \\n으로 이중 이스케이프됨 → 복원
            if "private_key" in key_data:
                key_data["private_key"] = key_data["private_key"].replace("\\n", "\n")
            credentials = Credentials.from_service_account_info(key_data, scopes=scopes)
        else:
            # 방법 2: 로컬 파일 경로
            key_file = os.environ["GOOGLE_SA_KEY_FILE"]
            credentials = Credentials.from_service_account_file(key_file, scopes=scopes)

        return GoogleSheetsDatabase(spreadsheet_id, credentials)

    return InMemoryDatabase()
