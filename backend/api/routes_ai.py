import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from database import get_db
from schemas import AIChatRequest, AIChatResponse
from services.ai_service import process_ai_query, get_station_context

logger = logging.getLogger("ignite_shield.api_ai")
router = APIRouter()


@router.post("/chat", response_model=AIChatResponse, status_code=status.HTTP_200_OK)
async def chat_with_assistant(
    request: AIChatRequest,
    db: Session = Depends(get_db)
):
    """
    Query the Ignite Shield AI Assistant.
    Grounded on real database telemetry, active incidents, and live Open-Meteo weather.
    Distinguishes measured facts, external weather context, and tactical recommendations.
    """
    result = await process_ai_query(
        db=db,
        query=request.message,
        station_id=request.station_id,
        latitude=request.latitude,
        longitude=request.longitude
    )
    return AIChatResponse(**result)


@router.get("/context", status_code=status.HTTP_200_OK)
def get_ai_grounding_context(
    station_id: Optional[str] = Query("ESP32-NODE-01", description="Station or device ID"),
    latitude: Optional[float] = Query(None, description="Optional target latitude override"),
    longitude: Optional[float] = Query(None, description="Optional target longitude override"),
    db: Session = Depends(get_db)
):
    """
    Inspect the verified backend state and weather data used to ground the AI Assistant.
    """
    context = get_station_context(
        db=db,
        station_id=station_id,
        latitude=latitude,
        longitude=longitude
    )
    return context
