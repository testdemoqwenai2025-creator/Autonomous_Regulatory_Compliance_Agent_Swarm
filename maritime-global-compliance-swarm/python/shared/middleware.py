"""
Composable Middleware Pipeline for the Maritime Compliance Gateway.

Implements a chain-of-responsibility pattern for cross-cutting concerns:
authentication, rate limiting, request audit logging, request validation,
and CORS handling. Each middleware can be independently enabled/disabled
and configured via the SwarmConfig.

Usage:
    pipeline = MiddlewarePipeline()
    pipeline.use(AuthMiddleware(config.auth))
    pipeline.use(RateLimitMiddleware(config.rate_limit))
    pipeline.use(AuditLogMiddleware())
    pipeline.use(RequestValidationMiddleware())

    app = FastAPI()
    pipeline.apply(app)
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional

import jwt as pyjwt

logger = logging.getLogger("middleware")


# ---------------------------------------------------------------------------
# Middleware base
# ---------------------------------------------------------------------------

class MiddlewarePriority(int, Enum):
    """Execution order for middleware (lower = earlier in request chain)."""
    CORS = 10
    AUTH = 20
    RATE_LIMIT = 30
    VALIDATION = 40
    AUDIT_LOG = 50


@dataclass
class MiddlewareContext:
    """Context passed through the middleware chain."""
    request_id: str = ""
    client_ip: str = ""
    method: str = ""
    path: str = ""
    start_time: float = 0.0
    auth_principal: Optional[str] = None
    rate_limit_remaining: int = -1
    request_headers: dict = field(default_factory=dict)
    metadata: dict = field(default_factory=dict)


class BaseMiddleware:
    """Abstract base for all middleware components."""

    priority: MiddlewarePriority = MiddlewarePriority.AUDIT_LOG
    enabled: bool = True

    async def before_request(self, ctx: MiddlewareContext, request: Any) -> Optional[Any]:
        """Process request before reaching the route handler.
        Return a response to short-circuit, or None to continue."""
        return None

    async def after_request(self, ctx: MiddlewareContext, response: Any) -> Any:
        """Process response before sending to client.
        Must return the response (modified or as-is)."""
        return response

    async def on_error(self, ctx: MiddlewareContext, error: Exception) -> Optional[Any]:
        """Handle errors that occur in the middleware chain.
        Return a response to override default error handling, or None."""
        return None


# ---------------------------------------------------------------------------
# Authentication Middleware
# ---------------------------------------------------------------------------

@dataclass
class AuthConfig:
    enabled: bool = False
    api_key_header: str = "X-API-Key"
    api_keys: list[str] = field(default_factory=list)
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    exempt_paths: list[str] = field(default_factory=lambda: [
        "/", "/health", "/docs", "/redoc", "/openapi.json",
        "/api/v1/system/frontend-status",
    ])



# --- RBAC Role Definitions ---

class RBACRole(str, Enum):
    """Role-based access control roles for the compliance platform."""
    ADMIN = "admin"
    COMPLIANCE_OFFICER = "compliance_officer"
    AUDITOR = "auditor"
    VIEWER = "viewer"
    SYSTEM = "system"


# Role -> allowed path prefix mappings
RBAC_PATH_PERMISSIONS: dict[RBACRole, list[str]] = {
    RBACRole.ADMIN: ["/"],  # Admin has access to everything
    RBACRole.SYSTEM: ["/"],  # System (internal services) has full access
    RBACRole.COMPLIANCE_OFFICER: [
        "/api/v1/audits",
        "/api/v1/findings",
        "/api/v1/compliance",
        "/api/v1/emissions",
        "/api/v1/reports",
        "/api/v1/remediation",
        "/api/v1/edi",
        "/api/v1/anonymiser",
        "/api/v1/knowledge-graph",
    ],
    RBACRole.AUDITOR: [
        "/api/v1/audits",
        "/api/v1/findings",
        "/api/v1/compliance",
        "/api/v1/emissions",
        "/api/v1/reports",
    ],
    RBACRole.VIEWER: [
        "/api/v1/reports",
        "/api/v1/findings",
        "/api/v1/compliance",
        "/api/v1/emissions",
        "/api/v1/health",
    ],
}


def _role_has_path_access(role: RBACRole, path: str) -> bool:
    """Check if a role has permission for the given path."""
    allowed_prefixes = RBAC_PATH_PERMISSIONS.get(role, [])
    for prefix in allowed_prefixes:
        if prefix == "/":
            return True
        if path == prefix or path.startswith(prefix + "/"):
            return True
    return False


def generate_jwt(
    secret: str,
    principal: str,
    role: str,
    expires_hours: int = 24,
) -> str:
    """Generate a JWT token for testing.

    Args:
        secret: HMAC secret key.
        principal: User identifier (sub claim).
        role: RBAC role string (e.g., "admin", "auditor").
        expires_hours: Token validity duration.

    Returns:
        Encoded JWT string.
    """
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    payload = {
        "sub": principal,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=expires_hours)).timestamp()),
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


class AuthMiddleware(BaseMiddleware):
    """API key and JWT authentication middleware with RBAC."""

    priority = MiddlewarePriority.AUTH

    def __init__(self, config: Optional[AuthConfig] = None):
        self.config = config or AuthConfig()
        self.enabled = self.config.enabled

    def _validate_jwt(self, token: str) -> Optional[dict]:
        """Decode and validate a JWT token. Returns payload or None."""
        if not self.config.jwt_secret:
            return None
        try:
            payload = pyjwt.decode(
                token,
                self.config.jwt_secret,
                algorithms=[self.config.jwt_algorithm],
            )
            return payload
        except pyjwt.ExpiredSignatureError:
            logger.warning("JWT token expired")
            return None
        except pyjwt.InvalidTokenError as e:
            logger.warning(f"JWT validation failed: {e}")
            return None

    def _extract_jwt_from_header(self, headers: dict) -> Optional[str]:
        """Extract JWT token from Authorization header."""
        auth_header = headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]
        return None

    def _extract_role(self, payload: dict) -> Optional[RBACRole]:
        """Extract RBAC role from JWT payload."""
        role_str = payload.get("role", "")
        if not role_str:
            role_str = payload.get("sub", "")
        try:
            return RBACRole(role_str)
        except ValueError:
            logger.warning(f"Unknown RBAC role: {role_str}")
            return None

    async def before_request(self, ctx: MiddlewareContext, request: Any) -> Optional[Any]:
        if not self.enabled:
            return None
        if ctx.path in self.config.exempt_paths:
            return None
        if ctx.path.startswith("/docs") or ctx.path.startswith("/redoc"):
            return None

        from fastapi.responses import JSONResponse

        # Check API key first (backward compatible)
        api_key = ctx.request_headers.get(self.config.api_key_header.lower(), "")
        if api_key and self.config.api_keys:
            if api_key in self.config.api_keys:
                ctx.auth_principal = f"api-key:{api_key[:8]}..."
                return None

        # Check JWT token
        jwt_token = self._extract_jwt_from_header(ctx.request_headers)
        if jwt_token and self.config.jwt_secret:
            payload = self._validate_jwt(jwt_token)
            if payload:
                principal = payload.get("sub", "unknown")
                ctx.auth_principal = f"jwt:{principal}"
                ctx.metadata["jwt_payload"] = payload

                # RBAC check
                role = self._extract_role(payload)
                if role and not _role_has_path_access(role, ctx.path):
                    logger.warning(
                        f"RBAC denied: role={role.value} path={ctx.path} "
                        f"principal={principal}"
                    )
                    return JSONResponse(
                        status_code=403,
                        content={
                            "detail": f"Role '{role.value}' lacks permission for {ctx.path}",
                            "error": "FORBIDDEN",
                        },
                    )
                return None
            else:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid or expired token", "error": "INVALID_TOKEN"},
                )

        # If JWT_SECRET is empty, skip JWT validation (backward compatibility)
        if not self.config.jwt_secret and not self.config.api_keys:
            return None

        # If auth is enabled but no valid credentials, reject
        if self.enabled and self.config.api_keys:
            logger.warning(f"Auth failed for {ctx.method} {ctx.path} from {ctx.client_ip}")
            return JSONResponse(
                status_code=401,
                content={"detail": "Authentication required", "error": "UNAUTHENTICATED"},
            )
        return None


# ---------------------------------------------------------------------------
# Rate Limiting Middleware
# ---------------------------------------------------------------------------

@dataclass
class RateLimitConfig:
    enabled: bool = True
    requests_per_window: int = 100
    window_seconds: int = 60
    burst_limit: int = 150  # Allow short bursts


class RateLimitMiddleware(BaseMiddleware):
    """Token-bucket rate limiting middleware with per-IP tracking."""

    priority = MiddlewarePriority.RATE_LIMIT

    def __init__(self, config: Optional[RateLimitConfig] = None):
        self.config = config or RateLimitConfig()
        self.enabled = self.config.enabled
        # {client_ip: {"tokens": float, "last_refill": float}}
        self._buckets: dict[str, dict[str, float]] = defaultdict(
            lambda: {
                "tokens": float(self.config.burst_limit),
                "last_refill": time.monotonic(),
            }
        )

    def _refill(self, bucket: dict[str, float]) -> float:
        """Refill tokens based on elapsed time."""
        now = time.monotonic()
        elapsed = now - bucket["last_refill"]
        refill = (elapsed / self.config.window_seconds) * self.config.requests_per_window
        bucket["tokens"] = min(self.config.burst_limit, bucket["tokens"] + refill)
        bucket["last_refill"] = now
        return bucket["tokens"]

    async def before_request(self, ctx: MiddlewareContext, request: Any) -> Optional[Any]:
        if not self.enabled:
            ctx.rate_limit_remaining = self.config.requests_per_window
            return None

        key = ctx.client_ip or "unknown"
        bucket = self._buckets[key]
        tokens = self._refill(bucket)

        if tokens < 1.0:
            ctx.rate_limit_remaining = 0
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Retry later.",
                    "error": "RATE_LIMITED",
                    "retry_after": self.config.window_seconds,
                },
                headers={"Retry-After": str(self.config.window_seconds)},
            )

        bucket["tokens"] -= 1.0
        ctx.rate_limit_remaining = int(bucket["tokens"])
        return None


# ---------------------------------------------------------------------------
# Audit Log Middleware
# ---------------------------------------------------------------------------

@dataclass
class AuditLogEntry:
    request_id: str
    timestamp: datetime
    client_ip: str
    method: str
    path: str
    status_code: int
    duration_ms: float
    auth_principal: Optional[str]
    user_agent: str
    request_size: int = 0
    response_size: int = 0
    error_message: Optional[str] = None


class AuditLogMiddleware(BaseMiddleware):
    """Structured audit logging for all API requests.

    Outputs structured JSON logs suitable for ingestion by
    observability platforms (ELK, Loki, CloudWatch)."""

    priority = MiddlewarePriority.AUDIT_LOG
    _audit_log: list[dict] = []  # In-memory; in production, write to event bus

    async def before_request(self, ctx: MiddlewareContext, request: Any) -> Optional[Any]:
        ctx.start_time = time.monotonic()
        ctx.request_id = hashlib.sha256(
            f"{ctx.client_ip}:{time.time_ns()}:{ctx.path}".encode()
        ).hexdigest()[:16]
        return None

    async def after_request(self, ctx: MiddlewareContext, response: Any) -> Any:
        duration_ms = (time.monotonic() - ctx.start_time) * 1000
        status_code = getattr(response, "status_code", 200)

        entry = {
            "request_id": ctx.request_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "client_ip": ctx.client_ip,
            "method": ctx.method,
            "path": ctx.path,
            "status_code": status_code,
            "duration_ms": round(duration_ms, 2),
            "auth_principal": ctx.auth_principal,
            "rate_limit_remaining": ctx.rate_limit_remaining,
        }

        # Attach request ID to response headers
        if hasattr(response, "headers"):
            response.headers["X-Request-ID"] = ctx.request_id
            response.headers["X-Duration-Ms"] = str(round(duration_ms, 2))

        if status_code >= 500:
            logger.error(f"AUDIT: {entry}")
        elif status_code >= 400:
            logger.warning(f"AUDIT: {entry}")
        else:
            logger.info(f"AUDIT: {entry}")

        AuditLogMiddleware._audit_log.append(entry)
        return response

    async def on_error(self, ctx: MiddlewareContext, error: Exception) -> Optional[Any]:
        duration_ms = (time.monotonic() - ctx.start_time) * 1000 if ctx.start_time else 0
        logger.error(
            f"AUDIT ERROR: request_id={ctx.request_id} "
            f"path={ctx.path} error={type(error).__name__}: {error} "
            f"duration_ms={duration_ms:.2f}"
        )
        return None

    @classmethod
    def get_recent_logs(cls, limit: int = 100) -> list[dict]:
        return cls._audit_log[-limit:]

    @classmethod
    def clear_logs(cls):
        cls._audit_log.clear()


# ---------------------------------------------------------------------------
# Request Validation Middleware
# ---------------------------------------------------------------------------

class RequestValidationMiddleware(BaseMiddleware):
    """Validates request size and content type for API endpoints."""

    priority = MiddlewarePriority.VALIDATION

    MAX_PAYLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
    VALID_CONTENT_TYPES = {
        "application/json",
        "multipart/form-data",
        "text/plain",
    }

    async def before_request(self, ctx: MiddlewareContext, request: Any) -> Optional[Any]:
        # Only validate POST/PUT/PATCH requests with body
        if ctx.method not in ("POST", "PUT", "PATCH"):
            return None

        content_length = ctx.request_headers.get("content-length", "")
        if content_length:
            try:
                size = int(content_length)
                if size > self.MAX_PAYLOAD_SIZE:
                    from fastapi.responses import JSONResponse
                    return JSONResponse(
                        status_code=413,
                        content={
                            "detail": f"Payload too large. Maximum size is {self.MAX_PAYLOAD_SIZE // (1024*1024)} MB.",
                            "error": "PAYLOAD_TOO_LARGE",
                        },
                    )
            except ValueError:
                pass

        return None


# ---------------------------------------------------------------------------
# Redis-backed Distributed Rate Limiting
# ---------------------------------------------------------------------------

@dataclass
class RedisRateLimitConfig:
    """Configuration for Redis-backed distributed rate limiting."""
    redis_url: str = "redis://localhost:6379/0"
    key_prefix: str = "mrl:"
    ttl_seconds: int = 60
    requests_per_window: int = 100
    burst_limit: int = 150
    enabled: bool = True


class RedisRateLimitMiddleware(BaseMiddleware):
    """Token-bucket rate limiting with Redis for multi-instance deployments.

    Uses Redis to store token bucket state with TTL for distributed
    coordination. Falls back to in-memory if Redis is unavailable.
    """

    priority = MiddlewarePriority.RATE_LIMIT

    def __init__(self, config: Optional[RedisRateLimitConfig] = None):
        self.config = config or RedisRateLimitConfig()
        self.enabled = self.config.enabled
        self._redis = None
        self._redis_available = False
        # In-memory fallback buckets
        self._fallback_buckets: dict[str, dict[str, float]] = defaultdict(
            lambda: {
                "tokens": float(self.config.burst_limit),
                "last_refill": time.monotonic(),
            }
        )
        self._try_connect_redis()

    def _try_connect_redis(self) -> None:
        """Attempt to connect to Redis. Logs warning and falls back on failure."""
        try:
            import aioredis
            self._redis = aioredis.from_url(
                self.config.redis_url,
                decode_responses=True,
            )
            self._redis_available = True
            logger.info(f"Redis rate limiter connected: {self.config.redis_url}")
        except Exception as e:
            self._redis_available = False
            logger.warning(
                f"Redis unavailable at {self.config.redis_url}, "
                f"falling back to in-memory rate limiting. Error: {e}"
            )

    async def _get_redis_tokens(self, key: str) -> Optional[float]:
        """Get current token count from Redis."""
        if not self._redis:
            return None
        try:
            data = await self._redis.hgetall(key)
            if data:
                return float(data.get("tokens", 0))
            return None
        except Exception:
            return None

    async def _set_redis_tokens(self, key: str, tokens: float, last_refill: float) -> None:
        """Store token bucket state in Redis with TTL."""
        if not self._redis:
            return
        try:
            await self._redis.hset(key, mapping={
                "tokens": str(tokens),
                "last_refill": str(last_refill),
            })
            await self._redis.expire(key, self.config.ttl_seconds)
        except Exception as e:
            logger.warning(f"Redis write error: {e}")

    def _refill_bucket(self, last_refill: float, current_tokens: float) -> tuple[float, float]:
        """Calculate refilled tokens. Returns (new_tokens, new_last_refill)."""
        now = time.monotonic()
        elapsed = now - last_refill
        refill = (elapsed / self.config.ttl_seconds) * self.config.requests_per_window
        new_tokens = min(self.config.burst_limit, current_tokens + refill)
        return new_tokens, now

    async def _check_redis_limit(self, key: str) -> tuple[bool, float]:
        """Check rate limit using Redis. Returns (allowed, remaining_tokens)."""
        data = await self._redis.hgetall(key)
        if data:
            tokens = float(data.get("tokens", 0))
            last_refill = float(data.get("last_refill", time.monotonic()))
            tokens, last_refill = self._refill_bucket(last_refill, tokens)
            if tokens < 1.0:
                return False, 0.0
            tokens -= 1.0
            await self._set_redis_tokens(key, tokens, last_refill)
            return True, tokens
        else:
            # First request from this client in Redis
            tokens = self.config.burst_limit - 1.0
            await self._set_redis_tokens(key, tokens, time.monotonic())
            return True, tokens

    def _check_memory_limit(self, key: str) -> tuple[bool, float]:
        """Check rate limit using in-memory fallback."""
        bucket = self._fallback_buckets[key]
        tokens, last_refill = self._refill_bucket(bucket["last_refill"], bucket["tokens"])
        bucket["tokens"] = tokens
        bucket["last_refill"] = last_refill
        if tokens < 1.0:
            return False, 0.0
        bucket["tokens"] -= 1.0
        return True, bucket["tokens"]

    async def before_request(self, ctx: MiddlewareContext, request: Any) -> Optional[Any]:
        if not self.enabled:
            ctx.rate_limit_remaining = self.config.requests_per_window
            return None

        from fastapi.responses import JSONResponse

        key = f"{self.config.key_prefix}{ctx.client_ip or 'unknown'}"

        if self._redis_available:
            allowed, remaining = await self._check_redis_limit(key)
        else:
            allowed, remaining = self._check_memory_limit(key)

        if not allowed:
            ctx.rate_limit_remaining = 0
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Retry later.",
                    "error": "RATE_LIMITED",
                    "retry_after": self.config.ttl_seconds,
                },
                headers={"Retry-After": str(self.config.ttl_seconds)},
            )

        ctx.rate_limit_remaining = int(remaining)
        return None


# ---------------------------------------------------------------------------
# Middleware Pipeline
# ---------------------------------------------------------------------------

class MiddlewarePipeline:
    """Composable middleware pipeline that applies middleware in priority order."""

    def __init__(self):
        self._middleware: list[BaseMiddleware] = []

    def use(self, middleware: BaseMiddleware) -> "MiddlewarePipeline":
        """Add a middleware component to the pipeline."""
        self._middleware.append(middleware)
        # Sort by priority (lower = earlier)
        self._middleware.sort(key=lambda m: m.priority)
        return self

    def get_enabled(self) -> list[BaseMiddleware]:
        """Return only enabled middleware, sorted by priority."""
        return [m for m in self._middleware if m.enabled]

    def apply(self, app: Any) -> None:
        """Apply all middleware to a FastAPI application.

        Registers @app.middleware("http") hooks that execute the
        middleware chain for every request.
        """
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.requests import Request
        from starlette.responses import Response, JSONResponse

        enabled = self.get_enabled()

        @app.middleware("http")
        async def middleware_chain(request: Request, call_next):
            # Build context
            ctx = MiddlewareContext(
                client_ip=request.client.host if request.client else "unknown",
                method=request.method,
                path=request.url.path,
                request_headers=dict(request.headers),
            )

            # Execute before_request chain
            for mw in enabled:
                result = await mw.before_request(ctx, request)
                if result is not None:
                    return result

            # Execute the actual route handler
            try:
                response = await call_next(request)
            except Exception as e:
                # Execute on_error chain
                for mw in reversed(enabled):
                    error_result = await mw.on_error(ctx, e)
                    if error_result is not None:
                        return error_result
                raise

            # Execute after_request chain
            for mw in reversed(enabled):
                response = await mw.after_request(ctx, response)

            return response


# ---------------------------------------------------------------------------
# Factory helper
# ---------------------------------------------------------------------------

def create_default_pipeline(config: Optional[object] = None) -> MiddlewarePipeline:
    """Create a middleware pipeline with default configuration."""
    pipeline = MiddlewarePipeline()

    auth_config = AuthConfig(enabled=False)  # Disabled by default for dev
    if config and hasattr(config, "auth"):
        auth_config.enabled = getattr(config.auth, "enabled", False)
        auth_config.api_keys = getattr(config.auth, "api_keys", [])

    # Pull security settings if available
    if config and hasattr(config, "security"):
        auth_config.jwt_secret = getattr(config.security, "jwt_secret", "")
        auth_config.jwt_algorithm = getattr(config.security, "jwt_algorithm", "HS256")

    pipeline.use(AuthMiddleware(auth_config))
    pipeline.use(RateLimitMiddleware(RateLimitConfig()))

    # Add Redis-backed rate limiter if security config provides Redis URL
    if config and hasattr(config, "security"):
        redis_url = getattr(config.security, "redis_rate_limit_url", "")
        redis_ttl = getattr(config.security, "redis_rate_limit_ttl", 60)
        if redis_url:
            redis_config = RedisRateLimitConfig(
                redis_url=redis_url,
                ttl_seconds=redis_ttl,
            )
            pipeline.use(RedisRateLimitMiddleware(redis_config))

    pipeline.use(RequestValidationMiddleware())
    pipeline.use(AuditLogMiddleware())

    return pipeline