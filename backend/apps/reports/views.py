# apps/reports/views.py
"""
Reports API views for NIM-Tool.
Handles report generation, management, and data export.
"""
import logging
import os
import mimetypes
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Q
from django.http import FileResponse
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from .models import Report, ReportSchedule, ReportTemplate
from .serializers import (
    ReportExportSerializer,
    ReportGenerationRequestSerializer,
    ReportListSerializer,
    ReportScheduleSerializer,
    ReportSerializer,
    ReportTemplateListSerializer,
    ReportTemplateSerializer,
)
from apps.devices.models import Device
from apps.alerts.models import Alert

logger = logging.getLogger(__name__)
User = get_user_model()


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class ReportTemplateViewSet(viewsets.ModelViewSet):
    queryset = ReportTemplate.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_serializer_class(self):
        return ReportTemplateListSerializer if self.action == 'list' else ReportTemplateSerializer

    def get_queryset(self):
        qs = ReportTemplate.objects.select_related('created_by')

        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))

        return qs.order_by('category', 'name')

    @action(detail=False, methods=['get'])
    def categories(self, request):
        categories = []
        for value, label in ReportTemplate.Category.choices:
            count = ReportTemplate.objects.filter(category=value, is_active=True).count()
            categories.append({'value': value, 'label': label, 'count': count})
        return Response(categories)


