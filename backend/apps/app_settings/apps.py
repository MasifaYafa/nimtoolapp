# apps/app_settings/apps.py
from django.apps import AppConfig

class AppSettingsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.app_settings"   # ← full path (NOT just "app_settings")
    label = "app_settings"       # stable label for migrations/admin
