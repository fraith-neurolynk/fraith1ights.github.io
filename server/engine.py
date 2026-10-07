from __future__ import annotations

import asyncio
import csv
import io
import math
import statistics
from datetime import date, timedelta
from typing import Any

import httpx


ASSETS = {
    "SPY": {"name": "S&P 500", "code": "spy.us", "category": "Mercado amplio"},
    "VNQ": {"name": "REITs EE.UU.", "code": "vnq.us", "category": "Inmobiliario"},
    "XLE": {"name": "Energía", "code": "xle.us", "category": "Energía"},
    "SOXX": {"name": "Semiconductores / IA", "code": "soxx.us", "category": "Tecnología"},
}


async def _get_text(client: httpx.AsyncClient, url: str) -> str:
    response = await client.get(url, headers={"User-Agent": "Capital-Command/2.0"})
    response.raise_for_status()
    return response.text


async def _fetch_asset(client: httpx.AsyncClient, symbol: str, meta: dict[str, str]) -> dict[str, Any]:
    end = date.today()
    start = end - timedelta(days=150)
    url = (
        "https://stooq.com/q/d/l/?s="
        + meta["code"]
        + "&d1="
        + start.strftime("%Y%m%d")
        + "&d2="
        + end.strftime("%Y%m%d")
        + "&i=d"
    )
    text = await _get_text(client, url)
    rows = list(csv.DictReader(io.StringIO(text)))
    clean: list[tuple[str, float]] = []
    for row in rows:
        try:
            close = float(row["Close"])
            if close > 0:
                clean.append((row["Date"], close))
        except (KeyError, TypeError, ValueError):
            continue

    if len(clean) < 2:
        raise RuntimeError(f"Sin datos suficientes para {symbol}")

    latest_date, latest_price = clean[-1]
    prior_price = clean[-2][1]
    change_pct = ((latest_price / prior_price) - 1) * 100

    recent = [p for _, p in clean[-61:]]
    volatility = None
    if len(recent) >= 21:
        returns = [math.log(recent[i] / recent[i - 1]) for i in range(1, len(recent))]
        volatility = statistics.stdev(returns) * math.sqrt(252) * 100

    return {
        "symbol": symbol,
        "name": meta["name"],
        "category": meta["category"],
        "kind": "price",
        "value": round(latest_price, 4),
        "unit": "USD",
        "date": latest_date,
        "change_pct": round(change_pct, 2),
        "volatility": round(volatility, 2) if volatility is not None else None,
        "source": "Stooq EOD",
        "source_url": f"https://stooq.com/q/?s={meta['code']}",
    }


async def _fetch_tbill(client: httpx.AsyncClient) -> dict[str, Any]:
    text = await _get_text(client, "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS3MO")
    rows = list(csv.DictReader(io.StringIO(text)))
    for row in reversed(rows):
        raw = (row.get("DGS3MO") or "").strip()
        if raw and raw != ".":
            return {
                "symbol": "DGS3MO",
                "name": "T-Bill EE.UU. 3 meses",
                "category": "Referencia defensiva",
                "kind": "yield",
                "value": round(float(raw), 3),
                "unit": "%",
                "date": row["DATE"],
                "change_pct": None,
                "volatility": None,
                "source": "FRED",
                "source_url": "https://fred.stlouisfed.org/series/DGS3MO",
            }
    raise RuntimeError("FRED no devolvió DGS3MO")


async def fetch_market() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=18, follow_redirects=True) as client:
        jobs = [_fetch_tbill(client)]
        jobs.extend(_fetch_asset(client, symbol, meta) for symbol, meta in ASSETS.items())
        results = await asyncio.gather(*jobs, return_exceptions=True)

    items: list[dict[str, Any]] = []
    errors: list[str] = []
    for result in results:
        if isinstance(result, Exception):
            errors.append(str(result))
        else:
            items.append(result)

    return {"items": items, "errors": errors}


def _risk_label(item: dict[str, Any]) -> str:
    if item["symbol"] == "DGS3MO":
        return "Bajo"
    vol = item.get("volatility")
    if vol is None:
        return "No calculado"
    if vol < 17:
        return "Moderado"
    if vol < 28:
        return "Moderado/Alto"
    return "Alto"


def build_opportunities(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    base = {"DGS3MO": 86, "SPY": 74, "VNQ": 66, "XLE": 58, "SOXX": 54}
    output = []

    for item in items:
        score = base.get(item["symbol"], 50)
        vol = item.get("volatility")
        if vol is not None:
            score -= max(0, vol - 15) * 0.7

        change = item.get("change_pct")
        if change is not None and abs(change) > 3:
            score -= min(10, abs(change))

        score = max(0, min(100, round(score)))
        risk = _risk_label(item)

        if item["symbol"] == "DGS3MO":
            decision = "ESTUDIAR"
            thesis = "Referencia defensiva para comparar toda idea de riesgo."
        elif score >= 68:
            decision = "ESTUDIAR"
            thesis = "Pasa el filtro inicial; requiere costos, horizonte y validación."
        elif score >= 50:
            decision = "OBSERVAR"
            thesis = "Interesante, pero todavía no supera todos los filtros."
        else:
            decision = "ESPERAR"
            thesis = "Riesgo o volatilidad elevados para la prioridad actual."

        output.append(
            {
                "symbol": item["symbol"],
                "name": item["name"],
                "priority_score": score,
                "risk": risk,
                "decision": decision,
                "thesis": thesis,
                "price_or_yield": item["value"],
                "unit": item["unit"],
                "date": item["date"],
            }
        )

    return sorted(output, key=lambda x: x["priority_score"], reverse=True)


def draft_order(
    *,
    symbol: str,
    side: str,
    quantity: float,
    order_type: str,
    limit_price: float | None,
    reference_equity_usd: float | None,
    max_single_idea_pct: float,
) -> dict[str, Any]:
    symbol = symbol.strip().upper()
    side = side.upper()
    order_type = order_type.upper()

    errors: list[str] = []
    warnings: list[str] = []

    if not symbol:
        errors.append("Falta el activo.")
    if side not in {"BUY", "SELL"}:
        errors.append("Lado inválido.")
    if quantity <= 0:
        errors.append("La cantidad debe ser mayor que cero.")
    if order_type not in {"MARKET", "LIMIT"}:
        errors.append("Tipo de orden inválido.")
    if order_type == "LIMIT" and (limit_price is None or limit_price <= 0):
        errors.append("Una orden LIMIT necesita precio límite.")

    notional = quantity * limit_price if limit_price and limit_price > 0 else None
    if notional and reference_equity_usd and reference_equity_usd > 0:
        max_notional = reference_equity_usd * (max_single_idea_pct / 100)
        if notional > max_notional:
            warnings.append(
                f"El nominal supera el límite inicial de {max_single_idea_pct:.0f}% por idea."
            )

    return {
        "valid": not errors,
        "symbol": symbol,
        "side": side,
        "quantity": quantity,
        "order_type": order_type,
        "limit_price": limit_price,
        "estimated_notional_usd": round(notional, 2) if notional is not None else None,
        "errors": errors,
        "warnings": warnings,
        "status": "DRAFT_ONLY",
    }
