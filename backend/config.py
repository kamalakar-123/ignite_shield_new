from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent / ".env"

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./ignite_shield.db"
    JWT_SECRET_KEY: str = "ignite-shield-secret-key-change-in-production"
    OPEN_METEO_BASE_URL: str = "https://api.open-meteo.com/v1/forecast"

    # Ingestion & Admin Security
    DEVICE_API_KEY: str = ""
    ADMIN_API_KEY: str = ""

    # AI Assistant Configuration
    AI_PROVIDER: str = "auto"  # auto | gemini | openai | offline
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    AI_MODEL: str = "gemini-1.5-flash"

    # Gmail SMTP Configuration
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_EMAIL: str = ""
    SMTP_PASSWORD: str = ""
    ALERT_EMAIL: str = ""

    # Twilio SMS & WhatsApp Configuration
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_SMS_FROM: str = ""
    TWILIO_SMS_TO: str = ""
    TWILIO_WHATSAPP_FROM: str = ""
    TWILIO_WHATSAPP_TO: str = ""
    TWILIO_WHATSAPP_CONTENT_SID: str = ""

    # Alert rules configuration
    ALERT_COOLDOWN_MINUTES: int = 30
    FIRE_RISK_TRIGGER_LEVEL: str = "HIGH"

    # Default station coordinates
    STATION_DEFAULT_LAT: float = 12.2958
    STATION_DEFAULT_LON: float = 76.6394

    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
