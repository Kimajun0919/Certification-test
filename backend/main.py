"""
QR Event Check-in System — FastAPI Application Entry Point

Run with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import create_database
from routers import checkin, qr, users


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.db = create_database()
    print(f"[startup] database backend: {os.getenv('DATABASE_BACKEND', 'memory')}")
    yield
    # Shutdown (clean up resources if needed)
    print("[shutdown] application stopped")


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="QR Event Check-in API",
    description=(
        "Production-ready backend for managing event registrations, "
        "payment confirmations, QR code generation, and on-site check-in."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow the React frontend (and localhost dev) to call the API
# ---------------------------------------------------------------------------

_origins = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(users.router)
app.include_router(qr.router)
app.include_router(checkin.router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"], summary="Health check")
def health():
    return {"status": "ok", "version": app.version}


@app.get("/", tags=["system"], summary="Root redirect info")
def root():
    return {"message": "QR Check-in API", "docs": "/docs"}
