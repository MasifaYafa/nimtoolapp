from django.apps import AppConfig

class TroubleshootConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.troubleshoot'   # full python path
    label = 'troubleshoot'       # <- the app label used by "makemigrations troubleshoot"
    verbose_name = 'Troubleshoot'
