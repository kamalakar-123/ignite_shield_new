from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import engine, Base
from api import routes_prediction, routes_readings
from services.prediction_service import load_models

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables
    Base.metadata.create_all(bind=engine)
    
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
app.include_router(routes_prediction.router, prefix="/api/v1", tags=["prediction"])
app.include_router(routes_readings.router, prefix="/api/v1", tags=["readings"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
