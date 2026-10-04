#!/usr/bin/env python3
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from agents import Agent, Runner

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "capital-command" / "market_snapshot.json"
OUTPUT = ROOT / "capital-command" / "agent_analysis.json"

BASE_RULES = """
Capital Command está en modo SIMULACIÓN.
No podés comprar, vender, transferir, copiar operaciones ni mover dinero.
No prometas rentabilidad ni uses 'sin riesgo'.
El usuario es principiante en Argentina y prioriza preservar capital.
Explicá en español claro.
Toda conclusión debe separar datos observados de interpretación.
Usá solamente el snapshot suministrado; si falta un dato, decí 'dato faltante'.
Terminá con una de estas etiquetas: ESTUDIAR, OBSERVAR, ESPERAR o DESCARTAR.
Máximo 90 palabras.
"""

SPECIALISTS = {
    "Seguridad / T-Bills": """
Evaluá el T-Bill de 3 meses como referencia conservadora: rendimiento observado,
liquidez, horizonte y qué riesgo todavía existe.
""",
    "Mercado Amplio": """
Evaluá SPY como exposición amplia al S&P 500 para un principiante con horizonte corto.
Considerá volatilidad y riesgo de caída.
""",
    "Inmobiliario": """
Evaluá VNQ/REITs: sensibilidad a tasas, volatilidad, liquidez y encaje con preservación de capital.
""",
    "Energía": """
Evaluá XLE/energía: ciclicidad, volatilidad y dependencia del petróleo.
""",
    "IA / Semiconductores": """
Evaluá SOXX como proxy de semiconductores/IA: crecimiento potencial versus volatilidad y concentración.
""",
    "Copy Trading": """
No hay datos de traders concretos en el snapshot. Explicá qué métricas mínimas se necesitarían
antes de copiar a alguien: drawdown, antigüedad, apalancamiento, pérdidas abiertas y consistencia.
No recomiendes copiar a nadie sin esos datos.
""",
    "Costos Argentina": """
Identificá qué costos o fricciones no pueden inferirse del snapshot para un residente argentino:
conversión ARS/USD, spread, comisiones, impuestos, custodia y acceso al instrumento.
No inventes cifras.
"""
}

async def run_agent(name: str, instructions: str, snapshot_text: str) -> str:
    agent = Agent(
        name=name,
        instructions=BASE_RULES + "\n" + instructions,
    )
    prompt = (
        "Analizá este snapshot de Capital Command. "
        "No uses información que no esté acá.\n\n" + snapshot_text
    )
    result = await Runner.run(agent, prompt, max_turns=2)
    return str(result.final_output).strip()

async def main():
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY no configurada en el entorno.")

    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    compact = json.dumps(
        {
            "capital_ars": snapshot.get("capital_ars"),
            "usd_reference": snapshot.get("usd_reference"),
            "last_updated": snapshot.get("last_updated"),
            "market": snapshot.get("market", []),
            "real_money_enabled": snapshot.get("real_money_enabled"),
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )

    tasks = [
        run_agent(name, instructions, compact)
        for name, instructions in SPECIALISTS.items()
    ]
    specialist_results = await asyncio.gather(*tasks)
    outputs = dict(zip(SPECIALISTS.keys(), specialist_results))

    verification_agent = Agent(
        name="Verificador",
        instructions=BASE_RULES + """
Revisá las conclusiones de los especialistas contra el snapshot.
Detectá contradicciones, cifras no respaldadas o lenguaje demasiado seguro.
No agregues datos nuevos. Máximo 120 palabras.
"""
    )
    verification_prompt = json.dumps(
        {"snapshot": json.loads(compact), "specialists": outputs},
        ensure_ascii=False,
    )
    verification = await Runner.run(
        verification_agent, verification_prompt, max_turns=2
    )
    outputs["Verificador"] = str(verification.final_output).strip()

    risk_agent = Agent(
        name="Riesgo",
        instructions=BASE_RULES + """
Actuá como control de riesgo final. Priorizá preservación de capital.
Compará toda idea contra T-Bill 3M. Marcá concentraciones, volatilidad, liquidez,
riesgo cambiario y cualquier razón para frenar. Máximo 130 palabras.
"""
    )
    risk_prompt = json.dumps(
        {
            "snapshot": json.loads(compact),
            "specialists": outputs,
        },
        ensure_ascii=False,
    )
    risk_result = await Runner.run(risk_agent, risk_prompt, max_turns=2)
    risk_text = str(risk_result.final_output).strip()
    outputs["Riesgo"] = risk_text

    central_agent = Agent(
        name="Administrador Central",
        instructions=BASE_RULES + """
Integrá el snapshot, especialistas, verificación y riesgo.
No des una orden de compra. Entregá:
1) qué merece ESTUDIAR,
2) qué queda en OBSERVAR/ESPERAR,
3) el principal riesgo,
4) el próximo paso pequeño.
Máximo 160 palabras.
"""
    )
    central_prompt = json.dumps(
        {
            "snapshot": json.loads(compact),
            "specialists": outputs,
            "risk": risk_text,
        },
        ensure_ascii=False,
    )
    central_result = await Runner.run(central_agent, central_prompt, max_turns=2)
    central_text = str(central_result.final_output).strip()
    outputs["Administrador Central"] = central_text

    payload = {
        "status": "OK",
        "last_run": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "mode": "SIMULACION",
        "snapshot_last_updated": snapshot.get("last_updated"),
        "outputs": outputs,
        "central": central_text,
        "risk": risk_text,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Capital Command agents: análisis generado.")

if __name__ == "__main__":
    asyncio.run(main())
