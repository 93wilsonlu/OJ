import pytest
import pytest_asyncio
from unittest.mock import MagicMock, patch
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def mock_redis_connection():
    # Mock redis.from_url to prevent actual connections
    with patch("lib.custom_run.redis.from_url") as mock_from_url_cr, \
         patch("lib.observability.redis.from_url") as mock_from_url_obs:
        mock_client = MagicMock()
        mock_from_url_cr.return_value = mock_client
        mock_from_url_obs.return_value = mock_client
        import lib.custom_run
        import lib.observability
        lib.custom_run._redis = None
        lib.observability._redis = None
        yield mock_client
