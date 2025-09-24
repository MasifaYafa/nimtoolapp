# backend/apps/devices/apps.py
from django.apps import AppConfig
import os

class DevicesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.devices'

    def ready(self):
        # Avoid double-start under runserver autoreload
        if os.environ.get("RUN_MAIN") == "true" or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
            try:
                from .monitoring import monitoring_service
                if not monitoring_service.is_monitoring_active():
                    monitoring_service.start_monitoring()
            except Exception as e:
                # Never crash Django if background thread fails to start
                import logging
                logging.getLogger(__name__).error(f"Failed to start device monitoring: {e}")
