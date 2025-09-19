#Development.py
"""
Development settings for nim_backend project.
These settings are used during development.
"""

from .base import *

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0']

# Development database - you can use SQLite for development if you prefer
# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.sqlite3',
#         'NAME': BASE_DIR / 'db.sqlite3',
#     }
# }

# Allow all origins in development (for CORS)
CORS_ALLOW_ALL_ORIGINS = True

# Allow frontend origin
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    #"http://192.168.207.248:3000"
]

CORS_ALLOW_CREDENTIALS = True

# Development-specific logging
LOGGING['handlers']['console']['level'] = 'DEBUG'
LOGGING['loggers']['django']['level'] = 'DEBUG'
LOGGING['loggers']['apps']['level'] = 'DEBUG'

# Django Debug Toolbar (optional - install separately if needed)
# INSTALLED_APPS += ['debug_toolbar']
# MIDDLEWARE += ['debug_toolbar.middleware.DebugToolbarMiddleware']
# INTERNAL_IPS = ['127.0.0.1']

# Email backend for development (prints to console)
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Celery settings for development
CELERY_TASK_ALWAYS_EAGER = False  # Set to True to run tasks synchronously in development
CELERY_EAGER_PROPAGATES_EXCEPTIONS = True

print("🔧 Development settings loaded")