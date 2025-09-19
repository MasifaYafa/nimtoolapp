"""
Django admin configuration for devices app.
"""

from django.contrib import admin
from .models import DeviceType, Device, DeviceMetric, DeviceConfiguration


@admin.register(DeviceType)
class DeviceTypeAdmin(admin.ModelAdmin):
    """Admin configuration for DeviceType model."""

    list_display = ['name', 'description', 'icon', 'device_count', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name', 'description']
    ordering = ['name']

    def device_count(self, obj):
        """Get number of devices of this type."""
        return obj.device_set.count()

    device_count.short_description = 'Device Count'


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    """Admin configuration for Device model."""

    list_display = [
        'name', 'ip_address', 'device_type', 'vendor', 'status',
        'monitoring_enabled', 'last_seen', 'created_by', 'created_at'
    ]
    list_filter = [
        'device_type', 'status', 'vendor', 'monitoring_enabled',
        'protocol', 'created_at'
    ]
    search_fields = ['name', 'ip_address', 'vendor', 'model', 'location']
    ordering = ['name']
    readonly_fields = ['id', 'last_seen', 'uptime', 'response_time', 'created_at', 'updated_at']

    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'description', 'device_type')
        }),
        ('Network Configuration', {
            'fields': ('ip_address', 'mac_address', 'protocol', 'snmp_community', 'snmp_port')
        }),
        ('Device Details', {
            'fields': ('vendor', 'model', 'firmware_version')
        }),
        ('Location', {
            'fields': ('location', 'latitude', 'longitude', 'address')
        }),
        ('Monitoring', {
            'fields': ('monitoring_enabled', 'ping_interval', 'status', 'last_seen', 'response_time')
        }),
        ('Authentication', {
            'fields': ('username', 'password', 'enable_password'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )

    def save_model(self, request, obj, form, change):
        """Set created_by to current user if creating new device."""
        if not change:  # If creating new device
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(DeviceMetric)
class DeviceMetricAdmin(admin.ModelAdmin):
    """Admin configuration for DeviceMetric model."""

    list_display = ['device', 'metric_type', 'value', 'unit', 'timestamp']
    list_filter = ['metric_type', 'timestamp', 'device__device_type']
    search_fields = ['device__name', 'metric_type']
    ordering = ['-timestamp']
    readonly_fields = ['timestamp']

    def has_add_permission(self, request):
        """Metrics are usually added automatically, but allow manual addition."""
        return True


@admin.register(DeviceConfiguration)
class DeviceConfigurationAdmin(admin.ModelAdmin):
    """Admin configuration for DeviceConfiguration model."""

    list_display = [
        'device', 'config_type', 'backup_date', 'backed_up_by',
        'size_display', 'checksum'
    ]
    list_filter = ['config_type', 'backup_date', 'backed_up_by']
    search_fields = ['device__name', 'config_type']
    ordering = ['-backup_date']
    readonly_fields = ['backup_date', 'size', 'checksum']

    def size_display(self, obj):
        """Display file size in human readable format."""
        size = obj.size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} TB"

    size_display.short_description = 'Size'

    def save_model(self, request, obj, form, change):
        """Set backed_up_by to current user if creating new backup."""
        if not change:  # If creating new backup
            obj.backed_up_by = request.user
        super().save_model(request, obj, form, change)