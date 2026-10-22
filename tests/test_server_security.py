"""Pruebas de seguridad para el servidor actual de Capital Command.

Ejecutar desde la raíz: pip install -r requirements-dev.txt && python -m pytest -q
No requiere credenciales ni conexiones externas.
"""

from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)


def test_public_pages_available():
    assert client.get("/").status_code == 200
    assert client.get("/styles.css").status_code == 200
    assert client.get("/app.js").status_code == 200
    assert client.get("/fraith-business-pro/").status_code == 200


def test_source_and_environment_files_are_not_public():
    for path in ("/.env", "/.env.example", "/server/main.py", "/server/agents.py", "/requirements.txt", "/README.md"):
        assert client.get(path).status_code == 404, path


def test_agent_endpoint_disabled_without_secret(monkeypatch):
    monkeypatch.delenv("FRAITH_ADMIN_API_TOKEN", raising=False)
    response = client.post("/api/agents/run")
    assert response.status_code == 503


def test_agent_endpoint_requires_valid_token(monkeypatch):
    monkeypatch.setenv("FRAITH_ADMIN_API_TOKEN", "dummy-test-key-not-production")
    assert client.post("/api/agents/run").status_code == 401
    assert client.post("/api/agents/run", headers={"X-Admin-Token": "incorrect"}).status_code == 401
