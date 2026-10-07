from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from openai import AsyncOpenAI


RULES = """
Capital Command analiza inversiones para un usuario principiante.
No prometas rentabilidad ni presentes un puntaje como probabilidad de ganancia.
Separá hechos observados de interpretación.
Priorizá preservación de capital, liquidez, costos y horizonte.
No ordenes comprar ni vender.
Respondé en español, de forma breve y técnica.
"""


async def _call(client: AsyncOpenAI, model: str, name: str, instruction: str, payload: str) -> str:
    response = await client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": RULES + "\nTu rol es: " + instruction},
            {"role": "user", "content": payload},
        ],
    )
    return response.output_text.strip()


async def run_agents(market: list[dict[str, Any]], opportunities: list[dict[str, Any]]) -> dict[str, Any]:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return {
            "status": "DISABLED",
            "message": "OPENAI_API_KEY no configurada en el backend.",
            "outputs": {},
            "central": None,
        }

    model = os.getenv("OPENAI_MODEL", "gpt-5.6")
    client = AsyncOpenAI(api_key=key)
    payload = json.dumps(
        {"market": market, "opportunities": opportunities},
        ensure_ascii=False,
        separators=(",", ":"),
    )

    roles = {
        "Seguridad": "Compará todas las ideas contra T-Bill 3M y destacá liquidez y riesgo.",
        "Mercado": "Evaluá SPY y el contexto de mercado amplio.",
        "Inmobiliario": "Evaluá VNQ, sensibilidad a tasas y volatilidad.",
        "Energía": "Evaluá XLE, ciclicidad y volatilidad.",
        "IA / Semiconductores": "Evaluá SOXX, concentración y volatilidad.",
        "Costos": "Indicá qué costos o fricciones deben verificarse para un residente argentino.",
        "Riesgo": "Buscá razones para frenar: drawdown, concentración, volatilidad y liquidez.",
        "Verificador": "Señalá datos faltantes, fechas viejas o conclusiones no respaldadas.",
    }

    async def one(name: str, instruction: str) -> tuple[str, str]:
        try:
            text = await _call(client, model, name, instruction, payload)
            return name, text
        except Exception as exc:
            return name, f"ERROR: {exc}"

    pairs = await asyncio.gather(*(one(n, i) for n, i in roles.items()))
    outputs = dict(pairs)

    central_input = json.dumps(
        {"market": market, "opportunities": opportunities, "specialists": outputs},
        ensure_ascii=False,
    )
    try:
        central = await _call(
            client,
            model,
            "Administrador Central",
            "Integrá a los especialistas. Indicá qué estudiar, qué observar, principal riesgo y próximo paso. No des una orden de compra.",
            central_input,
        )
        status = "OK"
    except Exception as exc:
        central = f"ERROR: {exc}"
        status = "PARTIAL"

    return {"status": status, "outputs": outputs, "central": central}
