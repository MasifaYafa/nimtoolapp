# apps/configuration/models.py
"""
Configuration models for NIM-Tool.
Manages device configurations, templates, backups, and bulk operations.
"""

from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.core.validators import validate_comma_separated_integer_list
import uuid
import json

User = get_user_model()


class ConfigurationTemplate(models.Model):
    """
    Configuration templates for different device types
    """

    class TemplateType(models.TextChoices):
        SWITCH = 'switch', 'Switch'
        ROUTER = 'router', 'Router'
        FIREWALL = 'firewall', 'Firewall'
        ACCESS_POINT = 'access_point', 'Access Point'
        ALL = 'all', 'All Devices'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, help_text="Template name")
    description = models.TextField(help_text="Template description")
    template_type = models.CharField(
        max_length=15,
        choices=TemplateType.choices,
        help_text="Device type this template applies to"
    )

    # Configuration commands
    commands = models.TextField(help_text="Configuration commands (one per line)")
    variables = models.JSONField(
        default=dict,
        blank=True,
        help_text="Template variables as JSON (e.g., {'DEVICE_NAME': 'Switch-01'})"
    )

    # Metadata
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='config_templates_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Usage tracking
    usage_count = models.PositiveIntegerField(default=0, help_text="Number of times applied")

    class Meta:
        db_table = 'configuration_templates'
        verbose_name = 'Configuration Template'
        verbose_name_plural = 'Configuration Templates'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_template_type_display()})"

    def get_commands_list(self):
        """Get commands as a list"""
        return [cmd.strip() for cmd in self.commands.split('\n') if cmd.strip()]

    def apply_variables(self, variables=None):
        """Apply variables to template commands"""
        if not variables:
            variables = self.variables

        commands = self.get_commands_list()
        processed_commands = []

        for command in commands:
            for var_name, var_value in variables.items():
                command = command.replace(f"{{{var_name}}}", str(var_value))
            processed_commands.append(command)

        return processed_commands


class DeviceConfigurationBackup(models.Model):
    """
    Enhanced device configuration backups with scheduling and management
    """

    class BackupType(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        AUTOMATIC = 'automatic', 'Automatic'
        SCHEDULED = 'scheduled', 'Scheduled'

    class BackupStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey('devices.Device', on_delete=models.CASCADE, related_name='config_backups')

    # Backup information
    backup_type = models.CharField(max_length=10, choices=BackupType.choices)
    backup_status = models.CharField(max_length=15, choices=BackupStatus.choices, default=BackupStatus.PENDING)

    # File information
    file_name = models.CharField(max_length=255, help_text="Backup file name")
    file_path = models.CharField(max_length=500, help_text="Full path to backup file")
    file_size = models.PositiveIntegerField(default=0, help_text="File size in bytes")

    # Configuration data
    config_content = models.TextField(blank=True, help_text="Configuration content")
    config_hash = models.CharField(max_length=64, help_text="SHA256 hash of configuration")

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='config_backups_created')

    # Error handling
    error_message = models.TextField(blank=True, help_text="Error message if backup failed")

    class Meta:
        db_table = 'device_config_backups'
        verbose_name = 'Device Configuration Backup'
        verbose_name_plural = 'Device Configuration Backups'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.device.name} - {self.file_name}"

    def get_file_size_display(self):
        """Get human-readable file size"""
        size = self.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} TB"


class BackupSchedule(models.Model):
    """
    Automatic backup scheduling for devices
    """

    class Frequency(models.TextChoices):
        DAILY = 'daily', 'Daily'
        WEEKLY = 'weekly', 'Weekly'
        MONTHLY = 'monthly', 'Monthly'
        CUSTOM = 'custom', 'Custom'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, help_text="Schedule name")

    # Device selection
    devices = models.ManyToManyField('devices.Device', related_name='backup_schedules')
    device_types = models.ManyToManyField('devices.DeviceType', blank=True, related_name='backup_schedules')

    # Schedule settings
    frequency = models.CharField(max_length=10, choices=Frequency.choices)
    hour = models.PositiveIntegerField(default=2, help_text="Hour of day (0-23)")
    minute = models.PositiveIntegerField(default=0, help_text="Minute of hour (0-59)")
    day_of_week = models.PositiveIntegerField(null=True, blank=True, help_text="Day of week (0=Monday)")
    day_of_month = models.PositiveIntegerField(null=True, blank=True, help_text="Day of month (1-31)")

    # Storage settings
    retention_days = models.PositiveIntegerField(default=30, help_text="Days to keep backups")
    compress_files = models.BooleanField(default=True)
    email_notifications = models.BooleanField(default=True)

    # Status
    is_active = models.BooleanField(default=True)
    last_run = models.DateTimeField(null=True, blank=True)
    next_run = models.DateTimeField(null=True, blank=True)

    # Metadata
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='backup_schedules_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'backup_schedules'
        verbose_name = 'Backup Schedule'
        verbose_name_plural = 'Backup Schedules'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} - {self.get_frequency_display()}"


