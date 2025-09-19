"""
Reports models for NIM-Tool.
Manages report generation, scheduling, and data analysis.
"""

from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.devices.models import Device
import uuid
import json

User = get_user_model()


class ReportTemplate(models.Model):
    """
    Predefined report templates for common reporting needs.
    """

    class Category(models.TextChoices):
        UPTIME = 'uptime', 'Uptime Reports'
        PERFORMANCE = 'performance', 'Performance Reports'
        BANDWIDTH = 'bandwidth', 'Bandwidth Reports'
        SECURITY = 'security', 'Security Reports'
        INVENTORY = 'inventory', 'Inventory Reports'
        ALERTS = 'alerts', 'Alert Reports'
        CUSTOM = 'custom', 'Custom Reports'

    class Format(models.TextChoices):
        PDF = 'pdf', 'PDF'
        CSV = 'csv', 'CSV'
        EXCEL = 'excel', 'Excel'
        JSON = 'json', 'JSON'
        HTML = 'html', 'HTML'

    name = models.CharField(max_length=100, help_text="Template name")
    description = models.TextField(help_text="What this report contains")
    category = models.CharField(max_length=12, choices=Category.choices)

    # Report configuration
    data_sources = models.JSONField(
        help_text="Data sources and queries for this report",
        default=list
    )
    filters = models.JSONField(
        help_text="Default filters for this report",
        default=dict
    )
    grouping = models.JSONField(
        help_text="How to group the data",
        default=dict
    )
    sorting = models.JSONField(
        help_text="Default sorting configuration",
        default=dict
    )

    # Output configuration
    supported_formats = models.JSONField(
        help_text="List of supported output formats",
        default=list
    )
    default_format = models.CharField(
        max_length=10,
        choices=Format.choices,
        default=Format.PDF
    )

    # Chart and visualization settings
    include_charts = models.BooleanField(default=True)
    chart_types = models.JSONField(
        help_text="Types of charts to include",
        default=list
    )

    # Template management
    is_active = models.BooleanField(default=True)
    is_system_template = models.BooleanField(
        default=False,
        help_text="System templates cannot be deleted"
    )

    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='report_templates')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'report_templates'
        verbose_name = 'Report Template'
        verbose_name_plural = 'Report Templates'
        ordering = ['category', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"


class Report(models.Model):
    """
    Generated reports with data and metadata.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        GENERATING = 'generating', 'Generating'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'
        EXPIRED = 'expired', 'Expired'

    class Format(models.TextChoices):
        PDF = 'pdf', 'PDF'
        CSV = 'csv', 'CSV'
        EXCEL = 'excel', 'Excel'
        JSON = 'json', 'JSON'
        HTML = 'html', 'HTML'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Report identification
    name = models.CharField(max_length=200, help_text="Report name")
    description = models.TextField(blank=True)

    # Template and configuration
    template = models.ForeignKey(
        ReportTemplate,
        on_delete=models.PROTECT,
        related_name='generated_reports'
    )
    format = models.CharField(max_length=10, choices=Format.choices)

    # Report parameters
    date_range_start = models.DateTimeField(help_text="Start of data range")
    date_range_end = models.DateTimeField(help_text="End of data range")
    filters = models.JSONField(
        default=dict,
        help_text="Filters applied to this report"
    )
    parameters = models.JSONField(
        default=dict,
        help_text="Additional parameters used in generation"
    )

    # Scope
    include_all_devices = models.BooleanField(default=True)
    specific_devices = models.ManyToManyField(
        Device,
        blank=True,
        help_text="Specific devices included in report"
    )

    # Generation status
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)

    # File and data
    file_path = models.CharField(
        max_length=500,
        blank=True,
        help_text="Path to generated report file"
    )
    file_size = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="File size in bytes"
    )
    data_points = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of data points processed"
    )

    # Timing
    scheduled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When report was scheduled to generate"
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this report file expires"
    )

    # Error handling
    error_message = models.TextField(blank=True)
    retry_count = models.PositiveIntegerField(default=0)

    # User tracking
    generated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='reports')
    shared_with = models.ManyToManyField(
        User,
        blank=True,
        related_name='shared_reports',
        help_text="Users who have access to this report"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reports'
        verbose_name = 'Report'
        verbose_name_plural = 'Reports'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['generated_by', 'status', '-created_at']),
            models.Index(fields=['template', '-created_at']),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"

    def is_completed(self):
        """Check if report generation is completed"""
        return self.status == self.Status.COMPLETED

    def is_expired(self):
        """Check if report has expired"""
        return self.expires_at and timezone.now() > self.expires_at

    def get_duration(self):
        """Get generation duration"""
        if self.started_at and self.completed_at:
            return self.completed_at - self.started_at
        return None

    def get_file_size_display(self):
        """Get human-readable file size"""
        if not self.file_size:
            return "Unknown"

        size = self.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} TB"


class ReportSchedule(models.Model):
    """
    Scheduled recurring reports.
    """

    class Frequency(models.TextChoices):
        HOURLY = 'hourly', 'Hourly'
        DAILY = 'daily', 'Daily'
        WEEKLY = 'weekly', 'Weekly'
        MONTHLY = 'monthly', 'Monthly'
        QUARTERLY = 'quarterly', 'Quarterly'
        YEARLY = 'yearly', 'Yearly'

    name = models.CharField(max_length=100, help_text="Schedule name")
    description = models.TextField(blank=True)

    # Template and configuration
    template = models.ForeignKey(
        ReportTemplate,
        on_delete=models.CASCADE,
        related_name='schedules'
    )
    format = models.CharField(max_length=10, choices=Report.Format.choices)

    # Schedule configuration
    frequency = models.CharField(max_length=12, choices=Frequency.choices)
    hour = models.PositiveIntegerField(
        default=9,
        help_text="Hour to run (0-23)"
    )
    day_of_week = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Day of week for weekly reports (0=Monday, 6=Sunday)"
    )
    day_of_month = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Day of month for monthly reports (1-31)"
    )

    # Report parameters
    data_retention_days = models.PositiveIntegerField(
        default=7,
        help_text="How many days of data to include"
    )
    filters = models.JSONField(default=dict)
    parameters = models.JSONField(default=dict)

    # Delivery settings
    email_recipients = models.TextField(
        blank=True,
        help_text="Comma-separated email addresses"
    )
    auto_email = models.BooleanField(
        default=False,
        help_text="Automatically email when report is generated"
    )

    # Schedule status
    is_active = models.BooleanField(default=True)
    next_run = models.DateTimeField(help_text="When this schedule will next run")
    last_run = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='report_schedules')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'report_schedules'
        verbose_name = 'Report Schedule'
        verbose_name_plural = 'Report Schedules'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_frequency_display()})"


class ReportDataCache(models.Model):
    """
    Cache frequently requested report data to improve performance.
    """
    cache_key = models.CharField(max_length=255, unique=True)
    data = models.JSONField(help_text="Cached data")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(help_text="When this cache entry expires")
    access_count = models.PositiveIntegerField(default=0)
    last_accessed = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'report_data_cache'
        verbose_name = 'Report Data Cache'
        verbose_name_plural = 'Report Data Cache'
        indexes = [
            models.Index(fields=['cache_key', 'expires_at']),
        ]

    def __str__(self):
        return f"Cache: {self.cache_key}"

    def is_expired(self):
        """Check if cache entry has expired"""
        return timezone.now() > self.expires_at