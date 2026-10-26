from __future__ import annotations

import os
import time
from hmac import compare_digest
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field

from server.agents import run_agents
from server.engine import build_opportunities, draft_order, fetch_market


ROOT = Path(__file__).resolve().parents[1]
app = FastAPI(title="Capital Command", version="2.0.0")

_cache: dict = {"at": 0.0, "data": None}


class OrderDraftRequest(BaseModel):
    symbol: str
    side: Literal["BUY", "SELL"]
    quantity: float = Field(gt=0)
    order_type: Literal["MARKET", "LIMIT"]
    limit_price: float | None = Field(default=None, gt=0)
    reference_equity_usd: float | None = Field(default=None, gt=0)


async def dashboard_data(force: bool = False) -> dict:
    ttl = int(os.getenv("MARKET_CACHE_SECONDS", "90"))
    now = time.time()
    if not force and _cache["data"] and now - _cache["at"] < ttl:
        return _cache["data"]

    market_result = await fetch_market()
    opportunities = build_opportunities(market_result["items"])

    trading_mode = os.getenv("TRADING_MODE", "observe").lower()
    broker_provider = os.getenv("BROKER_PROVIDER", "none").lower()

    broker = {
        "provider": broker_provider,
        "status": "DISCONNECTED" if broker_provider == "none" else "ADAPTER_PENDING",
        "account_masked": os.getenv("BROKER_ACCOUNT_MASK") or None,
        "equity_usd": None,
        "cash_usd": None,
        "day_pnl_usd": None,
        "positions": [],
        "orders": [],
    }

    data = {
        "product": "Capital Command",
        "version": "2.0.0",
        "trading_mode": trading_mode,
        "execution_enabled": False,
        "market": market_result["items"],
        "market_errors": market_result["errors"],
        "opportunities": opportunities,
        "broker": broker,
        "risk_policy": {
            "max_single_idea_pct": float(os.getenv("MAX_SINGLE_IDEA_PCT", "20")),
            "leverage": False,
            "auto_copy_trading": False,
            "human_approval_required": True,
        },
    }
    _cache.update({"at": now, "data": data})
    return data


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "service": "capital-command", "version": "2.0.0"}


@app.get("/api/dashboard")
async def dashboard() -> dict:
    return await dashboard_data()


@app.post("/api/dashboard/refresh")
async def refresh_dashboard() -> dict:
    return await dashboard_data(force=True)


@app.post("/api/agents/run")
async def run_agent_cycle(x_admin_token: str | None = Header(default=None)) -> dict:
    # Control provisional de acceso para pruebas técnicas. No enviar este secreto a JavaScript.
    # Antes de abrir a usuarios, sustituirlo por identidad y autorización administradas en servidor.
    secret = os.getenv("FRAITH_ADMIN_API_TOKEN")
    if not secret:
        raise HTTPException(status_code=503, detail="Agentes deshabilitados hasta configurar acceso seguro.")
    if not x_admin_token or not compare_digest(x_admin_token, secret):
        raise HTTPException(status_code=401, detail="No autorizado.")
    data = await dashboard_data()
    return await run_agents(data["market"], data["opportunities"])


@app.post("/api/orders/draft")
async def create_order_draft(request: OrderDraftRequest) -> dict:
    data = await dashboard_data()
    return draft_order(
        symbol=request.symbol,
        side=request.side,
        quantity=request.quantity,
        order_type=request.order_type,
        limit_price=request.limit_price,
        reference_equity_usd=request.reference_equity_usd,
        max_single_idea_pct=data["risk_policy"]["max_single_idea_pct"],
    )


@app.post("/api/orders/submit")
async def submit_order() -> dict:
    raise HTTPException(
        status_code=501,
        detail="Ejecución real todavía no conectada. Falta un adaptador de broker autenticado.",
    )


# Servir únicamente los archivos públicos autorizados; nunca la raíz del repositorio.
@app.get("/", include_in_schema=False)
async def home() -> FileResponse:
    return FileResponse(ROOT / "index.html")


@app.get("/index.html", include_in_schema=False)
async def homepage_file() -> FileResponse:
    return FileResponse(ROOT / "index.html")


@app.get("/styles.css", include_in_schema=False)
async def stylesheet() -> FileResponse:
    return FileResponse(ROOT / "styles.css")


@app.get("/app.js", include_in_schema=False)
async def client_script() -> FileResponse:
    return FileResponse(ROOT / "app.js")


@app.get("/fraith-business-pro", include_in_schema=False)
async def catalog_redirect() -> RedirectResponse:
    return RedirectResponse(url="/fraith-business-pro/", status_code=308)


@app.get("/fraith-business-pro/", include_in_schema=False)
async def catalog() -> FileResponse:
    return FileResponse(ROOT / "fraith-business-pro" / "index.html")
