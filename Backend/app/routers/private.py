from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends

from ..dependencies import get_current_user, get_token_claims
from ..models import User
from ..schemas import PrivateResponse, UserResponse

router = APIRouter()


@router.get("/private", response_model=PrivateResponse)
async def private_endpoint(
    claims: dict[str, Any] = Depends(get_token_claims),
    user: User = Depends(get_current_user),
) -> PrivateResponse:
    expires_at = datetime.fromtimestamp(int(claims["exp"]), tz=timezone.utc)
    return PrivateResponse(
        message=f"Hello {user.name or user.email}. You are authenticated.",
        user=UserResponse.model_validate(user),
        token_expires_at=expires_at,
        token_scopes=str(claims.get("scope", "")).split(),
    )
