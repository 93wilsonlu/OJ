from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    REDIS_URL: str = "redis://localhost:6379/0"

    GCS_BUCKET: str = "oj-storage"
    GCS_PROJECT: str = ""

    PUBSUB_JUDGE_SUBSCRIPTION: str = "projects/my-project/subscriptions/judge-submissions-sub"
    PUBSUB_RUN_SUBSCRIPTION: str = "projects/my-project/subscriptions/judge-runs-sub"

    WORKER_HEARTBEAT_INTERVAL_SECONDS: int = 15

    CALLBACK_URL: str = "http://api:8000"
    INTERNAL_TOKEN: str = "changeme-internal"


settings = Settings()
