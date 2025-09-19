"""
Reports serializers for NIM-Tool.
Handles serialization of report-related data for the REST API.
"""

from datetime import timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import ReportTemplate, Report, ReportSchedule, ReportDataCache
from apps.devices.models import Device

User = get_user_model()


class ReportTemplateSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    default_format_display = serializers.CharField(source='get_default_format_display', read_only=True)

    class Meta:
        model = ReportTemplate
        fields = [
            'id', 'name', 'description', 'category', 'category_display',
            'data_sources', 'filters', 'grouping', 'sorting',
            'supported_formats', 'default_format', 'default_format_display',
            'include_charts', 'chart_types', 'is_active', 'is_system_template',
            'created_by', 'created_by_username', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class ReportTemplateListSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = ReportTemplate
        fields = [
            'id', 'name', 'description', 'category', 'category_display',
            'default_format', 'is_active', 'created_by_username', 'created_at'
        ]


class DeviceSimpleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ['id', 'name', 'hostname', 'device_type']


class ReportSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source='template.name', read_only=True)
    template_category = serializers.CharField(source='template.category', read_only=True)
    generated_by_username = serializers.CharField(source='generated_by.username', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    format_display = serializers.CharField(source='get_format_display', read_only=True)
    file_size_display = serializers.CharField(source='get_file_size_display', read_only=True)

    # Compute these safely (don’t depend on model helpers)
    duration = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()

    specific_devices = DeviceSimpleSerializer(many=True, read_only=True)
    specific_device_ids = serializers.PrimaryKeyRelatedField(
        queryset=Device.objects.all(),
        many=True,
        write_only=True,
        source='specific_devices'
    )

    class Meta:
        model = Report
        fields = [
            'id', 'name', 'description', 'template', 'template_name', 'template_category',
            'format', 'format_display', 'date_range_start', 'date_range_end',
            'filters', 'parameters', 'include_all_devices', 'specific_devices', 'specific_device_ids',
            'status', 'status_display', 'file_path', 'file_size', 'file_size_display',
            'data_points', 'scheduled_at', 'started_at', 'completed_at', 'expires_at',
            'error_message', 'retry_count', 'generated_by', 'generated_by_username',
            'duration', 'is_expired', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'status', 'file_path', 'file_size', 'data_points',
            'started_at', 'completed_at', 'error_message', 'retry_count',
            'generated_by', 'created_at', 'updated_at'
        ]

    def get_duration(self, obj):
        start = getattr(obj, "started_at", None)
        end = getattr(obj, "completed_at", None) or (timezone.now() if start else None)
        if start and end:
            try:
                return (end - start).total_seconds()
            except Exception:
                return None
        return None

    def get_is_expired(self, obj):
        expires = getattr(obj, "expires_at", None)
        return bool(expires and timezone.now() >= expires)

    def create(self, validated_data):
        validated_data['generated_by'] = self.context['request'].user
        if not validated_data.get('expires_at'):
            validated_data['expires_at'] = timezone.now() + timedelta(days=30)
        return super().create(validated_data)


class ReportListSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source='template.name', read_only=True)
    generated_by_username = serializers.CharField(source='generated_by.username', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    file_size_display = serializers.CharField(source='get_file_size_display', read_only=True)

    class Meta:
        model = Report
        fields = [
            'id', 'name', 'template_name', 'format', 'status', 'status_display',
            'file_size_display', 'generated_by_username', 'created_at', 'completed_at'
        ]


class ReportScheduleSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source='template.name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    frequency_display = serializers.CharField(source='get_frequency_display', read_only=True)
    format_display = serializers.CharField(source='get_format_display', read_only=True)

    class Meta:
        model = ReportSchedule
        fields = [
            'id', 'name', 'description', 'template', 'template_name',
            'format', 'format_display', 'frequency', 'frequency_display',
            'hour', 'day_of_week', 'day_of_month', 'data_retention_days',
            'filters', 'parameters', 'email_recipients', 'auto_email',
            'is_active', 'next_run', 'last_run', 'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'last_run', 'created_at', 'updated_at']

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class ReportGenerationRequestSerializer(serializers.Serializer):
    template_id = serializers.IntegerField()
    name = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True)

    # Build choices robustly
    try:
        _choices = Report.Format.choices
    except Exception:
        _choices = [('pdf', 'PDF'), ('csv', 'CSV'), ('excel', 'EXCEL')]
    format = serializers.ChoiceField(choices=_choices)

    date_range_start = serializers.DateTimeField()
    date_range_end = serializers.DateTimeField()
    filters = serializers.JSONField(required=False, default=dict)
    parameters = serializers.JSONField(required=False, default=dict)
    include_all_devices = serializers.BooleanField(default=True)
    specific_device_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list
    )

    def validate(self, data):
        if data['date_range_start'] >= data['date_range_end']:
            raise serializers.ValidationError("Start date must be before end date.")

        # Template checks
        try:
            template = ReportTemplate.objects.get(id=data['template_id'])
            if not template.is_active:
                raise serializers.ValidationError("Selected template is not active.")
        except ReportTemplate.DoesNotExist:
            raise serializers.ValidationError("Selected template does not exist.")

        # Format check (case-insensitive, tolerate empty supported_formats)
        supported = (template.supported_formats or [])
        if str(data['format']).lower() not in [str(f).lower() for f in supported]:
            raise serializers.ValidationError(f"Format '{data['format']}' is not supported by this template.")

        if not data['include_all_devices'] and not data.get('specific_device_ids'):
            raise serializers.ValidationError("Must specify devices when 'include_all_devices' is False.")
        return data


class ReportDataCacheSerializer(serializers.ModelSerializer):
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = ReportDataCache
        fields = [
            'id', 'cache_key', 'created_at', 'expires_at', 'access_count',
            'last_accessed', 'is_expired'
        ]
        read_only_fields = ['id', 'access_count', 'last_accessed', 'created_at']


class ReportStatsSerializer(serializers.Serializer):
    total_reports = serializers.IntegerField()
    completed_reports = serializers.IntegerField()
    pending_reports = serializers.IntegerField()
    failed_reports = serializers.IntegerField()
    total_templates = serializers.IntegerField()
    active_schedules = serializers.IntegerField()
    reports_last_7_days = serializers.IntegerField()
    reports_last_30_days = serializers.IntegerField()
    popular_templates = serializers.ListField(child=serializers.DictField())
    total_file_size = serializers.CharField()
    average_file_size = serializers.CharField()


class ReportExportSerializer(serializers.Serializer):
    report_id = serializers.UUIDField()

    def validate_report_id(self, value):
        try:
            report = Report.objects.get(id=value)
            if not report.is_completed():
                raise serializers.ValidationError("Report is not completed yet.")
            if report.is_expired():
                raise serializers.ValidationError("Report has expired.")
        except Report.DoesNotExist:
            raise serializers.ValidationError("Report does not exist.")
        return value
