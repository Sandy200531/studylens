from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    app_name: str = 'StudyLens'
    app_env: str = 'development'
    cors_origins: list[str] = []
    ollama_base_url: str = 'http://localhost:11434'
    ollama_model: str = 'beam:cloud'
    database_url: str = 'postgresql+asyncpg://studylens:studylens@localhost:5433/studylens'
    secret_key: str = 'dev-only-insecure-key-please-override-0123456789abcdef'
    access_token_expire_minutes: int = 60


settings = Settings()
