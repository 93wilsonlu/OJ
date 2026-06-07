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
async def test_check_redis_success():
    mock_client = MagicMock()
    with patch("app.observability.get_redis_client", return_value=mock_client):
        res = await check_redis()
        assert res.ok is True

@pytest.mark.asyncio
async def test_check_redis_failure():
    mock_client = MagicMock()
    mock_client.ping.side_effect = Exception("Redis error")
    with patch("app.observability.get_redis_client", return_value=mock_client):
        res = await check_redis()
        assert res.ok is False
        assert "Redis error" in res.detail

@pytest.mark.asyncio
async def test_check_storage_success():
    mock_minio = MagicMock()
    mock_minio.bucket_exists.return_value = True
    with patch("app.services.storage.get_minio", return_value=mock_minio):
        res = await check_storage()
        assert res.ok is True

@pytest.mark.asyncio
async def test_check_storage_not_found():
    mock_minio = MagicMock()
    mock_minio.bucket_exists.return_value = False
    with patch("app.services.storage.get_minio", return_value=mock_minio):
        res = await check_storage()
        assert res.ok is False
        assert "not found" in res.detail

@pytest.mark.asyncio
async def test_check_storage_failure():
    mock_minio = MagicMock()
    mock_minio.bucket_exists.side_effect = Exception("Minio error")
    with patch("app.services.storage.get_minio", return_value=mock_minio):
        res = await check_storage()
        assert res.ok is False
        assert "Minio error" in res.detail

@pytest.mark.asyncio
async def test_readiness_report():
    with patch("app.observability.check_db", return_value=DependencyStatus(ok=True, detail="ok")), \
         patch("app.observability.check_redis", return_value=DependencyStatus(ok=True, detail="ok")), \
         patch("app.observability.check_storage", return_value=DependencyStatus(ok=True, detail="ok")):
        report = await readiness_report()
        assert report["status"] == "ready"

def test_record_worker_heartbeat():
    mock_client = MagicMock()
    with patch("app.observability.get_redis_client", return_value=mock_client):
        record_worker_heartbeat()
        mock_client.set.assert_called_once()

def test_record_judge_result():
    mock_client = MagicMock()
    mock_pipe = MagicMock()
    mock_client.pipeline.return_value = mock_pipe
    with patch("app.observability.get_redis_client", return_value=mock_client):
        record_judge_result(True, 1.5)
        mock_pipe.incr.assert_called()
        mock_pipe.incrbyfloat.assert_called_once()
        mock_pipe.execute.assert_called_once()

def test_record_stuck_submissions():
    mock_client = MagicMock()
    with patch("app.observability.get_redis_client", return_value=mock_client):
        record_stuck_submissions(5)
        mock_client.incrby.assert_called_once()
        
        mock_client.reset_mock()
        record_stuck_submissions(0)
        mock_client.incrby.assert_not_called()

@pytest.mark.asyncio
async def test_refresh_prometheus_metrics():
    mock_client = MagicMock()
    mock_client.get.side_effect = lambda key: b"10.0"
    mock_queue = MagicMock()
    mock_queue.count = 3
    
    with patch("app.observability.readiness_report", return_value={"checks": {"db": {"ok": True}}}), \
         patch("app.observability.get_queue", return_value=mock_queue), \
         patch("app.observability.get_redis_client", return_value=mock_client):
        await refresh_prometheus_metrics()

@pytest.mark.asyncio
async def test_prometheus_response_body():
    with patch("app.observability.refresh_prometheus_metrics") as mock_refresh:
        body = await prometheus_response_body()
        mock_refresh.assert_called_once()
        assert isinstance(body, bytes)

def test_get_redis_client():
    with patch("app.observability.redis.from_url") as mock_from_url:
        get_redis_client()
        mock_from_url.assert_called_once_with(settings.REDIS_URL)

@pytest.mark.asyncio
async def test_check_with_timeout_expired():
    async def slow_check():
        await anyio.sleep(2.0)
        return DependencyStatus(ok=True, detail="ok")
    res = await _check_with_timeout(slow_check)
    assert res.ok is False
    assert "timeout after" in res.detail

def test_record_worker_heartbeat_exception():
    with patch("app.observability.get_redis_client", side_effect=Exception("Redis dead")):
        record_worker_heartbeat()

def test_record_judge_result_exception():
    with patch("app.observability.get_redis_client", side_effect=Exception("Redis dead")):
        record_judge_result(True, 1.5)

def test_record_stuck_submissions_exception():
    with patch("app.observability.get_redis_client", side_effect=Exception("Redis dead")):
        record_stuck_submissions(5)

def test_redis_float_none():
    mock_client = MagicMock()
    mock_client.get.return_value = None
    res = _redis_float(mock_client, "some_key", default=4.5)
    assert res == 4.5

@pytest.mark.asyncio
async def test_refresh_prometheus_metrics_queue_exception():
    with patch("app.observability.readiness_report", return_value={"checks": {}}), \
         patch("app.observability.get_queue", side_effect=Exception("Queue broken")), \
         patch("app.observability.get_redis_client") as mock_redis:
        mock_client = MagicMock()
        mock_client.get.return_value = b"10.0"
        mock_redis.return_value = mock_client
        await refresh_prometheus_metrics()

@pytest.mark.asyncio
async def test_refresh_prometheus_metrics_redis_exception():
    with patch("app.observability.readiness_report", return_value={"checks": {}}), \
         patch("app.observability.get_queue") as mock_queue, \
         patch("app.observability.get_redis_client", side_effect=Exception("Redis broken")):
        mock_queue.return_value.count = 5
        await refresh_prometheus_metrics()

