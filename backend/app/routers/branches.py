import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import Settings, get_settings
from app.data import get_data_source
from app.data.base import DataSource
from app.models import Branch, BranchListResponse
from app.security import limiter, require_session

logger = logging.getLogger("app.routers.branches")

router = APIRouter(prefix="/api", dependencies=[Depends(require_session)])


@router.get("/branches", response_model=BranchListResponse)
@limiter.limit("60/minute")
def list_branches(
    request: Request,
    source: DataSource = Depends(get_data_source),
    settings: Settings = Depends(get_settings),
) -> BranchListResponse:
    branches = source.list_branches()
    cache_age_s = getattr(source, "cache_age_seconds", None)
    request_id = getattr(request.state, "request_id", "-")
    logger.info(
        "branches_served count=%d source=%s cache_age_s=%s request_id=%s",
        len(branches), settings.data_source, cache_age_s, request_id,
    )
    return BranchListResponse(branches=branches, count=len(branches), source=settings.data_source)


@router.get("/branches/{branch_id}", response_model=Branch)
@limiter.limit("60/minute")
def get_branch(
    request: Request,
    branch_id: str,
    source: DataSource = Depends(get_data_source),
) -> Branch:
    for branch in source.list_branches():
        if branch.id == branch_id:
            return branch
    raise HTTPException(status_code=404, detail=f"No branch with id '{branch_id}'")
