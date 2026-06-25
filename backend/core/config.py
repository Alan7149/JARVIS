from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    # App
    APP_NAME: str = "JARVIS"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Security
    SECRET_KEY: str = "change-this-in-production-use-secrets-manager"
    API_KEY: str = "change-me-local-key"  # shared secret for phone webhooks — override in .env

    # Database (defaults to SQLite — set to postgresql+asyncpg://... for production)
    DATABASE_URL: str = "sqlite+aiosqlite:///./jarvis.db"
    DATABASE_POOL_SIZE: int = 10

    # Redis (optional — leave empty to disable)
    REDIS_URL: str = ""

    # Claude API (optional — uses Groq if empty)
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    # Groq API (free alternative — get key at console.groq.com)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # CORS
    # Add your own LAN/Tailscale origins here (or via the ALLOWED_ORIGINS env var)
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000",
    ]

    # File indexing
    INDEX_PATHS: List[str] = []
    MAX_FILE_SIZE_MB: int = 10

    # Voice
    WHISPER_MODEL: str = "base"
    WAKE_WORD: str = "jarvis"
    TTS_ENGINE: str = "piper"  # piper | elevenlabs | azure

    # ElevenLabs (optional)
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = ""

    # Azure TTS (optional)
    AZURE_TTS_KEY: str = ""
    AZURE_TTS_REGION: str = ""

    # Alerts
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    NTFY_URL: str = "https://ntfy.sh"
    NTFY_TOPIC: str = "jarvis-alerts"

    # Google (Calendar + Gmail)
    GOOGLE_CREDENTIALS_FILE: str = ""   # path to credentials.json from Google Cloud Console

    # Obsidian
    OBSIDIAN_VAULT_PATH: str = ""

    # Push notifications (ntfy)
    NTFY_PUSH_TOPIC: str = "jarvis-push"  # unique topic for your phone — set your own in .env

    # Network addresses for phone access (set your own in .env)
    TAILSCALE_IP: str = ""   # e.g. 100.x.x.x — your machine's Tailscale IP
    LOCAL_IP: str = ""       # e.g. 192.168.x.x — your machine's LAN IP

    # Wake word
    WAKE_WORD_ENABLED: bool = True

    # Twitter / X Auto-Poster
    TWITTER_API_KEY: str = ""
    TWITTER_API_SECRET: str = ""
    TWITTER_ACCESS_TOKEN: str = ""
    TWITTER_ACCESS_SECRET: str = ""
    TWITTER_AUTOPOSTER_ENABLED: bool = False   # set True after adding keys

    # Monitoring
    HEALTH_CHECK_INTERVAL: int = 300  # seconds
    DISK_ALERT_THRESHOLD: int = 85   # percent

    class Config:
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"


def get_settings() -> Settings:
    return Settings()


settings = Settings()
