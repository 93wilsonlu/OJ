import pytest


@pytest.mark.asyncio
async def test_healthz(client):
    response = await client.get("/api/v1/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_ready_returns_503_when_dependency_fails(client, monkeypatch):
    async def fake_report():
        return {
            "status": "not_ready",
            "checks": {
                "db": {"ok": True, "detail": "ok"},
                "redis": {"ok": False, "detail": "connection refused"},
                "storage": {"ok": True, "detail": "ok"},
            },
        }

    monkeypatch.setattr("app.main.readiness_report", fake_report)

    response = await client.get("/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["redis"]["ok"] is False


@pytest.mark.asyncio
async def test_metrics_endpoint(client, monkeypatch):
    async def fake_metrics():
        return b"# HELP oj_queue_length Number of jobs\noj_queue_length 0\n"

    monkeypatch.setattr("app.main.prometheus_response_body", fake_metrics)

    response = await client.get("/metrics")

    assert response.status_code == 200
    assert "oj_queue_length" in response.text
