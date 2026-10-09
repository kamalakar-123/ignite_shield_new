import logging
from pathlib import Path
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent / ".env"
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from sqlalchemy import text

from database import engine, Base
from api import routes_prediction, routes_readings, routes_dashboard, routes_auth
from services.prediction_service import load_models


# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("ignite_shield")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables
    Base.metadata.create_all(bind=engine)

    # Ensure optional columns exist if migrating existing DB
    try:
        with engine.connect() as conn:
            for col_name, col_type in [
                ("wind_direction", "DOUBLE PRECISION"),
                ("precipitation", "DOUBLE PRECISION"),
                ("latitude", "DOUBLE PRECISION"),
                ("longitude", "DOUBLE PRECISION"),
                ("zone_name", "VARCHAR(255)"),
            ]:
                conn.execute(text(f"ALTER TABLE sensor_predictions ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))

            for col_name, col_type in [
                ("temperature", "DOUBLE PRECISION"),
                ("humidity", "DOUBLE PRECISION"),
                ("soil_moisture", "DOUBLE PRECISION"),
                ("wind_speed", "DOUBLE PRECISION"),
                ("location", "VARCHAR(255)"),
                ("email_status", "VARCHAR(50)"),
                ("email_recipient", "VARCHAR(255)"),
                ("email_error", "TEXT"),
                ("sms_status", "VARCHAR(50)"),
                ("sms_recipient", "VARCHAR(255)"),
                ("sms_message_sid", "VARCHAR(255)"),
                ("sms_error", "TEXT"),
                ("whatsapp_status", "VARCHAR(50)"),
                ("whatsapp_recipient", "VARCHAR(255)"),
                ("whatsapp_message_sid", "VARCHAR(255)"),
                ("whatsapp_error", "TEXT"),
            ]:
                conn.execute(text(f"ALTER TABLE alerts ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
            conn.commit()

    except Exception as e:
        print(f"Schema migration note: {e}")
    
    # Load ML models on startup
    load_models()
    
    yield
    # Shutdown logic if needed

app = FastAPI(
    title="Ignite Shield API",
    description="Backend API for IoT + Machine Learning Fire Risk Prediction",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3000",
    # Add other origins as needed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/health")
def health_check():
    return {"status": "ok"}

# Include routers
app.include_router(routes_prediction.router, prefix="/api", tags=["prediction"])
app.include_router(routes_readings.router, prefix="/api", tags=["readings"])
app.include_router(routes_dashboard.router, prefix="/api", tags=["dashboard"])
app.include_router(routes_auth.router, prefix="/api", tags=["auth"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
