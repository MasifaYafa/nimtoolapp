"""
Device serializers for NIM-Tool API.
Handles device CRUD operations, metrics, and configurations.
"""

from django.utils import timezone
from datetime import timedelta


from rest_framework import serializers
from django.core.validators import validate_ipv4_address
from django.core.exceptions import ValidationError
from .models import Device, DeviceType, DeviceMetric, DeviceConfiguration


class DeviceTypeSerializer(serializers.ModelSerializer):
    """
    Serializer for device types.
    """
    device_count = serializers.SerializerMethodField()

    class Meta:
        model = DeviceType
        fields = ['id', 'name', 'description', 'icon', 'device_count', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_device_count(self, obj):
        """Get number of devices of this type."""
        return obj.device_set.count()


class DeviceListSerializer(serializers.ModelSerializer):
    """
    Serializer for device list view (lightweight).
    """
    device_type_name = serializers.CharField(source='device_type.name', read_only=True)
    device_type_icon = serializers.CharField(source='device_type.icon', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    uptime_display = serializers.CharField(source='get_uptime_display', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = Device
        fields = [
            'id', 'name', 'description', 'ip_address', 'device_type_name',
            'device_type_icon', 'vendor', 'model', 'location', 'status',
            'status_display', 'last_seen', 'uptime_display', 'response_time',
            'monitoring_enabled', 'created_by_username', 'created_at', 'updated_at'
        ]


class DeviceDetailSerializer(serializers.ModelSerializer):
    """
    Serializer for detailed device view.
    """
    device_type_name = serializers.CharField(source='device_type.name', read_only=True)
    device_type_icon = serializers.CharField(source='device_type.icon', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    uptime_display = serializers.CharField(source='get_uptime_display', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    is_online = serializers.BooleanField(source='is_online', read_only=True)

    # Recent metrics
    recent_metrics = serializers.SerializerMethodField()
    alert_count = serializers.SerializerMethodField()
    last_config_backup = serializers.SerializerMethodField()

    class Meta:
        model = Device
        fields = [
            'id', 'name', 'description', 'ip_address', 'mac_address',
            'device_type', 'device_type_name', 'device_type_icon',
            'vendor', 'model', 'firmware_version', 'location', 'latitude',
            'longitude', 'address', 'protocol', 'snmp_community', 'snmp_port',
            'monitoring_enabled', 'ping_interval', 'username', 'status',
            'status_display', 'is_online', 'last_seen', 'uptime',
            'uptime_display', 'response_time', 'created_by',
            'created_by_username', 'created_at', 'updated_at',
            'recent_metrics', 'alert_count', 'last_config_backup'
        ]
        read_only_fields = [
            'id', 'status', 'last_seen', 'uptime', 'response_time',
            'created_at', 'updated_at'
        ]
        extra_kwargs = {
            'password': {'write_only': True},
            'enable_password': {'write_only': True}
        }

    def get_recent_metrics(self, obj):
        """Get recent metrics for this device."""
        recent_metrics = obj.metrics.filter(
            timestamp__gte=timezone.now() - timedelta(hours=24)
        ).order_by('-timestamp')[:10]

        return DeviceMetricSerializer(recent_metrics, many=True).data

    def get_alert_count(self, obj):
        """Get count of active alerts for this device."""
        return obj.alerts.filter(status='active').count()

    def get_last_config_backup(self, obj):
        """Get last configuration backup info."""
        last_backup = obj.configurations.first()
        if last_backup:
            return {
                'date': last_backup.backup_date,
                'size': last_backup.size,
                'backed_up_by': last_backup.backed_up_by.username
            }
        return None


class DeviceCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating and updating devices.
    """

    class Meta:
        model = Device
        fields = [
            'name', 'description', 'ip_address', 'mac_address',
            'device_type', 'vendor', 'model', 'firmware_version',
            'location', 'latitude', 'longitude', 'address',
            'protocol', 'snmp_community', 'snmp_port',
            'monitoring_enabled', 'ping_interval', 'username',
            'password', 'enable_password'
        ]
        extra_kwargs = {
            'password': {'write_only': True},
            'enable_password': {'write_only': True}
        }

    def validate_ip_address(self, value):
        """Validate IP address format."""
        try:
            validate_ipv4_address(value)
        except ValidationError:
            raise serializers.ValidationError("Enter a valid IPv4 address.")
        return value

    def validate_mac_address(self, value):
        """Validate MAC address format."""
        if value and not self._is_valid_mac(value):
            raise serializers.ValidationError("Enter a valid MAC address (XX:XX:XX:XX:XX:XX).")
        return value

    def _is_valid_mac(self, mac):
        """Check if MAC address is valid."""
        import re
        pattern = r'^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$'
        return re.match(pattern, mac) is not None

    def validate(self, attrs):
        """Validate device data."""
        # Check for duplicate IP address
        ip_address = attrs.get('ip_address')
        if ip_address:
            existing_device = Device.objects.filter(ip_address=ip_address)
            if self.instance:
                existing_device = existing_device.exclude(id=self.instance.id)

            if existing_device.exists():
                raise serializers.ValidationError({
                    'ip_address': 'Device with this IP address already exists.'
                })

        return attrs

    def create(self, validated_data):
        """Create device with current user as creator."""
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class DeviceMetricSerializer(serializers.ModelSerializer):
    """
    Serializer for device metrics.
    """
    metric_type_display = serializers.CharField(source='get_metric_type_display', read_only=True)
    device_name = serializers.CharField(source='device.name', read_only=True)

    class Meta:
        model = DeviceMetric
        fields = [
            'id', 'device', 'device_name', 'metric_type',
            'metric_type_display', 'value', 'unit', 'timestamp'
        ]
        read_only_fields = ['id', 'timestamp']


class DeviceConfigurationSerializer(serializers.ModelSerializer):
    """
    Serializer for device configurations.
    """
    device_name = serializers.CharField(source='device.name', read_only=True)
    backed_up_by_username = serializers.CharField(source='backed_up_by.username', read_only=True)
    size_display = serializers.SerializerMethodField()

    class Meta:
        model = DeviceConfiguration
        fields = [
            'id', 'device', 'device_name', 'config_data', 'config_type',
            'backup_date', 'backed_up_by', 'backed_up_by_username',
            'size', 'size_display', 'checksum'
        ]
        read_only_fields = ['id', 'backup_date', 'backed_up_by', 'size', 'checksum']

    def get_size_display(self, obj):
        """Get human-readable file size."""
        size = obj.size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} TB"


class DeviceStatsSerializer(serializers.Serializer):
    """
    Serializer for device statistics.
    """
    total_devices = serializers.IntegerField()
    online_devices = serializers.IntegerField()
    offline_devices = serializers.IntegerField()
    warning_devices = serializers.IntegerField()
    device_types = serializers.DictField()
    avg_response_time = serializers.FloatField()
    uptime_percentage = serializers.FloatField()