"""
Action models for NIM-Tool.
Manages device actions, automation, and audit logging.
"""

from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.devices.models import Device
import uuid
import json

User = get_user_model()


class ActionTemplate(models.Model):
    """
    Predefined action templates for common operations.
    """

    class Category(models.TextChoices):
        REBOOT = 'reboot', 'Device Reboot'
        CONFIG = 'config', 'Configuration'
        INTERFACE = 'interface', 'Interface Management'
        SECURITY = 'security', 'Security Actions'
        DIAGNOSTIC = 'diagnostic', 'Diagnostics'
        BACKUP = 'backup', 'Backup Operations'

    name = models.CharField(max_length=100, help_text="Template name")
    description = models.TextField(help_text="What this action does")
    category = models.CharField(max_length=12, choices=Category.choices)

    # Command configuration
    commands = models.JSONField(
        help_text="List of commands to execute",
        default=list
    )
    timeout = models.PositiveIntegerField(
        default=30,
        help_text="Command timeout in seconds"
    )
    requires_enable_mode = models.BooleanField(
        default=False,
        help_text="Whether this action requires enable/privileged mode"
    )

    # Device compatibility
    compatible_device_types = models.ManyToManyField(
        'devices.DeviceType',
        help_text="Device types this template is compatible with"
    )
    vendor_specific = models.CharField(
        max_length=50,
        blank=True,
        help_text="Specific vendor this template is for (empty for all)"
    )

    # Safety and confirmation
    requires_confirmation = models.BooleanField(
        default=True,
        help_text="Require user confirmation before execution"
    )
    is_destructive = models.BooleanField(
        default=False,
        help_text="Mark as potentially destructive action"
    )
    confirmation_message = models.TextField(
        blank=True,
        help_text="Custom confirmation message to show user"
    )

    # Template management
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='action_templates')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'action_templates'
        verbose_name = 'Action Template'
        verbose_name_plural = 'Action Templates'
        ordering = ['category', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"

    def get_commands_display(self):
        """Get formatted command list for display"""
        if isinstance(self.commands, list):
            return '\n'.join(self.commands)
        return str(self.commands)


class DeviceAction(models.Model):
    """
    Record of actions executed on devices.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        RUNNING = 'running', 'Running'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'
        CANCELLED = 'cancelled', 'Cancelled'
        TIMEOUT = 'timeout', 'Timeout'

    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        NORMAL = 'normal', 'Normal'
        HIGH = 'high', 'High'
        URGENT = 'urgent', 'Urgent'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Action identification
    name = models.CharField(max_length=200, help_text="Action description")
    action_type = models.CharField(max_length=50, help_text="Type of action performed")

    # Related objects
    device = models.ForeignKey(
        Device,
        on_delete=models.CASCADE,
        related_name='actions',
        help_text="Target device"
    )
    template = models.ForeignKey(
        ActionTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='executions',
        help_text="Template used (if any)"
    )

    # Execution details
    commands = models.JSONField(help_text="Commands that were/will be executed")
    parameters = models.JSONField(
        default=dict,
        help_text="Parameters passed to the action"
    )

    # Status and timing
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    priority = models.CharField(max_length=6, choices=Priority.choices, default=Priority.NORMAL)

    scheduled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When to execute (null for immediate)"
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    timeout_seconds = models.PositiveIntegerField(default=30)

    # Results
    output = models.TextField(blank=True, help_text="Command output")
    error_message = models.TextField(blank=True, help_text="Error message if failed")
    exit_code = models.IntegerField(null=True, blank=True, help_text="Command exit code")

    # User tracking
    initiated_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='initiated_actions',
        help_text="User who initiated this action"
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='approved_actions',
        help_text="User who approved this action (if approval required)"
    )

    # Audit trail
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'device_actions'
        verbose_name = 'Device Action'
        verbose_name_plural = 'Device Actions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['device', 'status', '-created_at']),
            models.Index(fields=['initiated_by', '-created_at']),
        ]

    def __str__(self):
        return f"{self.name} on {self.device.name} ({self.get_status_display()})"

    def is_pending(self):
        """Check if action is pending execution"""
        return self.status == self.Status.PENDING

    def is_running(self):
        """Check if action is currently running"""
        return self.status == self.Status.RUNNING

    def is_completed(self):
        """Check if action completed successfully"""
        return self.status == self.Status.COMPLETED

    def get_duration(self):
        """Get execution duration"""
        if self.started_at and self.completed_at:
            return self.completed_at - self.started_at
        elif self.started_at:
            return timezone.now() - self.started_at
        return None

    def mark_started(self):
        """Mark action as started"""
        self.status = self.Status.RUNNING
        self.started_at = timezone.now()
        self.save()

    def mark_completed(self, output="", exit_code=0):
        """Mark action as completed"""
        self.status = self.Status.COMPLETED
        self.completed_at = timezone.now()
        self.output = output
        self.exit_code = exit_code
        self.save()

    def mark_failed(self, error_message="", exit_code=1):
        """Mark action as failed"""
        self.status = self.Status.FAILED
        self.completed_at = timezone.now()
        self.error_message = error_message
        self.exit_code = exit_code
        self.save()


class BulkAction(models.Model):
    """
    Manage bulk operations across multiple devices.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        RUNNING = 'running', 'Running'
        COMPLETED = 'completed', 'Completed'
        PARTIAL = 'partial', 'Partially Completed'
        FAILED = 'failed', 'Failed'
        CANCELLED = 'cancelled', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    name = models.CharField(max_length=200, help_text="Bulk operation description")
    description = models.TextField(blank=True)

    # Target devices
    devices = models.ManyToManyField(Device, related_name='bulk_actions')
    device_count = models.PositiveIntegerField(default=0)

    # Operation details
    template = models.ForeignKey(
        ActionTemplate,
        on_delete=models.PROTECT,
        related_name='bulk_executions'
    )
    parameters = models.JSONField(default=dict)

    # Execution control
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    parallel_execution = models.BooleanField(
        default=False,
        help_text="Execute on all devices simultaneously"
    )
    max_parallel = models.PositiveIntegerField(
        default=5,
        help_text="Maximum parallel executions"
    )
    continue_on_failure = models.BooleanField(
        default=True,
        help_text="Continue with remaining devices if one fails"
    )

    # Progress tracking
    completed_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)

    # Timing
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # User tracking
    initiated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='bulk_actions')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bulk_actions'
        verbose_name = 'Bulk Action'
        verbose_name_plural = 'Bulk Actions'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.device_count} devices)"

    def get_progress_percentage(self):
        """Calculate completion percentage"""
        if self.device_count == 0:
            return 0
        return round((self.completed_count + self.failed_count) / self.device_count * 100, 1)

    def get_success_rate(self):
        """Calculate success rate"""
        total_processed = self.completed_count + self.failed_count
        if total_processed == 0:
            return 0
        return round(self.completed_count / total_processed * 100, 1)