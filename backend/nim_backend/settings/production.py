# nim_backend/settings/production.py
"""
Production settings for nim_backend project.
These settings are used in the production environment (e.g., Railway).
"""

from .base import *
import os

# ----------------------------
# Core toggles
# ----------------------------
DEBUG = False

# Small helper to read comma-separated env vars
def csv(var_name: str, default: str = "") -> list[str]:
    raw = config(var_name, default=default)
    return [item.strip() for item in raw.split(",") if item.strip()]

# ----------------------------
# Hosts / CSRF / CORS
# ----------------------------
# Example env usage on Railway:
#   ALLOWED_HOSTS=your-service.up.railway.app,api.yourdomain.com
ALLOWED_HOSTS = csv("ALLOWED_HOSTS", default="localhost,127.0.0.1")

# CSRF needs full scheme + host. You can pass explicit origins via env, e.g.:
#   CSRF_TRUSTED_ORIGINS=https://your-service.up.railway.app,https://api.yourdomain.com
_csrf_from_env = csv("CSRF_TRUSTED_ORIGINS", default="")
def _with_scheme(h: str) -> str:
    return h if h.startswith(("http://", "https://")) else f"https://{h}"

# Build from env (preferred) or fall back to ALLOWED_HOSTS with https://
CSRF_TRUSTED_ORIGINS = [_with_scheme(h) for h in _csrf_from_env] or [_with_scheme(h) for h in ALLOWED_HOSTS]

# CORS: list the front-end origins that will call this API.
# Example:
#   CORS_ALLOWED_ORIGINS=https://your-frontend.up.railway.app,https://app.yourdomain.com
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = csv("CORS_ALLOWED_ORIGINS", default="")

CORS_ALLOW_CREDENTIALS = True  # if your frontend sends cookies/auth

# ----------------------------
# Security hardening
# ----------------------------
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# ----------------------------
# Database (Railway provides DATABASE_URL)
# base.py already defines DATABASES; here we just keep persistent connections
# ----------------------------
DATABASES["default"]["CONN_MAX_AGE"] = 60

# ----------------------------
# Static files (WhiteNoise)
# ----------------------------
# Use Django 4.2+ STORAGES api with WhiteNoise for compressed/hashed assets
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Ensure WhiteNoise runs right after SecurityMiddleware
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",   # <- required for serving static files
    "corsheaders.middleware.CorsMiddleware",        # keep high for CORS
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# ----------------------------
# Logging
# ----------------------------
LOGGING["handlers"]["file"]["level"] = "WARNING"
LOGGING["loggers"]["django"]["level"] = "WARNING"
LOGGING["loggers"]["apps"]["level"] = "INFO"

print("🚀 Production settings loaded (WhiteNoise + CORS/CSRF ready)")
