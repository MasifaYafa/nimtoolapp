"""
Django admin configuration for reports app.
"""

from django.contrib import admin
from .models import ReportTemplate, Report, ReportSchedule, ReportDataCache


@admin.register(ReportTemplate)
class ReportTemplateAdmin(admin.ModelAdmin):
    """Admin configuration for ReportTemplate model."""

    list_display = [
        'name', 'category', 'default_format', 'is_active',
        'is_system_template', 'created_by'
    ]
    list_filter = ['category', 'is_active', 'is_system_template', 'default_format']
    search_fields = ['name', 'description']
    ordering = ['category', 'name']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    """Admin configuration for Report model."""

    list_display = [
        'name', 'template', 'format', 'status', 'generated_by',
        'date_range_start', 'date_range_end', 'created_at'
    ]
    list_filter = ['format', 'status', 'template__category', 'created_at']
    search_fields = ['name', 'description']
    ordering = ['-created_at']
    readonly_fields = [
        'id', 'file_path', 'file_size', 'data_points', 'started_at',
        'completed_at', 'error_message', 'created_at', 'updated_at'
    ]

    filter_horizontal = ['specific_devices', 'shared_with']


@admin.register(ReportSchedule)
class ReportScheduleAdmin(admin.ModelAdmin):
    """Admin configuration for ReportSchedule model."""

    list_display = [
        'name', 'template', 'frequency', 'is_active', 'next_run', 'last_run'
    ]
    list_filter = ['frequency', 'is_active', 'template__category']
    search_fields = ['name', 'description']
    ordering = ['next_run']


@admin.register(ReportDataCache)
class ReportDataCacheAdmin(admin.ModelAdmin):
    """Admin configuration for ReportDataCache model."""

    list_display = ['cache_key', 'created_at', 'expires_at', 'access_count']
    list_filter = ['created_at', 'expires_at']
    search_fields = ['cache_key']
    ordering = ['-last_accessed']
    readonly_fields = ['created_at', 'last_accessed']