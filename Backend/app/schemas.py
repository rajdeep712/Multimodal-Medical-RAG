from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=255)
    username: str | None = Field(default=None, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    auth0_sub: str
    email: EmailStr
    email_verified: bool
    name: str | None = None
    nickname: str | None = None
    picture: str | None = None
    provider: str | None = None
    role: str
    created_at: datetime
    last_login_at: datetime | None = None


class SessionResponse(BaseModel):
    user: UserResponse
    access_expires_at: datetime
    session_expires_at: datetime


class SignupResponse(BaseModel):
    message: str
    user: UserResponse | None = None
    authenticated: bool = False


class PrivateResponse(BaseModel):
    message: str
    user: UserResponse
    token_expires_at: datetime
    token_scopes: list[str]
