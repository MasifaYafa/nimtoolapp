"""
Django admin configuration for actions app.
"""

from django.contrib import admin
from .models import ActionTemplate, DeviceAction, BulkAction


@admin.register(ActionTemplate)
class ActionTemplateAdmin(admin.ModelAdmin):
    """Admin configuration for ActionTemplate model."""

    list_display = [
        'name', 'category', 'vendor_specific', 'requires_confirmation',
        'is_destructive', 'is_active', 'created_by'
    ]
    list_filter = ['category', 'is_active', 'is_destructive', 'requires_confirmation']
    search_fields = ['name', 'description', 'vendor_specific']
    ordering = ['category', 'name']

    filter_horizontal = ['compatible_device_types']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(DeviceAction)
class DeviceActionAdmin(admin.ModelAdmin):
    """Admin configuration for DeviceAction model."""

    list_display = [
        'name', 'device', 'action_type', 'status', 'priority',
        'initiated_by', 'started_at', 'completed_at'
    ]
    list_filter = ['status', 'priority', 'action_type', 'created_at']
    search_fields = ['name', 'device__name', 'action_type']
    ordering = ['-created_at']
    readonly_fields = [
        'id', 'started_at', 'completed_at', 'output', 'error_message',
        'exit_code', 'created_at', 'updated_at'
    ]


@admin.register(BulkAction)
class BulkActionAdmin(admin.ModelAdmin):
    """Admin configuration for BulkAction model."""

    list_display = [
        'name', 'device_count', 'status', 'completed_count',
        'failed_count', 'initiated_by', 'created_at'
    ]
    list_filter = ['status', 'created_at']
    search_fields = ['name', 'description']
    ordering = ['-created_at']
    readonly_fields = [
        'id', 'device_count', 'completed_count', 'failed_count',
        'started_at', 'completed_at', 'created_at', 'updated_at'
    ]

    filter_horizontal = ['devices']