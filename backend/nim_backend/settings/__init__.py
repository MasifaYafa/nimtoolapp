"""
Django settings for nim_backend project.
This package contains different settings modules for different environments.
"""

from .base import *

# Import environment-specific settings
import os
from decouple import config

# Determine which settings to use based on environment
ENVIRONMENT = config('ENVIRONMENT', default='development')

if ENVIRONMENT == 'production':
    from .production import *
else:
    from .development import *