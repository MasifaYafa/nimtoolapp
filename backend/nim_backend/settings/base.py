# backend/nim_backend/settings/base.py
"""
Django base settings for nim_backend project.
Common settings shared across all environments.
"""

from pathlib import Path
import os
from decouple import config
import dj_database_url

# ----------------------------
# Paths / Core
# ----------------------------
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-me-in-production')

# Helper to parse comma-separated env vars
def csv(name: str, default: str = "") -> list[str]:
    raw = config(name, default=default)
    return [item.strip() for item in raw.split(",") if item.strip()]

# Hosts — base provides safe local defaults; envs can override
ALLOWED_HOSTS = csv("ALLOWED_HOSTS", default="localhost,127.0.0.1,0.0.0.0")

# ----------------------------
# Applications
# ----------------------------
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]
THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_extensions',
    'django_filters',
]
LOCAL_APPS = [
    'apps.authentication',
    'apps.devices',
    'apps.alerts',
    'apps.actions',
    'apps.reports',
    'apps.configuration',
    'apps.troubleshoot',
    'apps.app_settings',
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ----------------------------
# Middleware (Security → CORS → session/common/CSRF/auth/…)
# ----------------------------
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',   # must be high and before CommonMiddleware
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'nim_backend.urls'

# ----------------------------
# Templates (make sure backend/templates is searched)
# ----------------------------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],  # index.html lives here
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'nim_backend.wsgi.application'

# ----------------------------
# Database (DATABASE_URL overrides discrete envs)
# ----------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='nim_tool_db'),
        'USER': config('DB_USER', default='nim_user'),
        'PASSWORD': config('DB_PASSWORD', default='nim_password'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
    }
}
_db_url = config('DATABASE_URL', default=None)
if _db_url:
    DATABASES['default'] = dj_database_url.parse(
        _db_url,
        conn_max_age=config('DB_CONN_MAX_AGE', default=60, cast=int),
        ssl_require=config('DB_SSL_REQUIRED', default=False, cast=bool),
    )

# ----------------------------
# Password validation
# ----------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ----------------------------
# I18N / TZ
# ----------------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# ----------------------------
# Static / Media (+ optional React build wiring)
# ----------------------------
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Only include project /static if it exists (prevents W004 warnings)
STATICFILES_DIRS = []
_project_static = BASE_DIR / 'static'
if _project_static.exists():
    STATICFILES_DIRS.append(_project_static)

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# If frontend/build exists, serve its index.html and collect its static
FRONTEND_BUILD_DIR = BASE_DIR / 'frontend' / 'build'
if FRONTEND_BUILD_DIR.exists():
    # index.html
    TEMPLATES[0]['DIRS'].insert(0, FRONTEND_BUILD_DIR)
    # build/static
    build_static = FRONTEND_BUILD_DIR / 'static'
    if build_static.exists():
        STATICFILES_DIRS.append(build_static)

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ----------------------------
# DRF
# ----------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': [
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
        'django_filters.rest_framework.DjangoFilterBackend',
    ],
}
if config('DRF_BROWSABLE_API', default=False, cast=bool):
    REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ]
else:
    REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = ['rest_framework.renderers.JSONRenderer']

# ----------------------------
# JWT
# ----------------------------
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
}

# ----------------------------
# CORS / CSRF
# ----------------------------
CORS_ALLOW_ALL_ORIGINS = config('CORS_ALLOW_ALL_ORIGINS', default=False, cast=bool)
CORS_ALLOWED_ORIGINS = csv('CORS_ALLOWED_ORIGINS', default='http://localhost:3000,http://127.0.0.1:3000')
CORS_ALLOW_CREDENTIALS = True

def _with_scheme(origin: str) -> str:
    return origin if origin.startswith(('http://', 'https://')) else f'https://{origin}'
CSRF_TRUSTED_ORIGINS = [
    _with_scheme(o) for o in csv('CSRF_TRUSTED_ORIGINS', default='')
] or [_with_scheme(o) for o in CORS_ALLOWED_ORIGINS]

# ----------------------------
# Celery
# ----------------------------
CELERY_BROKER_URL = config('REDIS_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config('REDIS_URL', default='redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# (fixed name) CELERY_BEAT_SCHEDULE
CELERY_BEAT_SCHEDULE = {
    'monitor-devices': {'task': 'apps.devices.tasks.monitor_all_devices', 'schedule': 30.0},
    'cleanup-old-alerts': {'task': 'apps.alerts.tasks.cleanup_old_alerts', 'schedule': 3600.0},
}

# ----------------------------
# Email
# ----------------------------
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default=EMAIL_HOST_USER or 'webmaster@localhost')

# ----------------------------
# Auth
# ----------------------------
AUTH_USER_MODEL = 'authentication.User'

# ----------------------------
# Logging
# ----------------------------
LOG_DIR = BASE_DIR / 'logs'
LOG_DIR.mkdir(exist_ok=True)
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}', 'style': '{'},
        'simple': {'format': '{levelname} {message}', 'style': '{'},
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': LOG_DIR / 'nim_tool.log',
            'formatter': 'verbose',
        },
        'console': {'level': 'INFO', 'class': 'logging.StreamHandler', 'formatter': 'simple'},
    },
    'root': {'handlers': ['console', 'file'], 'level': 'INFO'},
    'loggers': {
        'django': {'handlers': ['console', 'file'], 'level': 'INFO', 'propagate': False},
        'apps': {'handlers': ['console', 'file'], 'level': 'INFO', 'propagate': False},
    },
}

# ----------------------------
# NIM-Tool custom
# ----------------------------
NIM_TOOL_SETTINGS = {
    'DEFAULT_PING_INTERVAL': 30,
    'DEFAULT_SNMP_TIMEOUT': 10,
    'DEFAULT_SNMP_RETRIES': 3,
    'MAX_DEVICES_PER_USER': 1000,
    'ALERT_RETENTION_DAYS': 90,
    'BACKUP_RETENTION_DAYS': 30,
    'DEFAULT_SNMP_COMMUNITY': 'public',
    'GOOGLE_MAPS_API_KEY': config('GOOGLE_MAPS_API_KEY', default=''),
}

# Security headers
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
