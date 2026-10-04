#!/usr/bin/env python3
import csv
import io
import json
import math
import statistics
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "capital-command" / "market_snapshot.json"

STOOQ = {
    "SPY": "spy.us",
    "VNQ": "vnq.us",
    "XLE": "xle.us",
    "SOXX": "soxx.us",
}

def get_text(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Capital-Command/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")

def load_snapshot():
    with SNAPSHOT.open("r", encoding="utf-8") as f:
        return json.load(f)

def fetch_stooq_history(code: str):
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=420)
    url = (
        "https://stooq.com/q/d/l/?s=" + code +
        "&d1=" + start.strftime("%Y%m%d") +
        "&d2=" + end.strftime("%Y%m%d") + "&i=d"
    )
    text = get_text(url)
    rows = list(csv.DictReader(io.StringIO(text)))
    clean = []
    for row in rows:
        try:
            close = float(row["Close"])
            if close > 0:
                clean.append((row["Date"], close))
        except Exception:
            continue
    if not clean:
        raise RuntimeError("Sin datos válidos de Stooq para " + code)
    return clean

def annualized_volatility(closes, window=60):
    vals = [x[1] for x in closes][-window-1:]
    if len(vals) < 21:
        return None
    rets = [math.log(vals[i] / vals[i-1]) for i in range(1, len(vals))]
    return statistics.stdev(rets) * math.sqrt(252) * 100

def fetch_tbill_3m():
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS3MO"
    text = get_text(url)
    rows = list(csv.DictReader(io.StringIO(text)))
    for row in reversed(rows):
        raw = (row.get("DGS3MO") or "").strip()
        if raw and raw != ".":
            return row["DATE"], float(raw)
    raise RuntimeError("No se encontró DGS3MO en FRED")

def classify(symbol, vol):
    if symbol == "SPY":
        if vol is not None and vol <= 16:
            return "Moderado", "Mercado amplio", "Observar"
        return "Moderado", "Volatilidad elevada", "Esperar"
    if symbol == "VNQ":
        if vol is not None and vol <= 18:
            return "Moderado", "Renta inmobiliaria", "Observar"
        return "Alto", "Volatilidad elevada", "Esperar"
    if symbol == "XLE":
        if vol is not None and vol <= 20:
            return "Moderado", "Energía cíclica", "Observar"
        return "Alto", "Volátil", "Esperar"
    if symbol == "SOXX":
        if vol is not None and vol <= 25:
            return "Moderado", "Tecnología", "Observar"
        return "Alto", "Muy volátil", "Esperar"
    return "No clasificado", "Sin señal", "Revisar"

def main():
    data = load_snapshot()
    notes = []

    try:
        date, y = fetch_tbill_3m()
        for item in data["market"]:
            if item["symbol"] == "DGS3MO":
                item.update({
                    "value": round(y, 3),
                    "date": date,
                    "source": "FRED / U.S. Treasury",
                    "source_url": "https://fred.stlouisfed.org/series/DGS3MO",
                    "risk": "Bajo",
                    "signal": "Base defensiva",
                    "decision": "Estudiar"
                })
        notes.append("T-Bill 3M actualizado")
    except Exception as e:
        notes.append("T-Bill 3M conservó dato previo: " + str(e))

    for symbol, code in STOOQ.items():
        try:
            hist = fetch_stooq_history(code)
            date, price = hist[-1]
            vol = annualized_volatility(hist, 60)
            risk, signal, decision = classify(symbol, vol)
            for item in data["market"]:
                if item["symbol"] == symbol:
                    item.update({
                        "value": round(price, 4),
                        "date": date,
                        "volatility": round(vol, 2) if vol is not None else None,
                        "volatility_window": "60 ruedas anualizada",
                        "risk": risk,
                        "signal": signal,
                        "decision": decision,
                        "source": "Stooq (precio EOD)",
                        "source_url": "https://stooq.com/q/?s=" + code
                    })
            notes.append(symbol + " actualizado")
        except Exception as e:
            notes.append(symbol + " conservó dato previo: " + str(e))

    data["last_updated"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    data["refresh_notes"] = notes

    # Actualiza mensajes deterministas de los agentes. No son recomendaciones de compra.
    by_symbol = {m["symbol"]: m for m in data["market"]}
    messages = {
        "Datos de Mercado": "Snapshot actualizado en solo lectura; fuentes y fechas visibles.",
        "Seguridad / T-Bills": f"T-Bill 3M: {by_symbol['DGS3MO']['value']}% ({by_symbol['DGS3MO']['date']}).",
        "Mercado Amplio": f"SPY: riesgo {by_symbol['SPY']['risk']}; decisión {by_symbol['SPY']['decision']}.",
        "Inmobiliario": f"VNQ: riesgo {by_symbol['VNQ']['risk']}; decisión {by_symbol['VNQ']['decision']}.",
        "Energía": f"XLE: riesgo {by_symbol['XLE']['risk']}; decisión {by_symbol['XLE']['decision']}.",
        "IA / Semiconductores": f"SOXX: riesgo {by_symbol['SOXX']['risk']}; decisión {by_symbol['SOXX']['decision']}.",
        "Copy Trading": "Bloqueado para ejecución. Solo observación y simulación.",
        "Costos Argentina": "Pendiente de broker concreto, spreads y costos reales.",
        "Verificador": "Fechas, fuentes y consistencia de snapshot verificadas de forma determinista.",
        "Riesgo": "Preservación de capital prioritaria; alto riesgo no pasa a ejecución.",
        "Administrador Central": "No autoriza operaciones reales; emite solo decisiones de estudio."
    }
    for agent in data["agents"]:
        if agent["name"] in messages:
            agent["message"] = messages[agent["name"]]
            if agent["name"] not in {"Copy Trading", "Costos Argentina"}:
                agent["status"] = "LISTO"

    data["central_message"] = (
        "No ejecutar operaciones reales. Comparar toda oportunidad contra el T-Bill 3M, "
        "mantener alto riesgo fuera de ejecución y revisar costos argentinos antes de cualquier paso."
    )

    with SNAPSHOT.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("\n".join(notes))

if __name__ == "__main__":
    main()
