import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from dataclasses import dataclass
from app.observability import (
    check_db, check_redis, check_storage, readiness_report,
    record_worker_heartbeat, record_judge_result, record_stuck_submissions,
    refresh_prometheus_metrics, prometheus_response_body, DependencyStatus,
    get_redis_client, _check_with_timeout, _redis_float
)
from app.config import settings
from lib.config import settings as lib_settings
import anyio

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
async def test_check_redis_success(mock_redis_connection):
    res = await check_redis()
    assert res.ok is True

@pytest.mark.asyncio
async def test_check_redis_failure(mock_redis_connection):
    mock_redis_connection.ping.side_effect = Exception("Redis error")
    res = await check_redis()
    assert res.ok is False
    assert "Redis error" in res.detail

@pytest.mark.asyncio
async def test_check_storage_success():
    mock_client = MagicMock()
    mock_bucket = MagicMock()
    mock_client.lookup_bucket.return_value = mock_bucket
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
async def test_check_storage_failure():
    mock_client = MagicMock()
    mock_client.lookup_bucket.side_effect = Exception("GCS error")
    with patch("app.services.storage._get_client", return_value=mock_client):
        res = await check_storage()
        assert res.ok is False
        assert "GCS error" in res.detail

@pytest.mark.asyncio
async def test_readiness_report():
    with patch("app.observability.check_db", return_value=DependencyStatus(ok=True, detail="ok")), \
         patch("app.observability.check_redis", return_value=DependencyStatus(ok=True, detail="ok")), \
         patch("app.observability.check_storage", return_value=DependencyStatus(ok=True, detail="ok")), \
         patch("app.observability.check_pubsub", return_value=DependencyStatus(ok=True, detail="ok")):
        report = await readiness_report()
        assert report["status"] == "ready"
        assert "pubsub" in report["checks"]

def test_record_worker_heartbeat(mock_redis_connection):
    record_worker_heartbeat()
    mock_redis_connection.set.assert_called_once()

def test_record_judge_result(mock_redis_connection):
    mock_pipe = MagicMock()
    mock_redis_connection.pipeline.return_value = mock_pipe
    record_judge_result(True, 1.5)
    mock_pipe.incr.assert_called()
    mock_pipe.incrbyfloat.assert_called_once()
    mock_pipe.execute.assert_called_once()

def test_record_stuck_submissions(mock_redis_connection):
    record_stuck_submissions(5)
    mock_redis_connection.incrby.assert_called_once()

    mock_redis_connection.reset_mock()
    record_stuck_submissions(0)
    mock_redis_connection.incrby.assert_not_called()

@pytest.mark.asyncio
async def test_refresh_prometheus_metrics(mock_redis_connection):
    mock_redis_connection.get.side_effect = lambda key: b"10.0"
    with patch("app.observability.readiness_report", return_value={"checks": {"db": {"ok": True}}}), \
         patch("app.observability._get_pubsub_queue_depth", return_value=5):
        await refresh_prometheus_metrics()

@pytest.mark.asyncio
async def test_prometheus_response_body():
    with patch("app.observability.refresh_prometheus_metrics") as mock_refresh:
        body = await prometheus_response_body()
        mock_refresh.assert_called_once()
        assert isinstance(body, bytes)

def test_get_redis_client(mock_redis_connection):
    import lib.observability
    lib.observability._redis = None
    # Reset to test the redis.from_url call
    with patch("lib.observability.redis.from_url") as mock_from_url:
        mock_from_url.return_value = mock_redis_connection
        client = get_redis_client()
        mock_from_url.assert_called_once_with(lib_settings.REDIS_URL, decode_responses=True)

@pytest.mark.asyncio
async def test_check_with_timeout_expired():
    async def slow_check():
        await anyio.sleep(2.0)
        return DependencyStatus(ok=True, detail="ok")
    res = await _check_with_timeout(slow_check)
    assert res.ok is False
    assert "timeout after" in res.detail

def test_record_worker_heartbeat_exception(mock_redis_connection):
    import lib.observability
    lib.observability._redis = None
    with patch("lib.observability.get_redis_client", side_effect=Exception("Redis dead")):
        record_worker_heartbeat()

def test_record_judge_result_exception(mock_redis_connection):
    import lib.observability
    lib.observability._redis = None
    with patch("lib.observability.get_redis_client", side_effect=Exception("Redis dead")):
        record_judge_result(True, 1.5)

def test_record_stuck_submissions_exception(mock_redis_connection):
    import lib.observability
    lib.observability._redis = None
    with patch("lib.observability.get_redis_client", side_effect=Exception("Redis dead")):
        record_stuck_submissions(5)

def test_redis_float_none():
    mock_client = MagicMock()
    mock_client.get.return_value = None
    res = _redis_float(mock_client, "some_key", default=4.5)
    assert res == 4.5

@pytest.mark.asyncio
async def test_refresh_prometheus_metrics_redis_exception():
    import lib.observability
    lib.observability._redis = None
    with patch("app.observability.readiness_report", return_value={"checks": {}}), \
         patch("app.observability._get_pubsub_queue_depth", return_value=0), \
         patch("lib.observability.get_redis_client", side_effect=Exception("Redis broken")):
        await refresh_prometheus_metrics()


@pytest.mark.asyncio
async def test_get_pubsub_queue_depth_returns_count():
    from app.observability import _get_pubsub_queue_depth

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
    from app.observability import _get_pubsub_queue_depth
    mock_client = MagicMock()
    mock_client.list_time_series.return_value = []
    with patch("app.observability.monitoring_v3.MetricServiceClient", return_value=mock_client):
        depth = await _get_pubsub_queue_depth()
    assert depth == 0

