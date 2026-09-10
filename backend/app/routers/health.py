from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.models import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    # Deliberately unauthenticated -- this is what a load balancer or
    # uptime check hits, and it reveals nothing sensitive.
    return HealthResponse(status="ok", source=settings.data_source)
