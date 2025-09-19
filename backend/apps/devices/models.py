"""
Device models for NIM-Tool.
Manages network devices, their configurations, and monitoring data.
"""

from django.db import models
from django.core.validators import validate_ipv4_address
from django.contrib.auth import get_user_model
from django.utils import timezone
import uuid

User = get_user_model()


class DeviceType(models.Model):
    """
    Types of network devices (Router, Switch, AP, etc.)
    """
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=10, default='🖥️', help_text="Emoji icon for device type")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'device_types'
        verbose_name = 'Device Type'
        verbose_name_plural = 'Device Types'

    def __str__(self):
        return self.name


class Device(models.Model):
    """
    Network devices being monitored by NIM-Tool.
    """

    class Status(models.TextChoices):
        ONLINE = 'online', 'Online'
        OFFLINE = 'offline', 'Offline'
        WARNING = 'warning', 'Warning'
        UNKNOWN = 'unknown', 'Unknown'
        MAINTENANCE = 'maintenance', 'Maintenance'

    class Protocol(models.TextChoices):
        SNMP_V1 = 'snmp_v1', 'SNMP v1'
        SNMP_V2C = 'snmp_v2c', 'SNMP v2c'
        SNMP_V3 = 'snmp_v3', 'SNMP v3'
        SSH = 'ssh', 'SSH'
        TELNET = 'telnet', 'Telnet'
        HTTP = 'http', 'HTTP'
        HTTPS = 'https', 'HTTPS'

    # Basic Information
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, help_text="Device name or hostname")
    description = models.TextField(blank=True, help_text="Device description")

    # Network Information
    ip_address = models.GenericIPAddressField(
        validators=[validate_ipv4_address],
        help_text="Primary IP address"
    )
    mac_address = models.CharField(
        max_length=17,
        blank=True,
        null=True,
        help_text="MAC address (format: XX:XX:XX:XX:XX:XX)"
    )

    # Device Classification
    device_type = models.ForeignKey(
        DeviceType,
        on_delete=models.PROTECT,
        help_text="Type of network device"
    )
    vendor = models.CharField(max_length=50, blank=True, help_text="Device vendor/brand")
    model = models.CharField(max_length=100, blank=True, help_text="Device model")
    firmware_version = models.CharField(max_length=50, blank=True)

    # Location Information
    location = models.CharField(max_length=200, blank=True, help_text="Physical location")
    latitude = models.DecimalField(
        max_digits=10,
        decimal_places=8,
        blank=True,
        null=True,
        help_text="GPS latitude for mapping"
    )
    longitude = models.DecimalField(
        max_digits=11,
        decimal_places=8,
        blank=True,
        null=True,
        help_text="GPS longitude for mapping"
    )
    address = models.TextField(blank=True, help_text="Physical address")

    # Monitoring Configuration
    protocol = models.CharField(
        max_length=10,
        choices=Protocol.choices,
        default=Protocol.SNMP_V2C,
        help_text="Protocol used for monitoring"
    )
    snmp_community = models.CharField(
        max_length=100,
        default='public',
        help_text="SNMP community string"
    )
    snmp_port = models.PositiveIntegerField(default=161, help_text="SNMP port")
    monitoring_enabled = models.BooleanField(default=True)
    ping_interval = models.PositiveIntegerField(
        default=30,
        help_text="Ping interval in seconds"
    )

    # Authentication (for SSH/Telnet access)
    username = models.CharField(max_length=100, blank=True)
    password = models.CharField(max_length=255, blank=True)  # Should be encrypted
    enable_password = models.CharField(max_length=255, blank=True)  # Should be encrypted

    # Status and Monitoring
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.UNKNOWN
    )
    last_seen = models.DateTimeField(blank=True, null=True)
    uptime = models.DurationField(blank=True, null=True)
    response_time = models.FloatField(
        blank=True,
        null=True,
        help_text="Last ping response time in milliseconds"
    )

    # Metadata
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='devices_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'devices'
        verbose_name = 'Device'
        verbose_name_plural = 'Devices'
        unique_together = ['ip_address']
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.ip_address})"

    def is_online(self):
        """Check if device is currently online"""
        return self.status == self.Status.ONLINE

    def get_uptime_display(self):
        """Get human-readable uptime"""
        if not self.uptime:
            return "Unknown"

        days = self.uptime.days
        seconds = self.uptime.seconds
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60

        if days > 0:
            return f"{days} days, {hours} hours"
        elif hours > 0:
            return f"{hours} hours, {minutes} minutes"
        else:
            return f"{minutes} minutes"


class DeviceMetric(models.Model):
    """
    Store historical metrics for devices (CPU, Memory, etc.)
    """

    class MetricType(models.TextChoices):
        CPU_USAGE = 'cpu_usage', 'CPU Usage'
        MEMORY_USAGE = 'memory_usage', 'Memory Usage'
        BANDWIDTH_IN = 'bandwidth_in', 'Bandwidth In'
        BANDWIDTH_OUT = 'bandwidth_out', 'Bandwidth Out'
        TEMPERATURE = 'temperature', 'Temperature'
        DISK_USAGE = 'disk_usage', 'Disk Usage'
        PING_TIME = 'ping_time', 'Ping Time'

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='metrics')
    metric_type = models.CharField(max_length=15, choices=MetricType.choices)
    value = models.FloatField(help_text="Metric value")
    unit = models.CharField(max_length=20, help_text="Unit of measurement (%, ms, MB/s, etc.)")
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'device_metrics'
        verbose_name = 'Device Metric'
        verbose_name_plural = 'Device Metrics'
        indexes = [
            models.Index(fields=['device', 'metric_type', 'timestamp']),
        ]

    def __str__(self):
        return f"{self.device.name} - {self.get_metric_type_display()}: {self.value}{self.unit}"


class DeviceConfiguration(models.Model):
    """
    Store device configurations and backups
    """
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='configurations')
    config_data = models.TextField(help_text="Configuration content")
    config_type = models.CharField(
        max_length=50,
        default='running_config',
        help_text="Type of configuration (running, startup, etc.)"
    )
    backup_date = models.DateTimeField(auto_now_add=True)
    backed_up_by = models.ForeignKey(User, on_delete=models.PROTECT)
    size = models.PositiveIntegerField(help_text="Configuration size in bytes")
    checksum = models.CharField(max_length=64, help_text="MD5 checksum for integrity")

    class Meta:
        db_table = 'device_configurations'
        verbose_name = 'Device Configuration'
        verbose_name_plural = 'Device Configurations'
        ordering = ['-backup_date']

    def __str__(self):
        return f"{self.device.name} - {self.config_type} ({self.backup_date.strftime('%Y-%m-%d %H:%M')})"