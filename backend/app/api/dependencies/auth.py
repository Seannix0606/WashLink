"""Access control for the legacy data routes (audit finding F3).

These routes list every booking, profile (names and phone numbers), shop and worker, so they are operator-only. They fail
closed: with no ADMIN_API_TOKEN configured the routes are disabled, and a request without the exact token is refused.
The token is compared in constant time and is never logged.
"""

import hashlib
import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings

MIN_TOKEN_LENGTH = 32


def _digest(value: str) -> bytes:
    return hashlib.sha256(value.encode("utf-8")).digest()


async def require_admin_token(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    configured = settings.admin_api_token.get_secret_value() if settings.admin_api_token else ""
    if len(configured) < MIN_TOKEN_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="These endpoints are disabled until an operator access token is configured.",
        )
    scheme, _, provided = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not provided or not hmac.compare_digest(_digest(provided), _digest(configured)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in as a WashLink operator to use this endpoint.",
            headers={"WWW-Authenticate": "Bearer"},
        )
