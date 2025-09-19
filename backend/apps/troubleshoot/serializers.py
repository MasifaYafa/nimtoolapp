"""
Troubleshoot serializers for NIM-Tool.
Handles serialization of troubleshooting data for the REST API.
"""

from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import NetworkTest, SystemHealth, CommonIssue, SystemLog, DiagnosticTest

User = get_user_model()


class NetworkTestSerializer(serializers.ModelSerializer):
    """Serializer for NetworkTest model."""

    initiated_by_username = serializers.CharField(source='initiated_by.username', read_only=True)
    test_type_display = serializers.CharField(source='get_test_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    duration = serializers.ReadOnlyField()

    class Meta:
        model = NetworkTest
        fields = [
            'id', 'test_type', 'test_type_display', 'target', 'parameters',
            'status', 'status_display', 'started_at', 'completed_at', 'duration',
            'results', 'success', 'error_message', 'initiated_by', 'initiated_by_username',
            'created_at'
        ]
        read_only_fields = ['id', 'initiated_by', 'created_at', 'started_at', 'completed_at', 'results', 'success', 'error_message']

    def create(self, validated_data):
        validated_data['initiated_by'] = self.context['request'].user
        return super().create(validated_data)


class NetworkTestRequestSerializer(serializers.Serializer):
    """Serializer for network test requests."""

    test_type = serializers.ChoiceField(choices=NetworkTest.TestType.choices)
    target = serializers.CharField(max_length=255)
    parameters = serializers.JSONField(required=False, default=dict)

    def validate_target(self, value):
        """Validate target IP/hostname."""
        if not value.strip():
            raise serializers.ValidationError("Target cannot be empty.")
        return value.strip()

    def validate(self, data):
        """Validate test parameters based on test type."""
        test_type = data['test_type']
        parameters = data.get('parameters', {})

        if test_type == NetworkTest.TestType.PING:
            # Validate ping parameters
            count = parameters.get('count', 4)
            if not isinstance(count, int) or count < 1 or count > 20:
                raise serializers.ValidationError("Ping count must be between 1 and 20.")

        elif test_type == NetworkTest.TestType.PORT_SCAN:
            # Validate port scan parameters
            ports = parameters.get('ports', [])
            if not ports:
                raise serializers.ValidationError("Port scan requires at least one port.")

            # Validate port numbers
            for port in ports:
                try:
                    port_num = int(port)
                    if port_num < 1 or port_num > 65535:
                        raise serializers.ValidationError(f"Invalid port number: {port}")
                except (ValueError, TypeError):
                    raise serializers.ValidationError(f"Invalid port number: {port}")

        elif test_type == NetworkTest.TestType.DNS_LOOKUP:
            # Validate DNS lookup parameters
            record_type = parameters.get('record_type', 'A')
            valid_types = ['A', 'AAAA', 'MX', 'CNAME', 'TXT', 'NS', 'PTR']
            if record_type not in valid_types:
                raise serializers.ValidationError(f"Invalid DNS record type: {record_type}")

        return data


class SystemHealthSerializer(serializers.ModelSerializer):
    """Serializer for SystemHealth model."""

    class Meta:
        model = SystemHealth
        fields = [
            'id', 'cpu_usage', 'memory_usage', 'disk_usage', 'network_usage',
            'network_interfaces', 'system_load', 'processes_count', 'uptime_seconds',
            'timestamp'
        ]
        read_only_fields = ['id', 'timestamp']


class CommonIssueSerializer(serializers.ModelSerializer):
    """Serializer for CommonIssue model."""

    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    resolved_by_username = serializers.CharField(source='resolved_by.username', read_only=True)

    class Meta:
        model = CommonIssue
        fields = [
            'id', 'title', 'description', 'severity', 'severity_display',
            'status', 'status_display', 'affected_devices', 'symptoms',
            'recommended_solution', 'resolution_steps', 'auto_fix_available',
            'first_detected', 'last_seen', 'resolved_at', 'resolved_by', 'resolved_by_username'
        ]
        read_only_fields = ['id', 'first_detected', 'last_seen']


class SystemLogSerializer(serializers.ModelSerializer):
    """Serializer for SystemLog model."""

    level_display = serializers.CharField(source='get_level_display', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)

    class Meta:
        model = SystemLog
        fields = [
            'id', 'timestamp', 'level', 'level_display', 'source', 'source_display',
            'message', 'component', 'device_id', 'user_id', 'tags', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class SystemLogFilterSerializer(serializers.Serializer):
    """Serializer for log filtering requests."""

    level = serializers.ChoiceField(
        choices=SystemLog.LogLevel.choices,
        required=False,
        allow_blank=True
    )
    source = serializers.ChoiceField(
        choices=SystemLog.Source.choices,
        required=False,
        allow_blank=True
    )
    time_range = serializers.ChoiceField(
        choices=['1hour', '24hours', '7days', '30days'],
        required=False,
        default='24hours'
    )
    search = serializers.CharField(required=False, allow_blank=True)
    device_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_time_range(self, value):
        """Validate time range parameter."""
        valid_ranges = ['1hour', '24hours', '7days', '30days']
        if value not in valid_ranges:
            raise serializers.ValidationError(f"Invalid time range. Must be one of: {valid_ranges}")
        return value


class DiagnosticTestSerializer(serializers.ModelSerializer):
    """Serializer for DiagnosticTest model."""

    test_type_display = serializers.CharField(source='get_test_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    initiated_by_username = serializers.CharField(source='initiated_by.username', read_only=True)
    duration = serializers.SerializerMethodField()

    class Meta:
        model = DiagnosticTest
        fields = [
            'id', 'test_type', 'test_type_display', 'status', 'status_display',
            'started_at', 'completed_at', 'duration', 'results', 'score',
            'issues_found', 'recommendations', 'initiated_by', 'initiated_by_username'
        ]
        read_only_fields = ['id', 'initiated_by', 'started_at', 'completed_at', 'results', 'score', 'issues_found', 'recommendations']

    def get_duration(self, obj):
        """Get test duration in seconds."""
        if obj.started_at and obj.completed_at:
            return (obj.completed_at - obj.started_at).total_seconds()
        return None

    def create(self, validated_data):
        validated_data['initiated_by'] = self.context['request'].user
        return super().create(validated_data)


class DiagnosticTestRequestSerializer(serializers.Serializer):
    """Serializer for diagnostic test requests."""

    test_type = serializers.ChoiceField(choices=DiagnosticTest.TestType.choices)
    parameters = serializers.JSONField(required=False, default=dict)

    def validate_test_type(self, value):
        """Validate test type."""
        if value not in DiagnosticTest.TestType.values:
            raise serializers.ValidationError("Invalid test type.")
        return value


class PingResultSerializer(serializers.Serializer):
    """Serializer for ping test results."""

    target = serializers.CharField()
    packets_sent = serializers.IntegerField()
    packets_received = serializers.IntegerField()
    packet_loss = serializers.FloatField()
    avg_time = serializers.FloatField()
    min_time = serializers.FloatField()
    max_time = serializers.FloatField()
    ping_results = serializers.ListField(child=serializers.CharField())


class TracerouteResultSerializer(serializers.Serializer):
    """Serializer for traceroute test results."""

    target = serializers.CharField()
    hops = serializers.ListField(child=serializers.DictField())
    max_hops = serializers.IntegerField()
    total_time = serializers.FloatField()


class PortScanResultSerializer(serializers.Serializer):
    """Serializer for port scan results."""

    target = serializers.CharField()
    ports_scanned = serializers.ListField(child=serializers.IntegerField())
    open_ports = serializers.ListField(child=serializers.DictField())
    closed_ports = serializers.ListField(child=serializers.IntegerField())
    scan_time = serializers.FloatField()


class DNSLookupResultSerializer(serializers.Serializer):
    """Serializer for DNS lookup results."""

    target = serializers.CharField()
    record_type = serializers.CharField()
    records = serializers.ListField(child=serializers.DictField())
    query_time = serializers.FloatField()


class TroubleshootStatsSerializer(serializers.Serializer):
    """Serializer for troubleshoot statistics."""

    total_tests = serializers.IntegerField()
    tests_today = serializers.IntegerField()
    active_issues = serializers.IntegerField()
    resolved_issues = serializers.IntegerField()
    system_health_score = serializers.IntegerField()

    # Test type breakdown
    ping_tests = serializers.IntegerField()
    traceroute_tests = serializers.IntegerField()
    port_scan_tests = serializers.IntegerField()
    dns_tests = serializers.IntegerField()

    # Recent activity
    recent_tests = serializers.ListField(child=serializers.DictField())
    recent_issues = serializers.ListField(child=serializers.DictField())