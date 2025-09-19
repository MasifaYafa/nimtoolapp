# apps/configuration/serializers.py
"""
Configuration serializers for NIM-Tool API.
Handles configuration templates, backups, and bulk operations.
"""

from rest_framework import serializers
from django.utils import timezone
from datetime import timedelta
from .models import (
    ConfigurationTemplate,
    DeviceConfigurationBackup,
    BackupSchedule,
    BulkOperation,
    BulkOperationResult,
    DeviceConfigurationSession
)


class ConfigurationTemplateSerializer(serializers.ModelSerializer):
    """
    Serializer for configuration templates
    """
    template_type_display = serializers.CharField(source='get_template_type_display', read_only=True)
    commands_list = serializers.SerializerMethodField()
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = ConfigurationTemplate
        fields = [
            'id', 'name', 'description', 'template_type', 'template_type_display',
            'commands', 'commands_list', 'variables', 'is_active',
            'usage_count', 'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'usage_count', 'created_at', 'updated_at']

    def get_commands_list(self, obj):
        """Get commands as a list"""
        return obj.get_commands_list()

    def create(self, validated_data):
        """Create template with current user as creator"""
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)

    def validate_commands(self, value):
        """Validate commands are not empty"""
        if not value or not value.strip():
            raise serializers.ValidationError("Commands cannot be empty")
        return value


class ConfigurationTemplateListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for template listing
    """
    template_type_display = serializers.CharField(source='get_template_type_display', read_only=True)
    commands_preview = serializers.SerializerMethodField()

    class Meta:
        model = ConfigurationTemplate
        fields = [
            'id', 'name', 'description', 'template_type',
            'template_type_display', 'commands_preview', 'usage_count',
            'is_active', 'created_at'
        ]

    def get_commands_preview(self, obj):
        """Get first 3 commands as preview"""
        commands = obj.get_commands_list()
        return commands[:3]


class DeviceConfigurationBackupSerializer(serializers.ModelSerializer):
    """
    Serializer for device configuration backups
    """
    device_name = serializers.CharField(source='device.name', read_only=True)
    device_ip = serializers.CharField(source='device.ip_address', read_only=True)
    backup_type_display = serializers.CharField(source='get_backup_type_display', read_only=True)
    backup_status_display = serializers.CharField(source='get_backup_status_display', read_only=True)
    file_size_display = serializers.CharField(source='get_file_size_display', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = DeviceConfigurationBackup
        fields = [
            'id', 'device', 'device_name', 'device_ip', 'backup_type',
            'backup_type_display', 'backup_status', 'backup_status_display',
            'file_name', 'file_path', 'file_size', 'file_size_display',
            'config_content', 'config_hash', 'created_at', 'completed_at',
            'created_by', 'created_by_username', 'error_message'
        ]
        read_only_fields = [
            'id', 'file_size', 'config_hash', 'created_at',
            'completed_at', 'created_by', 'error_message'
        ]


class DeviceConfigurationBackupListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for backup listing
    """
    device_name = serializers.CharField(source='device.name', read_only=True)
    backup_type_display = serializers.CharField(source='get_backup_type_display', read_only=True)
    backup_status_display = serializers.CharField(source='get_backup_status_display', read_only=True)
    file_size_display = serializers.CharField(source='get_file_size_display', read_only=True)

    class Meta:
        model = DeviceConfigurationBackup
        fields = [
            'id', 'device', 'device_name', 'backup_type', 'backup_type_display',
            'backup_status', 'backup_status_display', 'file_name',
            'file_size_display', 'created_at', 'completed_at'
        ]


