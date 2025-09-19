"""
Alert serializers for NIM-Tool API.
Handles alert rules, alerts, and notifications with enhanced frontend compatibility.
"""

from rest_framework import serializers
from django.utils import timezone
from datetime import timedelta
from .models import AlertRule, Alert, AlertNotification
from apps.devices.models import Device


class AlertRuleSerializer(serializers.ModelSerializer):
    """
    Serializer for alert rules.
    """
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    device_count = serializers.SerializerMethodField()
    triggered_alerts_count = serializers.SerializerMethodField()
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)

    class Meta:
        model = AlertRule
        fields = [
            'id', 'name', 'description', 'metric_type', 'condition', 'condition_display',
            'threshold_value', 'severity', 'severity_display', 'message_template',
            'is_active', 'applies_to_all_devices', 'specific_devices',
            'send_email', 'send_sms', 'email_recipients',
            'check_interval', 'cooldown_period', 'created_by',
            'created_by_username', 'created_at', 'updated_at',
            'device_count', 'triggered_alerts_count'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_device_count(self, obj):
        """Get number of devices this rule applies to."""
        if obj.applies_to_all_devices:
            return Device.objects.count()
        return obj.specific_devices.count()

    def get_triggered_alerts_count(self, obj):
        """Get count of alerts triggered by this rule in last 30 days."""
        cutoff_date = timezone.now() - timedelta(days=30)
        return obj.triggered_alerts.filter(first_occurred__gte=cutoff_date).count()

    def create(self, validated_data):
        """Set created_by to current user."""
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)

    def validate_threshold_value(self, value):
        """Validate threshold value based on metric type."""
        if value < 0:
            raise serializers.ValidationError("Threshold value cannot be negative")
        return value

    def validate_email_recipients(self, value):
        """Validate email recipients format."""
        if value:
            emails = [email.strip() for email in value.split(',')]
            for email in emails:
                if email and '@' not in email:
                    raise serializers.ValidationError(f"Invalid email format: {email}")
        return value


