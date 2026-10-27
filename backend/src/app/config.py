"""Application configuration via environment variables."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    snapshot_dir: str = "../data/snapshot"
    log_level: str = "INFO"
    default_cutoff: str = "15:30"
    allowed_cutoffs: list[str] = ["15:30", "09:50"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