class BulkOperation(models.Model):
    """
    Track bulk operations on multiple devices
    """

    class OperationType(models.TextChoices):
        FIRMWARE_UPDATE = 'firmware_update', 'Firmware Update'
        CONFIG_BACKUP = 'config_backup', 'Configuration Backup'
        APPLY_TEMPLATE = 'apply_template', 'Apply Template'
        SECURITY_UPDATE = 'security_update', 'Security Update'
        REBOOT = 'reboot', 'Reboot'
        CUSTOM_COMMAND = 'custom_command', 'Custom Command'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        RUNNING = 'running', 'Running'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'
        CANCELLED = 'cancelled', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, help_text="Operation name")
    operation_type = models.CharField(max_length=20, choices=OperationType.choices)

    # Target devices
    devices = models.ManyToManyField('devices.Device', related_name='bulk_operations')

    # Operation parameters
    parameters = models.JSONField(default=dict, help_text="Operation-specific parameters")
    template = models.ForeignKey(
        ConfigurationTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bulk_operations'
    )

    # Status and progress
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    progress_percentage = models.PositiveIntegerField(default=0)

    # Results tracking
    total_devices = models.PositiveIntegerField(default=0)
    successful_devices = models.PositiveIntegerField(default=0)
    failed_devices = models.PositiveIntegerField(default=0)

    # Metadata
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='bulk_operations_created')
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Error handling
    error_message = models.TextField(blank=True)

    class Meta:
        db_table = 'bulk_operations'
        verbose_name = 'Bulk Operation'
        verbose_name_plural = 'Bulk Operations'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} - {self.get_operation_type_display()}"

    def update_progress(self):
        """Update progress based on operation results"""
        if self.total_devices > 0:
            self.progress_percentage = int(
                ((self.successful_devices + self.failed_devices) / self.total_devices) * 100
            )
        self.save(update_fields=['progress_percentage'])


class BulkOperationResult(models.Model):
    """
    Individual device results for bulk operations
    """

    class ResultStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SUCCESS = 'success', 'Success'
        FAILED = 'failed', 'Failed'
        SKIPPED = 'skipped', 'Skipped'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bulk_operation = models.ForeignKey(BulkOperation, on_delete=models.CASCADE, related_name='results')
    device = models.ForeignKey('devices.Device', on_delete=models.CASCADE)

    # Result information
    status = models.CharField(max_length=10, choices=ResultStatus.choices, default=ResultStatus.PENDING)
    message = models.TextField(blank=True, help_text="Success/error message")
    output = models.TextField(blank=True, help_text="Command output or response")

    # Timing
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'bulk_operation_results'
        verbose_name = 'Bulk Operation Result'
        verbose_name_plural = 'Bulk Operation Results'
        unique_together = ['bulk_operation', 'device']
        ordering = ['device__name']

    def __str__(self):
        return f"{self.bulk_operation.name} - {self.device.name}: {self.get_status_display()}"


class DeviceConfigurationSession(models.Model):
    """
    Track active configuration sessions for devices
    """

    class SessionStatus(models.TextChoices):
        ACTIVE = 'active', 'Active'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'
        ERROR = 'error', 'Error'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey('devices.Device', on_delete=models.CASCADE, related_name='config_sessions')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='config_sessions')

    # Session information
    status = models.CharField(max_length=10, choices=SessionStatus.choices, default=SessionStatus.ACTIVE)
    configuration_data = models.TextField(blank=True, help_text="Current configuration being edited")

    # Applied template
    applied_template = models.ForeignKey(
        ConfigurationTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='config_sessions'
    )

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(help_text="Session expiry time")

    class Meta:
        db_table = 'device_config_sessions'
        verbose_name = 'Device Configuration Session'
        verbose_name_plural = 'Device Configuration Sessions'
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.device.name} - {self.user.username} ({self.get_status_display()})"

    def is_expired(self):
        """Check if session has expired"""
        return timezone.now() > self.expires_at

    def extend_session(self, hours=2):
        """Extend session expiry time"""
        from datetime import timedelta
        self.expires_at = timezone.now() + timedelta(hours=hours)
        self.save(update_fields=['expires_at'])