class ReportViewSet(viewsets.ModelViewSet):
    queryset = Report.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_serializer_class(self):
        if self.action == 'list':
            return ReportListSerializer
        if self.action == 'generate':
            return ReportGenerationRequestSerializer
        if self.action == 'export':
            return ReportExportSerializer
        return ReportSerializer

    def get_queryset(self):
        qs = Report.objects.select_related('template', 'generated_by').prefetch_related('specific_devices')

        if not self.request.user.is_staff:
            qs = qs.filter(Q(generated_by=self.request.user) | Q(shared_with=self.request.user)).distinct()

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        template_id = self.request.query_params.get('template')
        if template_id:
            qs = qs.filter(template_id=template_id)

        created_after = self.request.query_params.get('created_after')
        if created_after:
            qs = qs.filter(created_at__gte=created_after)

        created_before = self.request.query_params.get('created_before')
        if created_before:
            qs = qs.filter(created_at__lte=created_before)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        return qs.order_by('-created_at')

    # -------- GENERATE --------
    @action(detail=False, methods=['post'])
    def generate(self, request):
        """
        Generate a report synchronously so the file exists before the client tries to download it.
        """
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            template = ReportTemplate.objects.get(id=serializer.validated_data['template_id'])
        except ReportTemplate.DoesNotExist:
            return Response({'error': 'Template not found'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            report = Report.objects.create(
                name=serializer.validated_data['name'],
                description=serializer.validated_data.get('description', ''),
                template=template,
                format=serializer.validated_data['format'],
                date_range_start=serializer.validated_data['date_range_start'],
                date_range_end=serializer.validated_data['date_range_end'],
                filters=serializer.validated_data.get('filters', {}),
                parameters=serializer.validated_data.get('parameters', {}),
                include_all_devices=serializer.validated_data['include_all_devices'],
                generated_by=request.user,
                status=Report.Status.PENDING,
                scheduled_at=timezone.now(),
                expires_at=timezone.now() + timedelta(days=30),
            )

            if not report.include_all_devices:
                device_ids = serializer.validated_data.get('specific_device_ids', [])
                devices = Device.objects.filter(id__in=device_ids)
                report.specific_devices.set(devices)

            # Synchronous generation — writes the file now
            self._generate_report_sync(report)

            return Response(ReportSerializer(report, context={'request': request}).data,
                            status=status.HTTP_201_CREATED)

        except Exception:
            logger.exception("Error generating report")
            return Response({'error': 'Report generation failed'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _generate_report_sync(self, report):
        """
        Collect data, write the file into MEDIA_ROOT/reports/, and finalize the Report row.
        """
        report.status = Report.Status.GENERATING
        report.started_at = timezone.now()
        report.save(update_fields=['status', 'started_at', 'updated_at'])

        try:
            data = self._collect_report_data(report)
            file_path = self._generate_report_file(report, data)

            report.status = Report.Status.COMPLETED
            report.completed_at = timezone.now()
            report.file_path = file_path  # absolute path
            try:
                report.file_size = os.path.getsize(file_path)
            except OSError:
                report.file_size = None
            report.data_points = len(data) if isinstance(data, list) else 1
            report.save()
            logger.info("Report %s completed. File written to %s", report.id, file_path)

        except Exception as e:
            logger.exception("Report generation failed for %s", report.id)
            report.status = Report.Status.FAILED
            report.error_message = str(e)
            report.retry_count = models.F('retry_count') + 1
            report.save(update_fields=['status', 'error_message', 'retry_count', 'updated_at'])
            raise

    def _collect_report_data(self, report):
        template = report.template
        start_date = report.date_range_start
        end_date = report.date_range_end

        # Prefer monitoring_enabled when present
        if report.include_all_devices:
            devices = Device.objects.filter(monitoring_enabled=True) if hasattr(Device, "monitoring_enabled") else Device.objects.all()
        else:
            devices = report.specific_devices.all()

        if template.category == ReportTemplate.Category.UPTIME:
            return self._get_uptime_data(devices, start_date, end_date)
        if template.category == ReportTemplate.Category.ALERTS:
            return self._get_alerts_data(devices, start_date, end_date)
        if template.category == ReportTemplate.Category.PERFORMANCE:
            return self._get_performance_data(devices, start_date, end_date)
        if template.category == ReportTemplate.Category.INVENTORY:
            return self._get_inventory_data(devices)
        return self._get_generic_data(devices, start_date, end_date)

    # --- Collectors (defensive field access) ---
    def _get_uptime_data(self, devices, start_date, end_date):
        rows = []
        for d in devices:
            rows.append({
                'device_id': d.id,
                'device_name': getattr(d, "name", "") or getattr(d, "hostname", "") or "Unknown",
                'device_hostname': getattr(d, "hostname", ""),
                'device_type': getattr(getattr(d, "device_type", None), "name", "Unknown"),
                'uptime_percentage': 95.0,
                'total_checks': 100,
                'successful_checks': 95,
                'failed_checks': 5,
                'incidents': 1,
                'first_check': getattr(d, "created_at", None),
                'last_check': getattr(d, "last_seen", None) or getattr(d, "updated_at", None),
            })
        return rows

    def _get_alerts_data(self, devices, start_date, end_date):
        alerts = Alert.objects.filter(
            device__in=devices, created_at__gte=start_date, created_at__lte=end_date
        ).select_related('device').order_by('-created_at')

        rows = []
        for a in alerts:
            rows.append({
                'alert_id': a.id,
                'device_name': getattr(a.device, "name", "") or getattr(a.device, "hostname", "") or "Unknown",
                'device_hostname': getattr(a.device, "hostname", ""),
                'severity': getattr(a, "severity", ""),
                'status': getattr(a, "status", ""),
                'message': getattr(a, "message", ""),
                'created_at': getattr(a, "created_at", None),
                'acknowledged_at': getattr(a, "acknowledged_at", None),
                'resolved_at': getattr(a, "resolved_at", None),
                'response_time': ((a.acknowledged_at - a.created_at).total_seconds() / 60) if getattr(a, "acknowledged_at", None) else None,
                'resolution_time': ((a.resolved_at - a.created_at).total_seconds() / 60) if getattr(a, "resolved_at", None) else None,
            })
        return rows

    def _get_performance_data(self, devices, start_date, end_date):
        rows = []
        for d in devices:
            rows.append({
                'device_id': d.id,
                'device_name': getattr(d, "name", "") or getattr(d, "hostname", "") or "Unknown",
                'device_hostname': getattr(d, "hostname", ""),
                'device_type': getattr(getattr(d, "device_type", None), "name", "Unknown"),
                'avg_response_time': 50.0,
                'min_response_time': 10.0,
                'max_response_time': 200.0,
                'total_metrics': 100,
            })
        return rows

    def _get_inventory_data(self, devices):
        rows = []
        for d in devices:
            status_display = (
                d.get_status_display() if hasattr(d, "get_status_display")
                else (d.get_current_status_display() if hasattr(d, "get_current_status_display") else str(getattr(d, "status", "") or ""))
            )
            rows.append({
                'device_id': d.id,
                'device_name': getattr(d, "name", "") or getattr(d, "hostname", "") or "Unknown",
                'hostname': getattr(d, "hostname", ""),
                'ip_address': getattr(d, "ip_address", ""),
                'device_type': getattr(getattr(d, "device_type", None), "name", "Unknown"),
                'location': getattr(d, "location", None) or 'Not specified',
                'description': getattr(d, "description", None) or '',
                'is_active': bool(getattr(d, "monitoring_enabled", True)),
                'created_at': getattr(d, "created_at", None),
                'last_seen': getattr(d, "last_seen", None),
                'current_status': status_display,
            })
        return rows

    def _get_generic_data(self, devices, start_date, end_date):
        rows = []
        for d in devices:
            status_display = (
                d.get_status_display() if hasattr(d, "get_status_display")
                else (d.get_current_status_display() if hasattr(d, "get_current_status_display") else str(getattr(d, "status", "") or ""))
            )
            rows.append({
                'device_id': d.id,
                'device_name': getattr(d, "name", "") or getattr(d, "hostname", "") or "Unknown",
                'hostname': getattr(d, "hostname", ""),
                'ip_address': getattr(d, "ip_address", ""),
                'status': status_display,
                'last_seen': getattr(d, "last_seen", None),
            })
        return rows

    def _generate_report_file(self, report, data) -> str:
        """
        Write the file under MEDIA_ROOT/reports and return the absolute path.
        """
        # Lazy imports (avoid import-time failures)
        from .generators.pdf import PDFGenerator
        from .generators.excel import ExcelGenerator
        from .generators.csv import CSVGenerator

        base_media = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(getattr(settings, 'BASE_DIR', os.getcwd()), 'media')
        reports_dir = os.path.join(base_media, 'reports')
        os.makedirs(reports_dir, exist_ok=True)

        fmt = str(report.format or '').lower()
        # Map "excel" → "xlsx" so openpyxl can save correctly
        ext = {'pdf': 'pdf', 'csv': 'csv', 'excel': 'xlsx', 'xlsx': 'xlsx'}.get(fmt, fmt)
        filename = f"{report.template.category}_{report.id}.{ext}"
        abs_path = os.path.join(reports_dir, filename)

        if fmt == 'pdf':
            PDFGenerator().generate(report, data, abs_path)
        elif fmt in ('xlsx', 'excel'):
            ExcelGenerator().generate(report, data, abs_path)
        elif fmt == 'csv':
            CSVGenerator().generate(report, data, abs_path)
        else:
            raise ValueError(f"Unsupported format: {report.format}")

        return abs_path

    # -------- EXPORT / DOWNLOAD --------
    @action(detail=True, methods=['get', 'post'])
    def export(self, request, pk=None):
        """
        Stream the file if present. If not completed or file missing, try a quick on-demand generation once.
        """
        report = self.get_object()

        # If not completed or file missing, attempt on-demand generation
        if (getattr(report, "status", None) != Report.Status.COMPLETED
                or not report.file_path
                or not os.path.exists(report.file_path)):
            try:
                self._generate_report_sync(report)
            except Exception:
                return Response({'error': 'Report is not completed yet'}, status=status.HTTP_400_BAD_REQUEST)

        filename = os.path.basename(report.file_path)
        return FileResponse(
            open(report.file_path, 'rb'),
            as_attachment=True,
            filename=filename,
            content_type=self._guess_content_type(filename, report.format),
        )

    def _guess_content_type(self, filename, fmt):
        fmt = str(fmt or '').lower()
        if fmt == 'pdf':
            return 'application/pdf'
        if fmt in ('xlsx', 'excel'):
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        if fmt == 'csv':
            return 'text/csv'
        return mimetypes.guess_type(filename)[0] or 'application/octet-stream'


class ReportScheduleViewSet(viewsets.ModelViewSet):
    queryset = ReportSchedule.objects.all()
    serializer_class = ReportScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = ReportSchedule.objects.select_related('template', 'created_by')

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')

        frequency = self.request.query_params.get('frequency')
        if frequency:
            qs = qs.filter(frequency=frequency)

        template_id = self.request.query_params.get('template')
        if template_id:
            qs = qs.filter(template_id=template_id)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        return qs.order_by('name')

    @action(detail=True, methods=['post'])
    def run_now(self, request, pk=None):
        try:
            schedule = self.get_object()
            if not schedule.is_active:
                return Response({'error': 'Schedule is not active'}, status=status.HTTP_400_BAD_REQUEST)

            report = Report.objects.create(
                name=f"{schedule.name} - Manual Run",
                description=f"Manual execution of scheduled report: {schedule.description}",
                template=schedule.template,
                format=schedule.format,
                date_range_end=timezone.now(),
                date_range_start=timezone.now() - timedelta(days=schedule.data_retention_days),
                filters=schedule.filters,
                parameters=schedule.parameters,
                include_all_devices=True,
                generated_by=request.user,
                status=Report.Status.PENDING,
                scheduled_at=timezone.now(),
                expires_at=timezone.now() + timedelta(days=30),
            )

            self._generate_report_sync(report)

            return Response(
                {'message': 'Report generated',
                 'report': ReportSerializer(report, context={'request': request}).data},
                status=status.HTTP_201_CREATED
            )
        except Exception:
            logger.exception("Failed to run scheduled report")
            return Response({'error': 'Failed to run scheduled report'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
