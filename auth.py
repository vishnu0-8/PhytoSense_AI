"""
Authentication helpers for PlantAI.
Uses Argon2id password hashing and short-lived HMAC-signed JWT cookies.
Set AUTH_SECRET_KEY to a long random secret in the backend .env file.
"""
import os
import json
import hmac
import time
import base64
import hashlib

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError

from database.history import (
    create_user,
    get_user_by_email,
    get_user_by_mobile,
    get_user_by_id,
)

_password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
TOKEN_TTL_SECONDS = 60 * 60 * 12
COOKIE_NAME = "plantai_session"


def _secret():
    value = os.getenv("AUTH_SECRET_KEY", "").strip()
    if not value:
        raise RuntimeError(
            "AUTH_SECRET_KEY is missing. Add a long random AUTH_SECRET_KEY to your backend .env file."
        )
    return value.encode("utf-8")


def hash_password(password):
    return _password_hasher.hash(password)


def verify_password(password_hash, password):
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, ValueError):
        return False


def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def create_access_token(user_id):
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": str(user_id), "iat": now, "exp": now + TOKEN_TTL_SECONDS}
    head = _b64(json.dumps(header, separators=(",", ":")).encode())
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{head}.{body}".encode("ascii")
    signature = hmac.new(_secret(), signing_input, hashlib.sha256).digest()
    return f"{head}.{body}.{_b64(signature)}"


def decode_access_token(token):
    try:
        head, body, signature = token.split(".")
        signing_input = f"{head}.{body}".encode("ascii")
        expected = hmac.new(_secret(), signing_input, hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        if not hmac.compare_digest(expected, supplied):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(payload.get("exp", 0)) <= int(time.time()):
            return None
        if not payload.get("sub", "").isdigit():
            return None
        return payload
    except Exception:
        return None


def public_user(user):
    if not user:
        return None
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user.get("email"),
        "mobile": user.get("mobile"),
        "village": user.get("village"),
        "district": user.get("district"),
        "state": user.get("state"),
        "created_at": user.get("created_at"),
    }


def register_farmer(data):
    email = (data.email or "").strip().lower() or None
    mobile = (data.mobile or "").strip() or None
    if email and get_user_by_email(email):
        raise ValueError("An account with this email already exists.")
    if mobile and get_user_by_mobile(mobile):
        raise ValueError("An account with this mobile number already exists.")
    user_id = create_user(
        name=data.name,
        email=email,
        mobile=mobile,
        password_hash=hash_password(data.password),
        village=data.village,
        district=data.district,
        state=data.state,
    )
    return public_user(get_user_by_id(user_id))


def authenticate_farmer(identifier, password):
    identifier = (identifier or "").strip()
    user = get_user_by_email(identifier) if "@" in identifier else get_user_by_mobile(identifier)
    if not user or not user.get("is_active") or not verify_password(user["password_hash"], password):
        return None
    return public_user(user)
