"""
Django admin configuration for alerts app.
"""

from django.contrib import admin
from .models import AlertRule, Alert, AlertNotification


@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    """Admin configuration for AlertRule model."""

    list_display = [
        'name', 'metric_type', 'condition', 'threshold_value',
        'severity', 'is_active', 'created_by', 'created_at'
    ]
    list_filter = ['severity', 'is_active', 'metric_type', 'condition', 'created_at']
    search_fields = ['name', 'description', 'metric_type']
    ordering = ['name']

    fieldsets = (
        ('Rule Information', {
            'fields': ('name', 'description', 'is_active')
        }),
        ('Conditions', {
            'fields': ('metric_type', 'condition', 'threshold_value')
        }),
        ('Alert Properties', {
            'fields': ('severity', 'message_template')
        }),
        ('Scope', {
            'fields': ('applies_to_all_devices', 'specific_devices')
        }),
        ('Notifications', {
            'fields': ('send_email', 'send_sms', 'email_recipients')
        }),
        ('Timing', {
            'fields': ('check_interval', 'cooldown_period')
        })
    )

    filter_horizontal = ['specific_devices']

    def save_model(self, request, obj, form, change):
        """Set created_by to current user if creating new rule."""
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    """Admin configuration for Alert model."""

    list_display = [
        'title', 'device', 'severity', 'status', 'first_occurred',
        'acknowledged_by', 'resolved_by'
    ]
    list_filter = ['severity', 'status', 'first_occurred', 'device__device_type']
    search_fields = ['title', 'message', 'device__name']
    ordering = ['-first_occurred']
    readonly_fields = [
        'id', 'first_occurred', 'last_occurred', 'occurrence_count',
        'acknowledged_at', 'resolved_at'
    ]

    fieldsets = (
        ('Alert Information', {
            'fields': ('title', 'message', 'severity', 'status')
        }),
        ('Related Objects', {
            'fields': ('device', 'alert_rule')
        }),
        ('Values', {
            'fields': ('metric_name', 'current_value', 'threshold_value')
        }),
        ('Timing', {
            'fields': ('first_occurred', 'last_occurred', 'occurrence_count')
        }),
        ('Acknowledgment', {
            'fields': ('acknowledged_by', 'acknowledged_at', 'acknowledgment_note'),
            'classes': ('collapse',)
        }),
        ('Resolution', {
            'fields': ('resolved_by', 'resolved_at', 'resolution_note'),
            'classes': ('collapse',)
        }),
        ('Notifications', {
            'fields': ('email_sent', 'sms_sent', 'notification_count'),
            'classes': ('collapse',)
        })
    )


@admin.register(AlertNotification)
class AlertNotificationAdmin(admin.ModelAdmin):
    """Admin configuration for AlertNotification model."""

    list_display = ['alert', 'type', 'recipient', 'status', 'attempts', 'created_at']
    list_filter = ['type', 'status', 'created_at']
    search_fields = ['alert__title', 'recipient']
    ordering = ['-created_at']
    readonly_fields = ['created_at', 'updated_at']