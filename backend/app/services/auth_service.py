import bcrypt
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings
from app.stores.user_store import get_by_id

security = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str):
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return payload.get("sub")
    except JWTError:
        return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    uid = decode_token(credentials.credentials)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = get_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
