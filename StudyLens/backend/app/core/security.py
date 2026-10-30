from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE = timedelta(minutes=settings.access_token_expire_minutes)
REFRESH_TOKEN_EXPIRE = timedelta(days=7)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def _create_token(subject: str, expires: timedelta, token_type: str) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {'sub': subject, 'type': token_type, 'iat': now, 'exp': now + expires}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_access_token(subject: str) -> str:
    return _create_token(subject, ACCESS_TOKEN_EXPIRE, 'access')


def create_refresh_token(subject: str) -> str:
    return _create_token(subject, REFRESH_TOKEN_EXPIRE, 'refresh')


def decode_token(token: str, expected_type: str = 'access') -> str:
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    if payload.get('type') != expected_type:
        raise ValueError('Invalid token type')
    sub = payload.get('sub')
    if not sub:
        raise ValueError('Missing subject')
    return sub
