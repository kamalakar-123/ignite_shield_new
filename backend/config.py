from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent / ".env"

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/ignite_shield"
    JWT_SECRET_KEY: str = "ignite-shield-secret-key-change-in-production"
    OPEN_METEO_BASE_URL: str = "https://api.open-meteo.com/v1/forecast"

    # Gmail SMTP Configuration
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_EMAIL: str = "kamalakara@gmail.com"
    SMTP_PASSWORD: str = ""
    ALERT_EMAIL: str = "marathi@gmail.com"

    # Twilio SMS & WhatsApp Configuration
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_SMS_FROM: str = "+17372212163"
    TWILIO_SMS_TO: str = "+918431621612"
    TWILIO_WHATSAPP_FROM: str = "whatsapp:+17372212163"
    TWILIO_WHATSAPP_TO: str = "whatsapp:+918431621612"

    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
