# apps/configuration/admin.py
"""
Django admin configuration for Configuration Management app.
Provides admin interfaces for managing configuration templates and backups.
"""

from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe
from .models import ConfigurationTemplate, DeviceConfigurationBackup


@admin.register(ConfigurationTemplate)
class ConfigurationTemplateAdmin(admin.ModelAdmin):
    """
    Admin interface for Configuration Templates
    """
    list_display = [
        'name', 'template_type', 'is_active', 'usage_count',
        'created_by', 'created_at'
    ]
    list_filter = ['template_type', 'is_active', 'created_at', 'created_by']
    search_fields = ['name', 'description', 'commands']
    readonly_fields = ['usage_count', 'created_by', 'created_at', 'updated_at']

    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'description', 'template_type', 'is_active')
        }),
        ('Configuration Commands', {
            'fields': ('commands',),
            'classes': ('wide',),
            'description': 'Enter configuration commands, one per line. Use {VARIABLE_NAME} for variables.'
        }),
        ('Usage Statistics', {
            'fields': ('usage_count',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )

    def save_model(self, request, obj, form, change):
        """Set created_by to current user when creating new template"""
        if not change:  # Creating new template
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def get_queryset(self, request):
        """Optimize queryset with select_related"""
        return super().get_queryset(request).select_related('created_by')


@admin.register(DeviceConfigurationBackup)
class DeviceConfigurationBackupAdmin(admin.ModelAdmin):
    """
    Admin interface for Device Configuration Backups
    """
    list_display = [
        'device', 'file_name', 'backup_type', 'file_size_display',
        'created_at', 'created_by'
    ]
    list_filter = ['backup_type', 'created_at', 'created_by', 'device__device_type']
    search_fields = ['device__name', 'file_name', 'device__ip_address']
    readonly_fields = [
        'file_size', 'created_at', 'created_by', 'file_size_display'
    ]

    fieldsets = (
        ('Backup Information', {
            'fields': ('device', 'backup_type', 'file_name')
        }),
        ('File Details', {
            'fields': ('file_size', 'file_size_display'),
            'description': 'File size information'
        }),
        ('Configuration Data', {
            'fields': ('config_content',),
            'classes': ('collapse',),
            'description': 'Actual configuration content - click to expand'
        }),
        ('Metadata', {
            'fields': ('created_at', 'created_by'),
            'classes': ('collapse',)
        })
    )

    def file_size_display(self, obj):
        """Display file size in human readable format"""
        if obj.file_size:
            return self.format_file_size(obj.file_size)
        return "Unknown"

    file_size_display.short_description = "File Size"

    def format_file_size(self, bytes_size):
        """Format file size in human readable format"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes_size < 1024.0:
                return f"{bytes_size:.1f} {unit}"
            bytes_size /= 1024.0
        return f"{bytes_size:.1f} TB"

    def save_model(self, request, obj, form, change):
        """Set created_by to current user when creating new backup"""
        if not change:  # Creating new backup
            obj.created_by = request.user
            # Calculate file size if not set
            if not obj.file_size and obj.config_content:
                obj.file_size = len(obj.config_content.encode('utf-8'))
        super().save_model(request, obj, form, change)

    def get_queryset(self, request):
        """Optimize queryset with select_related"""
        return super().get_queryset(request).select_related('device', 'created_by')

    def device_link(self, obj):
        """Create clickable link to device admin page"""
        if obj.device:
            url = reverse('admin:devices_device_change', args=[obj.device.pk])
            return format_html('<a href="{}">{}</a>', url, obj.device.name)
        return "No Device"

    device_link.short_description = "Device"
    device_link.admin_order_field = "device__name"


# Custom admin site configuration
admin.site.site_header = "NIM-Tool Configuration Admin"
admin.site.site_title = "NIM-Tool Configuration"
admin.site.index_title = "Configuration Management"