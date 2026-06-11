from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import anyio
import pytest

from app.observability import (
    DependencyStatus,
    _check_with_timeout,
    _get_pubsub_queue_depth,
    _load_db_metrics,
    check_db,
    check_storage,
    prometheus_response_body,
    readiness_report,
    refresh_prometheus_metrics,
)


@pytest.mark.asyncio
async def test_check_db_success():
    mock_db = AsyncMock()
    with patch("app.observability.AsyncSessionLocal", return_value=mock_db):
        res = await check_db()
        assert res.ok is True
        assert res.detail == "ok"


@pytest.mark.asyncio
async def test_check_db_failure():
    mock_db = AsyncMock()
    mock_db.__aenter__.side_effect = Exception("DB error")
    with patch("app.observability.AsyncSessionLocal", return_value=mock_db):
        res = await check_db()
        assert res.ok is False
        assert "DB error" in res.detail


@pytest.mark.asyncio
async def test_check_storage_success():
    mock_client = MagicMock()
    mock_client.lookup_bucket.return_value = MagicMock()
    with patch("app.services.storage._get_client", return_value=mock_client):
        res = await check_storage()
        assert res.ok is True


@pytest.mark.asyncio
async def test_check_storage_not_found():
    mock_client = MagicMock()
    mock_client.lookup_bucket.return_value = None
    with patch("app.services.storage._get_client", return_value=mock_client):
        res = await check_storage()
        assert res.ok is False
        assert "not found" in res.detail


@pytest.mark.asyncio
async def test_readiness_report():
    with (
        patch("app.observability.check_db", return_value=DependencyStatus(True, "ok")),
        patch("app.observability.check_storage", return_value=DependencyStatus(True, "ok")),
        patch("app.observability.check_pubsub", return_value=DependencyStatus(True, "ok")),
    ):
        report = await readiness_report()
        assert report["status"] == "ready"
        assert set(report["checks"]) == {"db", "storage", "pubsub"}


@pytest.mark.asyncio
async def test_check_with_timeout_expired():
    async def slow_check():
        await anyio.sleep(2.0)
        return DependencyStatus(ok=True, detail="ok")

    res = await _check_with_timeout(slow_check)
    assert res.ok is False
    assert "timeout after" in res.detail


@pytest.mark.asyncio
async def test_get_pubsub_queue_depth_returns_count():
    def _make_ts(value: int) -> MagicMock:
        point = MagicMock()
        point.value.int64_value = value
        ts = MagicMock()
        ts.points = [point]
        return ts

    mock_client = MagicMock()
    mock_client.list_time_series.return_value = [_make_ts(4), _make_ts(3)]
    with patch("app.observability.monitoring_v3.MetricServiceClient", return_value=mock_client):
        depth = await _get_pubsub_queue_depth()
    assert depth == 7


@pytest.mark.asyncio
async def test_get_pubsub_queue_depth_empty_returns_zero():
    mock_client = MagicMock()
    mock_client.list_time_series.return_value = []
    with patch("app.observability.monitoring_v3.MetricServiceClient", return_value=mock_client):
        depth = await _get_pubsub_queue_depth()
    assert depth == 0


@pytest.mark.asyncio
async def test_load_db_metrics():
    class MockSession:
        def __init__(self):
            self.values = iter([2, 1, 1500, 4, datetime(2026, 6, 11, tzinfo=UTC)])

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def scalar(self, _statement):
            return next(self.values)

    with patch("app.observability.AsyncSessionLocal", return_value=MockSession()):
        metrics = await _load_db_metrics()

    assert metrics["success"] == 2.0
    assert metrics["failure"] == 1.0
    assert metrics["avg_seconds"] == 1.5
    assert metrics["stuck_marked"] == 4.0
    assert metrics["heartbeat"] > 0


@pytest.mark.asyncio
async def test_refresh_prometheus_metrics():
    with (
        patch("app.observability.readiness_report", return_value={"checks": {"db": {"ok": True}}}),
        patch("app.observability._get_pubsub_queue_depth", return_value=5),
        patch(
            "app.observability._load_db_metrics",
            return_value={
                "success": 2,
                "failure": 1,
                "avg_seconds": 1.5,
                "stuck_marked": 0,
                "heartbeat": 123.0,
            },
        ),
    ):
        await refresh_prometheus_metrics()


@pytest.mark.asyncio
async def test_prometheus_response_body():
    with patch("app.observability.refresh_prometheus_metrics") as mock_refresh:
        body = await prometheus_response_body()
        mock_refresh.assert_called_once()
        assert isinstance(body, bytes)