class BackupScheduleSerializer(serializers.ModelSerializer):
    """
    Serializer for backup schedules
    """
    frequency_display = serializers.CharField(source='get_frequency_display', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    device_count = serializers.SerializerMethodField()
    device_type_count = serializers.SerializerMethodField()

    class Meta:
        model = BackupSchedule
        fields = [
            'id', 'name', 'devices', 'device_types', 'device_count',
            'device_type_count', 'frequency', 'frequency_display',
            'hour', 'minute', 'day_of_week', 'day_of_month',
            'retention_days', 'compress_files', 'email_notifications',
            'is_active', 'last_run', 'next_run', 'created_by',
            'created_by_username', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'last_run', 'next_run', 'created_at', 'updated_at']

    def get_device_count(self, obj):
        """Get number of devices in schedule"""
        return obj.devices.count()

    def get_device_type_count(self, obj):
        """Get number of device types in schedule"""
        return obj.device_types.count()

    def create(self, validated_data):
        """Create schedule with current user as creator"""
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class BulkOperationResultSerializer(serializers.ModelSerializer):
    """
    Serializer for bulk operation results
    """
    device_name = serializers.CharField(source='device.name', read_only=True)
    device_ip = serializers.CharField(source='device.ip_address', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    duration = serializers.SerializerMethodField()

    class Meta:
        model = BulkOperationResult
        fields = [
            'id', 'device', 'device_name', 'device_ip', 'status',
            'status_display', 'message', 'output', 'duration',
            'started_at', 'completed_at'
        ]
        read_only_fields = ['id', 'started_at', 'completed_at']

    def get_duration(self, obj):
        """Calculate operation duration"""
        if obj.started_at and obj.completed_at:
            delta = obj.completed_at - obj.started_at
            return delta.total_seconds()
        return None


class BulkOperationSerializer(serializers.ModelSerializer):
    """
    Serializer for bulk operations
    """
    operation_type_display = serializers.CharField(source='get_operation_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    template_name = serializers.CharField(source='template.name', read_only=True)
    results = BulkOperationResultSerializer(many=True, read_only=True)
    duration = serializers.SerializerMethodField()
    success_rate = serializers.SerializerMethodField()

    class Meta:
        model = BulkOperation
        fields = [
            'id', 'name', 'operation_type', 'operation_type_display',
            'devices', 'parameters', 'template', 'template_name',
            'status', 'status_display', 'progress_percentage',
            'total_devices', 'successful_devices', 'failed_devices',
            'success_rate', 'duration', 'created_by', 'created_by_username',
            'created_at', 'started_at', 'completed_at', 'error_message',
            'results'
        ]
        read_only_fields = [
            'id', 'status', 'progress_percentage', 'total_devices',
            'successful_devices', 'failed_devices', 'created_at',
            'started_at', 'completed_at', 'error_message'
        ]

    def get_duration(self, obj):
        """Calculate operation duration"""
        if obj.started_at and obj.completed_at:
            delta = obj.completed_at - obj.started_at
            return delta.total_seconds()
        elif obj.started_at:
            delta = timezone.now() - obj.started_at
            return delta.total_seconds()
        return None

    def get_success_rate(self, obj):
        """Calculate success rate percentage"""
        if obj.total_devices > 0:
            return round((obj.successful_devices / obj.total_devices) * 100, 1)
        return 0.0

    def create(self, validated_data):
        """Create bulk operation with current user as creator"""
        devices = validated_data.pop('devices', [])
        validated_data['created_by'] = self.context['request'].user
        validated_data['total_devices'] = len(devices)

        bulk_operation = super().create(validated_data)
        bulk_operation.devices.set(devices)

        return bulk_operation


class BulkOperationListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for bulk operation listing
    """
    operation_type_display = serializers.CharField(source='get_operation_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    success_rate = serializers.SerializerMethodField()

    class Meta:
        model = BulkOperation
        fields = [
            'id', 'name', 'operation_type', 'operation_type_display',
            'status', 'status_display', 'progress_percentage',
            'total_devices', 'successful_devices', 'failed_devices',
            'success_rate', 'created_at', 'started_at', 'completed_at'
        ]

    def get_success_rate(self, obj):
        """Calculate success rate percentage"""
        if obj.total_devices > 0:
            return round((obj.successful_devices / obj.total_devices) * 100, 1)
        return 0.0


class DeviceConfigurationSessionSerializer(serializers.ModelSerializer):
    """
    Serializer for device configuration sessions
    """
    device_name = serializers.CharField(source='device.name', read_only=True)
    device_ip = serializers.CharField(source='device.ip_address', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    template_name = serializers.CharField(source='applied_template.name', read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    time_remaining = serializers.SerializerMethodField()

    class Meta:
        model = DeviceConfigurationSession
        fields = [
            'id', 'device', 'device_name', 'device_ip', 'user',
            'user_username', 'status', 'status_display',
            'configuration_data', 'applied_template', 'template_name',
            'is_expired', 'time_remaining', 'created_at', 'updated_at',
            'expires_at'
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def get_time_remaining(self, obj):
        """Get time remaining in seconds"""
        if obj.is_expired():
            return 0
        delta = obj.expires_at - timezone.now()
        return max(0, int(delta.total_seconds()))

    def create(self, validated_data):
        """Create session with current user and default expiry"""
        validated_data['user'] = self.context['request'].user
        validated_data['expires_at'] = timezone.now() + timedelta(hours=2)
        return super().create(validated_data)


# Bulk operation creation serializers
class ApplyTemplateSerializer(serializers.Serializer):
    """
    Serializer for applying configuration templates to devices
    """
    device_ids = serializers.ListField(
        child=serializers.UUIDField(),
        help_text="List of device IDs to apply template to"
    )
    template_id = serializers.UUIDField(help_text="Configuration template to apply")
    variables = serializers.JSONField(
        required=False,
        default=dict,
        help_text="Template variables override"
    )
    operation_name = serializers.CharField(
        max_length=100,
        required=False,
        help_text="Custom name for the operation"
    )


class CreateBackupSerializer(serializers.Serializer):
    """
    Serializer for creating configuration backups
    """
    device_ids = serializers.ListField(
        child=serializers.UUIDField(),
        help_text="List of device IDs to backup"
    )
    operation_name = serializers.CharField(
        max_length=100,
        required=False,
        help_text="Custom name for the operation"
    )
    compress_files = serializers.BooleanField(
        default=True,
        help_text="Whether to compress backup files"
    )


class FirmwareUpdateSerializer(serializers.Serializer):
    """
    Serializer for firmware update operations
    """
    device_ids = serializers.ListField(
        child=serializers.UUIDField(),
        help_text="List of device IDs to update"
    )
    firmware_file = serializers.CharField(
        help_text="Path to firmware file or firmware version"
    )
    operation_name = serializers.CharField(
        max_length=100,
        required=False,
        help_text="Custom name for the operation"
    )
    backup_before_update = serializers.BooleanField(
        default=True,
        help_text="Create backup before updating"
    )


class SecurityUpdateSerializer(serializers.Serializer):
    """
    Serializer for security update operations
    """
    device_ids = serializers.ListField(
        child=serializers.UUIDField(),
        help_text="List of device IDs to update"
    )
    security_policies = serializers.ListField(
        child=serializers.CharField(),
        help_text="List of security policies to apply"
    )
    operation_name = serializers.CharField(
        max_length=100,
        required=False,
        help_text="Custom name for the operation"
    )


class ConfigurationStatsSerializer(serializers.Serializer):
    """
    Serializer for configuration statistics
    """
    total_templates = serializers.IntegerField()
    active_templates = serializers.IntegerField()
    total_backups = serializers.IntegerField()
    recent_backups = serializers.IntegerField()
    active_operations = serializers.IntegerField()
    completed_operations = serializers.IntegerField()
    scheduled_backups = serializers.IntegerField()
    template_usage = serializers.DictField()