class AlertListSerializer(serializers.ModelSerializer):
    """
    Serializer for alert list view (optimized for performance).
    """
    device_name = serializers.CharField(source='device.name', read_only=True)
    device_ip = serializers.CharField(source='device.ip_address', read_only=True)
    device_type = serializers.CharField(source='device.device_type.name', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    duration = serializers.SerializerMethodField()
    time_ago = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    alert_icon = serializers.SerializerMethodField()
    severity_color = serializers.SerializerMethodField()

    class Meta:
        model = Alert
        fields = [
            'id', 'title', 'message', 'severity', 'severity_display', 'severity_color',
            'status', 'status_display', 'device', 'device_name',
            'device_ip', 'device_type', 'first_occurred', 'last_occurred',
            'occurrence_count', 'duration', 'time_ago', 'acknowledged_by',
            'resolved_by', 'is_active', 'alert_icon', 'current_value',
            'threshold_value', 'metric_name'
        ]

    def get_duration(self, obj):
        """Get alert duration in human readable format."""
        duration = obj.get_duration()
        if not duration:
            return None

        total_seconds = int(duration.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60

        if hours >= 24:
            days = hours // 24
            remaining_hours = hours % 24
            return f"{days}d {remaining_hours}h"
        elif hours > 0:
            return f"{hours}h {minutes}m"
        elif minutes > 0:
            return f"{minutes}m"
        else:
            return "< 1m"

    def get_time_ago(self, obj):
        """Get time since alert was first triggered."""
        now = timezone.now()
        diff = now - obj.first_occurred

        total_seconds = int(diff.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60

        if hours >= 24:
            days = hours // 24
            return f"{days} day{'s' if days != 1 else ''} ago"
        elif hours > 0:
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        elif minutes > 0:
            return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        else:
            return "Just now"

    def get_is_active(self, obj):
        """Check if alert is currently active."""
        return obj.status == Alert.Status.ACTIVE

    def get_alert_icon(self, obj):
        """Get appropriate icon for alert severity."""
        icons = {
            'critical': '🚨',
            'warning': '⚠️',
            'info': 'ℹ️'
        }
        return icons.get(obj.severity, '📢')

    def get_severity_color(self, obj):
        """Get color class for alert severity."""
        colors = {
            'critical': 'critical',
            'warning': 'warning',
            'info': 'info'
        }
        return colors.get(obj.severity, 'default')


class AlertDetailSerializer(serializers.ModelSerializer):
    """
    Serializer for detailed alert view.
    """
    device_name = serializers.CharField(source='device.name', read_only=True)
    device_ip = serializers.CharField(source='device.ip_address', read_only=True)
    device_type = serializers.CharField(source='device.device_type.name', read_only=True)
    device_vendor = serializers.CharField(source='device.vendor', read_only=True)
    device_location = serializers.CharField(source='device.location', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    acknowledged_by_username = serializers.CharField(source='acknowledged_by.username', read_only=True)
    resolved_by_username = serializers.CharField(source='resolved_by.username', read_only=True)
    alert_rule_name = serializers.CharField(source='alert_rule.name', read_only=True)
    duration = serializers.SerializerMethodField()
    time_ago = serializers.SerializerMethodField()
    # FIX: do not use source='is_active' when field name is identical
    is_active = serializers.BooleanField(read_only=True)
    can_acknowledge = serializers.SerializerMethodField()
    can_resolve = serializers.SerializerMethodField()
    alert_icon = serializers.SerializerMethodField()
    severity_color = serializers.SerializerMethodField()

    class Meta:
        model = Alert
        fields = [
            'id', 'title', 'message', 'severity', 'severity_display', 'severity_color',
            'status', 'status_display', 'device', 'device_name',
            'device_ip', 'device_type', 'device_vendor', 'device_location',
            'alert_rule', 'alert_rule_name', 'metric_name', 'current_value',
            'threshold_value', 'first_occurred', 'last_occurred', 'occurrence_count',
            'acknowledged_at', 'acknowledged_by', 'acknowledged_by_username',
            'acknowledgment_note', 'resolved_at', 'resolved_by',
            'resolved_by_username', 'resolution_note', 'email_sent',
            'sms_sent', 'notification_count', 'duration', 'time_ago',
            'is_active', 'can_acknowledge', 'can_resolve', 'alert_icon'
        ]
        read_only_fields = [
            'id', 'first_occurred', 'last_occurred', 'occurrence_count',
            'acknowledged_at', 'resolved_at', 'email_sent', 'sms_sent',
            'notification_count'
        ]

    def get_duration(self, obj):
        """Get alert duration in detailed format."""
        duration = obj.get_duration()
        if not duration:
            return None

        total_seconds = int(duration.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60

        if hours >= 24:
            days = hours // 24
            remaining_hours = hours % 24
            return f"{days} days, {remaining_hours} hours, {minutes} minutes"
        elif hours > 0:
            return f"{hours} hours, {minutes} minutes"
        elif minutes > 0:
            return f"{minutes} minutes, {seconds} seconds"
        else:
            return f"{seconds} seconds"

    def get_time_ago(self, obj):
        """Get detailed time since alert occurred."""
        return AlertListSerializer().get_time_ago(obj)

    def get_can_acknowledge(self, obj):
        """Check if current user can acknowledge this alert."""
        return obj.status == Alert.Status.ACTIVE

    def get_can_resolve(self, obj):
        """Check if current user can resolve this alert."""
        return obj.status in [Alert.Status.ACTIVE, Alert.Status.ACKNOWLEDGED]

    def get_alert_icon(self, obj):
        """Get appropriate icon for alert severity."""
        return AlertListSerializer().get_alert_icon(obj)

    def get_severity_color(self, obj):
        """Get color class for alert severity."""
        return AlertListSerializer().get_severity_color(obj)


class AlertAcknowledgeSerializer(serializers.Serializer):
    """
    Serializer for acknowledging alerts.
    """
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate_note(self, value):
        """Validate acknowledgment note."""
        if value and len(value.strip()) < 3:
            raise serializers.ValidationError("Note must be at least 3 characters long if provided")
        return value.strip() if value else value


class AlertResolveSerializer(serializers.Serializer):
    """
    Serializer for resolving alerts.
    """
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate_note(self, value):
        """Validate resolution note."""
        if value and len(value.strip()) < 3:
            raise serializers.ValidationError("Note must be at least 3 characters long if provided")
        return value.strip() if value else value


class AlertBulkActionSerializer(serializers.Serializer):
    """
    Serializer for bulk alert actions.
    """
    alert_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        max_length=100,
        help_text="List of alert IDs to perform action on"
    )
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate_alert_ids(self, value):
        """Validate that alert IDs exist and are accessible."""
        existing_alerts = Alert.objects.filter(id__in=value).count()
        if existing_alerts != len(value):
            raise serializers.ValidationError("One or more alert IDs are invalid")
        return value


class AlertNotificationSerializer(serializers.ModelSerializer):
    """
    Serializer for alert notifications.
    """
    alert_title = serializers.CharField(source='alert.title', read_only=True)
    alert_device_name = serializers.CharField(source='alert.device.name', read_only=True)
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    retry_in = serializers.SerializerMethodField()

    class Meta:
        model = AlertNotification
        fields = [
            'id', 'alert', 'alert_title', 'alert_device_name', 'type', 'type_display',
            'recipient', 'status', 'status_display', 'attempts',
            'max_attempts', 'last_attempt', 'next_retry', 'retry_in',
            'response_code', 'response_message', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_retry_in(self, obj):
        """Get time until next retry attempt."""
        if not obj.next_retry or obj.status != AlertNotification.Status.RETRY:
            return None

        now = timezone.now()
        if obj.next_retry <= now:
            return "Ready to retry"

        diff = obj.next_retry - now
        minutes = int(diff.total_seconds() / 60)

        if minutes >= 60:
            hours = minutes // 60
            return f"In {hours} hour{'s' if hours != 1 else ''}"
        elif minutes > 0:
            return f"In {minutes} minute{'s' if minutes != 1 else ''}"
        else:
            return "In less than 1 minute"


class AlertStatsSerializer(serializers.Serializer):
    """
    Enhanced serializer for alert statistics dashboard.
    """
    total_alerts = serializers.IntegerField()
    active_alerts = serializers.IntegerField()
    critical_alerts = serializers.IntegerField()
    warning_alerts = serializers.IntegerField()
    info_alerts = serializers.IntegerField()
    acknowledged_alerts = serializers.IntegerField()
    resolved_alerts = serializers.IntegerField()
    unacknowledged_alerts = serializers.IntegerField()
    alerts_by_device = serializers.DictField()
    alerts_by_type = serializers.DictField()
    alerts_by_hour = serializers.ListField()
    avg_resolution_time = serializers.FloatField()
    avg_acknowledgment_time = serializers.FloatField()
    top_alerting_devices = serializers.ListField()
    recent_critical_count = serializers.IntegerField()
    trend_direction = serializers.CharField()


class AlertCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating new alerts (typically from monitoring system).
    """
    device_name = serializers.CharField(write_only=True, required=False)
    device_ip = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Alert
        fields = [
            'title', 'message', 'severity', 'device', 'device_name', 'device_ip',
            'alert_rule', 'metric_name', 'current_value', 'threshold_value'
        ]

    def validate(self, data):
        """Validate alert creation data."""
        # Ensure either device ID or device identifier is provided
        if not data.get('device') and not (data.get('device_name') or data.get('device_ip')):
            raise serializers.ValidationError(
                "Either device ID or device name/IP must be provided"
            )
        return data

    def create(self, validated_data):
        """Create alert with device lookup if needed."""
        device_name = validated_data.pop('device_name', None)
        device_ip = validated_data.pop('device_ip', None)

        # If device not provided, try to find by name or IP
        if not validated_data.get('device'):
            device_query = Device.objects.all()
            if device_name:
                device_query = device_query.filter(name=device_name)
            elif device_ip:
                device_query = device_query.filter(ip_address=device_ip)

            device = device_query.first()
            if not device:
                raise serializers.ValidationError("Device not found")

            validated_data['device'] = device

        return super().create(validated_data)
