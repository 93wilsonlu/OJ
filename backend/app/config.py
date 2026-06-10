from pydantic_settings import SettingsConfigDict

from lib.config import Settings as _BaseSettings


class Settings(_BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://oj:oj@localhost:5432/oj"
    SECRET_KEY: str = "changeme"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    PUBSUB_JUDGE_TOPIC: str = "projects/my-project/topics/judge-submissions"
    PUBSUB_RUN_TOPIC: str = "projects/my-project/topics/judge-runs"

    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""
    ADMIN_NAME: str = "System Admin"

    STUCK_SUBMISSION_SECONDS: int = 300


settings = Settings()
