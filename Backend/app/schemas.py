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


class DocumentUploadResponse(BaseModel):
    document_id: str
    original_filename: str
    size: int
    mime_type: str
    sha256: str


class DocumentResponse(BaseModel):
    document_id: str
    original_filename: str
    mime_type: str
    size: int
    s3_bucket: str
    s3_prefix: str
    created_at: datetime


class DuplicateCheckRequest(BaseModel):
    sha256: str = Field(pattern=r"^[0-9a-fA-F]{64}$")


class DuplicateCheckResponse(BaseModel):
    exists: bool
    document_id: str | None = None
