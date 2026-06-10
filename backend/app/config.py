from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://oj:oj@localhost:5432/oj"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "changeme"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    GCS_BUCKET: str = "oj-storage"
    GCS_PROJECT: str = ""

    PUBSUB_JUDGE_TOPIC: str = "projects/my-project/topics/judge-submissions"
    PUBSUB_RUN_TOPIC: str = "projects/my-project/topics/judge-runs"
    PUBSUB_JUDGE_SUBSCRIPTION: str = "projects/my-project/subscriptions/judge-submissions-sub"
    PUBSUB_RUN_SUBSCRIPTION: str = "projects/my-project/subscriptions/judge-runs-sub"

    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""
    ADMIN_NAME: str = "System Admin"

    STUCK_SUBMISSION_SECONDS: int = 300
    WORKER_HEARTBEAT_INTERVAL_SECONDS: int = 15

    CALLBACK_URL: str = "http://api:8000"
    INTERNAL_TOKEN: str = "changeme-internal"


settings = Settings()
