# apps/app_settings/admin.py
from django.contrib import admin
from .models import AppSettings, UserProfile


@admin.register(AppSettings)
class AppSettingsAdmin(admin.ModelAdmin):
    list_display = ['ping_interval', 'snmp_timeout', 'alert_threshold', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']

    def has_add_permission(self, request):
        # Only allow one settings instance
        return not AppSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        # Don't allow deletion of settings
        return False


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'department', 'phone', 'updated_at']
    list_filter = ['department', 'created_at']
    search_fields = ['user__username', 'user__email', 'department']
    readonly_fields = ['created_at', 'updated_at']