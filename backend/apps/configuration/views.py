# apps/configuration/views.py
"""
Configuration API views for NIM-Tool.
Handles configuration templates, backups, and bulk operations.
"""

from rest_framework import viewsets, status, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db.models import Q, Count
from datetime import timedelta
import hashlib
import os
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

from .models import (
    ConfigurationTemplate,
    DeviceConfigurationBackup,
    BackupSchedule,
    BulkOperation,
    BulkOperationResult,
    DeviceConfigurationSession
)
from .serializers import (
    ConfigurationTemplateSerializer,
    ConfigurationTemplateListSerializer,
    DeviceConfigurationBackupSerializer,
    DeviceConfigurationBackupListSerializer,
    BackupScheduleSerializer,
    BulkOperationSerializer,
    BulkOperationListSerializer,
    BulkOperationResultSerializer,
    DeviceConfigurationSessionSerializer,
    ApplyTemplateSerializer,
    CreateBackupSerializer,
    FirmwareUpdateSerializer,
    SecurityUpdateSerializer,
    ConfigurationStatsSerializer
)
from apps.devices.models import Device


class ConfigurationTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing configuration templates
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['template_type', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at', 'usage_count']
    ordering = ['name']

    def get_queryset(self):
        """Get templates with related data"""
        return ConfigurationTemplate.objects.select_related('created_by')

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return ConfigurationTemplateListSerializer
        return ConfigurationTemplateSerializer

    @action(detail=True, methods=['post'])
    def apply_to_devices(self, request, pk=None):
        """Apply template to multiple devices"""
        template = self.get_object()
        serializer = ApplyTemplateSerializer(data=request.data)

        if serializer.is_valid():
            device_ids = serializer.validated_data['device_ids']
            variables = serializer.validated_data.get('variables', {})
            operation_name = serializer.validated_data.get(
                'operation_name',
                f"Apply {template.name}"
            )

            # Get devices
            devices = Device.objects.filter(id__in=device_ids)
            if not devices.exists():
                return Response({
                    'error': 'No valid devices found'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Create bulk operation
            bulk_operation = BulkOperation.objects.create(
                name=operation_name,
                operation_type=BulkOperation.OperationType.APPLY_TEMPLATE,
                template=template,
                parameters={'variables': variables},
                total_devices=devices.count(),
                created_by=request.user,
                status=BulkOperation.Status.PENDING
            )
            bulk_operation.devices.set(devices)

            # Create individual results
            for device in devices:
                BulkOperationResult.objects.create(
                    bulk_operation=bulk_operation,
                    device=device,
                    status=BulkOperationResult.ResultStatus.PENDING
                )

            # Increment template usage count
            template.usage_count += 1
            template.save(update_fields=['usage_count'])

            # Start async operation (in production, use Celery)
            self._start_template_application(bulk_operation)

            return Response({
                'message': f'Template application started for {devices.count()} devices',
                'operation_id': bulk_operation.id,
                'devices_count': devices.count()
            })

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def _start_template_application(self, bulk_operation):
        """Start template application process (mock implementation)"""
        # In production, this would be a Celery task
        bulk_operation.status = BulkOperation.Status.RUNNING
        bulk_operation.started_at = timezone.now()
        bulk_operation.save()

        # Mock processing
        import time
        import random

        results = bulk_operation.results.all()
        for result in results:
            result.started_at = timezone.now()
            result.save()

            # Simulate processing time
            time.sleep(0.1)

            # Mock success/failure (90% success rate)
            if random.random() < 0.9:
                result.status = BulkOperationResult.ResultStatus.SUCCESS
                result.message = "Template applied successfully"
                result.output = f"Configuration updated on {result.device.name}"
                bulk_operation.successful_devices += 1
            else:
                result.status = BulkOperationResult.ResultStatus.FAILED
                result.message = "Failed to apply template"
                result.output = "Connection timeout"
                bulk_operation.failed_devices += 1

            result.completed_at = timezone.now()
            result.save()

            # Update progress
            bulk_operation.update_progress()

        # Complete operation
        bulk_operation.status = BulkOperation.Status.COMPLETED
        bulk_operation.completed_at = timezone.now()
        bulk_operation.save()

    @action(detail=False, methods=['get'])
    def categories(self, request):
        """Get template categories with counts"""
        categories = {}
        for choice_value, choice_label in ConfigurationTemplate.TemplateType.choices:
            count = ConfigurationTemplate.objects.filter(
                template_type=choice_value,
                is_active=True
            ).count()
            categories[choice_value] = {
                'label': choice_label,
                'count': count
            }

        return Response(categories)


class DeviceConfigurationBackupViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing device configuration backups
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['device', 'backup_type', 'backup_status']
    search_fields = ['device__name', 'file_name']
    ordering_fields = ['created_at', 'file_size']
    ordering = ['-created_at']

    def get_queryset(self):
        """Get backups with related data"""
        return DeviceConfigurationBackup.objects.select_related(
            'device', 'created_by'
        )

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return DeviceConfigurationBackupListSerializer
        return DeviceConfigurationBackupSerializer

    @action(detail=False, methods=['post'])
    def create_bulk_backup(self, request):
        """Create backups for multiple devices"""
        serializer = CreateBackupSerializer(data=request.data)

        if serializer.is_valid():
            device_ids = serializer.validated_data['device_ids']
            operation_name = serializer.validated_data.get(
                'operation_name',
                f"Bulk Backup - {timezone.now().strftime('%Y-%m-%d %H:%M')}"
            )
            compress_files = serializer.validated_data.get('compress_files', True)

            # Get devices
            devices = Device.objects.filter(id__in=device_ids)
            if not devices.exists():
                return Response({
                    'error': 'No valid devices found'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Create bulk operation
            bulk_operation = BulkOperation.objects.create(
                name=operation_name,
                operation_type=BulkOperation.OperationType.CONFIG_BACKUP,
                parameters={'compress_files': compress_files},
                total_devices=devices.count(),
                created_by=request.user,
                status=BulkOperation.Status.PENDING
            )
            bulk_operation.devices.set(devices)

            # Create individual results
            for device in devices:
                BulkOperationResult.objects.create(
                    bulk_operation=bulk_operation,
                    device=device,
                    status=BulkOperationResult.ResultStatus.PENDING
                )

            # Start async operation
            self._start_bulk_backup(bulk_operation)

            return Response({
                'message': f'Backup started for {devices.count()} devices',
                'operation_id': bulk_operation.id,
                'devices_count': devices.count()
            })

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def _start_bulk_backup(self, bulk_operation):
        """Start bulk backup process (mock implementation)"""
        bulk_operation.status = BulkOperation.Status.RUNNING
        bulk_operation.started_at = timezone.now()
        bulk_operation.save()

        # Mock backup process
        import time
        import random

        results = bulk_operation.results.all()
        for result in results:
            result.started_at = timezone.now()
            result.save()

            # Simulate backup time
            time.sleep(0.2)

            # Mock success/failure (95% success rate)
            if random.random() < 0.95:
                # Create backup record
                config_data = f"""! Backup for {result.device.name}
! Generated on {timezone.now()}
hostname {result.device.name}
ip address {result.device.ip_address}
! Configuration data would be here
! End of configuration"""

                config_hash = hashlib.sha256(config_data.encode()).hexdigest()
                file_name = f"{result.device.name}-backup-{timezone.now().strftime('%Y%m%d_%H%M%S')}.cfg"

                backup = DeviceConfigurationBackup.objects.create(
                    device=result.device,
                    backup_type=DeviceConfigurationBackup.BackupType.AUTOMATIC,
                    backup_status=DeviceConfigurationBackup.BackupStatus.COMPLETED,
                    file_name=file_name,
                    file_path=f"/var/backups/configs/{file_name}",
                    file_size=len(config_data.encode()),
                    config_content=config_data,
                    config_hash=config_hash,
                    created_by=bulk_operation.created_by,
                    completed_at=timezone.now()
                )

                result.status = BulkOperationResult.ResultStatus.SUCCESS
                result.message = f"Backup created: {file_name}"
                result.output = f"Backup size: {backup.get_file_size_display()}"
                bulk_operation.successful_devices += 1
            else:
                result.status = BulkOperationResult.ResultStatus.FAILED
                result.message = "Backup failed"
                result.output = "Unable to connect to device"
                bulk_operation.failed_devices += 1

            result.completed_at = timezone.now()
            result.save()

            # Update progress
            bulk_operation.update_progress()

        # Complete operation
        bulk_operation.status = BulkOperation.Status.COMPLETED
        bulk_operation.completed_at = timezone.now()
        bulk_operation.save()

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore configuration backup to device"""
        backup = self.get_object()

        # Create configuration session
        session = DeviceConfigurationSession.objects.create(
            device=backup.device,
            user=request.user,
            configuration_data=backup.config_content,
            expires_at=timezone.now() + timedelta(hours=2)
        )

        return Response({
            'message': 'Configuration loaded for restore',
            'session_id': session.id,
            'device': backup.device.name,
            'backup_date': backup.created_at,
            'config_size': backup.get_file_size_display()
        })

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download configuration backup file"""
        backup = self.get_object()

        # In production, this would return the actual file
        from django.http import HttpResponse

        response = HttpResponse(
            backup.config_content,
            content_type='text/plain'
        )
        response['Content-Disposition'] = f'attachment; filename="{backup.file_name}"'

        return response


class BackupScheduleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing backup schedules
    """
    queryset = BackupSchedule.objects.all()
    serializer_class = BackupScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['frequency', 'is_active']
    search_fields = ['name']
    ordering_fields = ['name', 'created_at', 'next_run']
    ordering = ['name']

    @action(detail=True, methods=['post'])
    def run_now(self, request, pk=None):
        """Manually trigger a backup schedule"""
        schedule = self.get_object()

        # Get devices for this schedule
        devices = list(schedule.devices.all())

        # Add devices by type
        for device_type in schedule.device_types.all():
            devices.extend(device_type.device_set.all())

        # Remove duplicates
        unique_devices = list({device.id: device for device in devices}.values())

        if not unique_devices:
            return Response({
                'error': 'No devices found for this schedule'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Create bulk backup operation
        bulk_operation = BulkOperation.objects.create(
            name=f"Manual run: {schedule.name}",
            operation_type=BulkOperation.OperationType.CONFIG_BACKUP,
            parameters={
                'compress_files': schedule.compress_files,
                'schedule_id': str(schedule.id)
            },
            total_devices=len(unique_devices),
            created_by=request.user,
            status=BulkOperation.Status.PENDING
        )
        bulk_operation.devices.set(unique_devices)

        # Update schedule last run
        schedule.last_run = timezone.now()
        schedule.save(update_fields=['last_run'])

        return Response({
            'message': f'Backup started for {len(unique_devices)} devices',
            'operation_id': bulk_operation.id,
            'devices_count': len(unique_devices)
        })


class BulkOperationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing bulk operations
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['operation_type', 'status']
    search_fields = ['name']
    ordering_fields = ['created_at', 'started_at', 'completed_at']
    ordering = ['-created_at']

    def get_queryset(self):
        """Get operations with related data"""
        return BulkOperation.objects.select_related(
            'created_by', 'template'
        ).prefetch_related('devices', 'results')

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return BulkOperationListSerializer
        return BulkOperationSerializer

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a running bulk operation"""
        operation = self.get_object()

        if operation.status not in [BulkOperation.Status.PENDING, BulkOperation.Status.RUNNING]:
            return Response({
                'error': 'Operation cannot be cancelled in current status'
            }, status=status.HTTP_400_BAD_REQUEST)

        operation.status = BulkOperation.Status.CANCELLED
        operation.completed_at = timezone.now()
        operation.save()

        # Cancel pending results
        operation.results.filter(
            status=BulkOperationResult.ResultStatus.PENDING
        ).update(
            status=BulkOperationResult.ResultStatus.SKIPPED,
            message="Operation cancelled by user",
            completed_at=timezone.now()
        )

        return Response({
            'message': 'Operation cancelled successfully'
        })

    @action(detail=False, methods=['post'])
    def firmware_update(self, request):
        """Start firmware update operation"""
        serializer = FirmwareUpdateSerializer(data=request.data)

        if serializer.is_valid():
            device_ids = serializer.validated_data['device_ids']
            firmware_file = serializer.validated_data['firmware_file']
            operation_name = serializer.validated_data.get(
                'operation_name',
                f"Firmware Update - {timezone.now().strftime('%Y-%m-%d')}"
            )

            devices = Device.objects.filter(id__in=device_ids)
            if not devices.exists():
                return Response({
                    'error': 'No valid devices found'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Create bulk operation
            bulk_operation = BulkOperation.objects.create(
                name=operation_name,
                operation_type=BulkOperation.OperationType.FIRMWARE_UPDATE,
                parameters={
                    'firmware_file': firmware_file,
                    'backup_before_update': serializer.validated_data.get('backup_before_update', True)
                },
                total_devices=devices.count(),
                created_by=request.user,
                status=BulkOperation.Status.PENDING
            )
            bulk_operation.devices.set(devices)

            return Response({
                'message': f'Firmware update queued for {devices.count()} devices',
                'operation_id': bulk_operation.id,
                'devices_count': devices.count()
            })

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def security_update(self, request):
        """Start security update operation"""
        serializer = SecurityUpdateSerializer(data=request.data)

        if serializer.is_valid():
            device_ids = serializer.validated_data['device_ids']
            security_policies = serializer.validated_data['security_policies']
            operation_name = serializer.validated_data.get(
                'operation_name',
                f"Security Update - {timezone.now().strftime('%Y-%m-%d')}"
            )

            devices = Device.objects.filter(id__in=device_ids)
            if not devices.exists():
                return Response({
                    'error': 'No valid devices found'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Create bulk operation
            bulk_operation = BulkOperation.objects.create(
                name=operation_name,
                operation_type=BulkOperation.OperationType.SECURITY_UPDATE,
                parameters={'security_policies': security_policies},
                total_devices=devices.count(),
                created_by=request.user,
                status=BulkOperation.Status.PENDING
            )
            bulk_operation.devices.set(devices)

            return Response({
                'message': f'Security update queued for {devices.count()} devices',
                'operation_id': bulk_operation.id,
                'devices_count': devices.count()
            })

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DeviceConfigurationSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing device configuration sessions
    """
    serializer_class = DeviceConfigurationSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['device', 'status']
    ordering = ['-updated_at']

    def get_queryset(self):
        """Get user's configuration sessions"""
        return DeviceConfigurationSession.objects.filter(
            user=self.request.user
        ).select_related('device', 'applied_template')

    @action(detail=True, methods=['post'])
    def push_configuration(self, request, pk=None):
        """Push configuration to device"""
        session = self.get_object()

        if session.status != DeviceConfigurationSession.SessionStatus.ACTIVE:
            return Response({
                'error': 'Session is not active'
            }, status=status.HTTP_400_BAD_REQUEST)

        if session.is_expired():
            return Response({
                'error': 'Session has expired'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Mock configuration push
        import time
        time.sleep(1)  # Simulate network delay

        # Update session
        session.status = DeviceConfigurationSession.SessionStatus.COMPLETED
        session.save()

        # Create backup of pushed configuration
        config_hash = hashlib.sha256(session.configuration_data.encode()).hexdigest()
        file_name = f"{session.device.name}-pushed-{timezone.now().strftime('%Y%m%d_%H%M%S')}.cfg"

        DeviceConfigurationBackup.objects.create(
            device=session.device,
            backup_type=DeviceConfigurationBackup.BackupType.MANUAL,
            backup_status=DeviceConfigurationBackup.BackupStatus.COMPLETED,
            file_name=file_name,
            file_path=f"/var/backups/configs/{file_name}",
            file_size=len(session.configuration_data.encode()),
            config_content=session.configuration_data,
            config_hash=config_hash,
            created_by=request.user,
            completed_at=timezone.now()
        )

        return Response({
            'message': f'Configuration pushed to {session.device.name} successfully',
            'backup_created': file_name
        })

    @action(detail=True, methods=['post'])
    def extend_session(self, request, pk=None):
        """Extend session expiry time"""
        session = self.get_object()
        hours = int(request.data.get('hours', 2))

        session.extend_session(hours)

        return Response({
            'message': f'Session extended by {hours} hours',
            'expires_at': session.expires_at
        })


# Statistics view
@action(detail=False, methods=['get'])
def configuration_statistics(request):
    """Get configuration statistics for dashboard"""
    stats = {
        'total_templates': ConfigurationTemplate.objects.count(),
        'active_templates': ConfigurationTemplate.objects.filter(is_active=True).count(),
        'total_backups': DeviceConfigurationBackup.objects.count(),
        'recent_backups': DeviceConfigurationBackup.objects.filter(
            created_at__gte=timezone.now() - timedelta(days=7)
        ).count(),
        'active_operations': BulkOperation.objects.filter(
            status__in=[BulkOperation.Status.PENDING, BulkOperation.Status.RUNNING]
        ).count(),
        'completed_operations': BulkOperation.objects.filter(
            status=BulkOperation.Status.COMPLETED
        ).count(),
        'scheduled_backups': BackupSchedule.objects.filter(is_active=True).count(),
        'template_usage': dict(
            ConfigurationTemplate.objects.filter(usage_count__gt=0)
            .values_list('name', 'usage_count')[:10]
        )
    }

    serializer = ConfigurationStatsSerializer(stats)
    return Response(serializer.data)