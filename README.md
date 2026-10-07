# Capital Command

Capital Command es un único producto: una terminal de inversión asistida por agentes.

## Objetivo
Mostrar en una sola pantalla:
- mercado y tasas;
- oportunidades priorizadas;
- cartera y P&L del broker;
- agentes especialistas y su dictamen;
- riesgo y límites;
- borradores de órdenes;
- historial operativo.

## Principios
1. Una sola interfaz.
2. Un solo backend.
3. Secretos únicamente en variables de entorno.
4. Sin apalancamiento por defecto.
5. Ninguna métrica de prioridad se presenta como probabilidad de ganancia.
6. La ejecución real requiere un broker autenticado y aprobación explícita.

## Estado actual
- Frontend operacional: listo.
- Backend FastAPI: listo.
- Datos de mercado públicos: listos para consulta.
- Agentes OpenAI: listos si existe OPENAI_API_KEY.
- Broker real: adaptador pendiente de conectar.
- Envío real de órdenes: bloqueado hasta integrar el broker.

## Ejecutar
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server.main:app --reload
```

Abrir: http://127.0.0.1:8000

## Variables de entorno
Copiar `.env.example` a `.env` y completar únicamente en un entorno privado.

## Despliegue
El repositorio incluye Dockerfile y railway.toml para un despliegue persistente.

## Respaldo anterior
La versión previa del sitio quedó preservada en la rama:
`legacy-futurama-2026-10-07`

Capital Command reemplaza el enfoque anterior de múltiples proyectos inconexos.
