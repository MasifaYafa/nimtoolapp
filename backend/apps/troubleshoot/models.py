"""
Troubleshoot models for NIM-Tool.
Handles network troubleshooting, system diagnostics, and log analysis.
"""

from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
import uuid
import json

User = get_user_model()


class NetworkTest(models.Model):
    """
    Store results of network tests (ping, traceroute, port scan, DNS lookup).
    """

    class TestType(models.TextChoices):
        PING = 'ping', 'Ping Test'
        TRACEROUTE = 'traceroute', 'Traceroute'
        PORT_SCAN = 'port_scan', 'Port Scan'
        DNS_LOOKUP = 'dns_lookup', 'DNS Lookup'
        SPEED_TEST = 'speed_test', 'Speed Test'
        CONNECTIVITY = 'connectivity', 'Connectivity Test'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        RUNNING = 'running', 'Running'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    test_type = models.CharField(max_length=20, choices=TestType.choices)
    target = models.CharField(max_length=255, help_text="Target IP/hostname")
    parameters = models.JSONField(default=dict, help_text="Test parameters (ports, count, etc.)")

    # Test execution
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Results
    results = models.JSONField(default=dict, help_text="Test results data")
    success = models.BooleanField(default=False)
    error_message = models.TextField(blank=True)

    # Metadata
    initiated_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='network_tests')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'network_tests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['test_type', 'status']),
            models.Index(fields=['initiated_by', '-created_at']),
        ]

    def __str__(self):
        return f"{self.get_test_type_display()} - {self.target} ({self.status})"

    @property
    def duration(self):
        """Get test duration in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


class SystemHealth(models.Model):
    """
    Store system health metrics over time.
    """

    # System metrics
    cpu_usage = models.FloatField(help_text="CPU usage percentage")
    memory_usage = models.FloatField(help_text="Memory usage percentage")
    disk_usage = models.FloatField(help_text="Disk usage percentage")
    network_usage = models.FloatField(help_text="Network usage percentage")

    # Network interfaces data
    network_interfaces = models.JSONField(default=list, help_text="Network interfaces status")

    # System info
    system_load = models.JSONField(default=dict, help_text="System load averages")
    processes_count = models.IntegerField(default=0)
    uptime_seconds = models.BigIntegerField(default=0)

    # Timestamps
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'system_health'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['-timestamp']),
        ]

    def __str__(self):
        return f"System Health - {self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}"


class CommonIssue(models.Model):
    """
    Store detected common network issues and their resolutions.
    """

    class Severity(models.TextChoices):
        INFO = 'info', 'Info'
        WARNING = 'warning', 'Warning'
        CRITICAL = 'critical', 'Critical'

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        RESOLVED = 'resolved', 'Resolved'
        IGNORED = 'ignored', 'Ignored'

    title = models.CharField(max_length=200)
    description = models.TextField()
    severity = models.CharField(max_length=20, choices=Severity.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    # Issue details
    affected_devices = models.JSONField(default=list, help_text="List of affected device IDs")
    symptoms = models.JSONField(default=list, help_text="List of symptoms detected")

    # Resolution
    recommended_solution = models.TextField()
    resolution_steps = models.JSONField(default=list, help_text="Step-by-step resolution")
    auto_fix_available = models.BooleanField(default=False)

    # Tracking
    first_detected = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'common_issues'
        ordering = ['-first_detected']
        indexes = [
            models.Index(fields=['severity', 'status']),
            models.Index(fields=['-first_detected']),
        ]

    def __str__(self):
        return f"{self.title} ({self.get_severity_display()})"


class SystemLog(models.Model):
    """
    Store and categorize system logs for analysis.
    """

    class LogLevel(models.TextChoices):
        DEBUG = 'debug', 'Debug'
        INFO = 'info', 'Info'
        WARNING = 'warning', 'Warning'
        ERROR = 'error', 'Error'
        CRITICAL = 'critical', 'Critical'

    class Source(models.TextChoices):
        SYSTEM = 'system', 'System'
        NETWORK = 'network', 'Network'
        APPLICATION = 'application', 'Application'
        SECURITY = 'security', 'Security'
        DEVICE = 'device', 'Device'

    timestamp = models.DateTimeField()
    level = models.CharField(max_length=20, choices=LogLevel.choices)
    source = models.CharField(max_length=20, choices=Source.choices)
    message = models.TextField()

    # Additional context
    component = models.CharField(max_length=100, blank=True, help_text="System component")
    device_id = models.IntegerField(null=True, blank=True, help_text="Related device ID")
    user_id = models.IntegerField(null=True, blank=True, help_text="Related user ID")

    # Metadata
    raw_log = models.TextField(blank=True, help_text="Original raw log entry")
    tags = models.JSONField(default=list, help_text="Log tags for categorization")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'system_logs'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['level', '-timestamp']),
            models.Index(fields=['source', '-timestamp']),
            models.Index(fields=['device_id', '-timestamp']),
        ]

    def __str__(self):
        return f"{self.level.upper()} - {self.message[:50]}..."


class DiagnosticTest(models.Model):
    """
    Store results of system diagnostic tests.
    """

    class TestType(models.TextChoices):
        CONNECTIVITY = 'connectivity', 'Internet Connectivity'
        SPEED = 'speed', 'Network Speed'
        SECURITY = 'security', 'Security Scan'
        PERFORMANCE = 'performance', 'Performance Analysis'
        HEALTH_CHECK = 'health_check', 'Health Check'

    class Status(models.TextChoices):
        RUNNING = 'running', 'Running'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    test_type = models.CharField(max_length=20, choices=TestType.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING)

    # Test execution
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Results
    results = models.JSONField(default=dict, help_text="Diagnostic results")
    score = models.IntegerField(null=True, blank=True, help_text="Overall score (0-100)")
    issues_found = models.JSONField(default=list, help_text="Issues discovered")
    recommendations = models.JSONField(default=list, help_text="Recommended actions")

    # Metadata
    initiated_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='diagnostic_tests')

    class Meta:
        db_table = 'diagnostic_tests'
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.get_test_type_display()} - {self.status}"
