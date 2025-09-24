# apps/devices/views.py
"""
Device API views for NIM-Tool.
Handles device CRUD operations, monitoring, and management with REAL ping functionality.
"""

from rest_framework import viewsets, status, permissions, filters
from rest_framework.decorators import action  # ← required for @action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q, Count, Avg
import hashlib
import subprocess
import platform
import re
import time
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed

from .models import Device, DeviceType, DeviceMetric, DeviceConfiguration
from .serializers import (
    DeviceTypeSerializer,
    DeviceListSerializer,
    DeviceDetailSerializer,
    DeviceCreateUpdateSerializer,
    DeviceMetricSerializer,
    DeviceConfigurationSerializer,
    DeviceStatsSerializer
)


def perform_ping(ip_address, timeout=3, count=1):
    """
    Perform actual network ping to an IP address
    Returns tuple: (is_online, response_time_ms, error_message)
    """
    try:
        # Validate IP address format
        if not is_valid_ip(ip_address):
            return False, 0, "Invalid IP address format"

        # Determine ping command based on OS
        system = platform.system().lower()
        if system == "windows":
            cmd = ["ping", "-n", str(count), "-w", str(timeout * 1000), ip_address]
        else:  # Linux, macOS, Unix
            cmd = ["ping", "-c", str(count), "-W", str(timeout), ip_address]

        # Execute ping command
        start_time = time.time()
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout + 2  # Add buffer to subprocess timeout
        )
        execution_time = (time.time() - start_time) * 1000  # Convert to milliseconds

        # Parse ping output
        if result.returncode == 0:
            # Extract response time from ping output
            response_time = parse_ping_time(result.stdout, system)
            return True, response_time if response_time else execution_time, None
        else:
            # Parse error message
            error_msg = parse_ping_error(result.stdout, result.stderr, system)
            return False, 0, error_msg

    except subprocess.TimeoutExpired:
        return False, 0, "Ping timeout - device not responding"
    except FileNotFoundError:
        return False, 0, "Ping command not found on system"
    except Exception as e:
        return False, 0, f"Ping error: {str(e)}"


def is_valid_ip(ip_address):
    """Validate IP address format"""
    try:
        socket.inet_aton(ip_address)
        return True
    except socket.error:
        return False


def parse_ping_time(output, system):
    """Extract ping response time from command output"""
    try:
        if system == "windows":
            # Windows: "time=1ms" or "time<1ms"
            match = re.search(r'time[<=](\d+)ms', output.lower())
            if match:
                return float(match.group(1))
        else:
            # Linux/macOS: "time=1.234 ms"
            match = re.search(r'time=(\d+\.?\d*) ms', output.lower())
            if match:
                return float(match.group(1))
    except Exception:
        pass
    return None


def parse_ping_error(stdout, stderr, system):
    """Parse ping error messages for user-friendly display"""
    error_text = (stdout + " " + stderr).lower()

    if "destination host unreachable" in error_text:
        return "Host unreachable - check network connectivity"
    elif "request timeout" in error_text or "no route to host" in error_text:
        return "Connection timeout - device may be offline"
    elif "unknown host" in error_text or "name or service not known" in error_text:
        return "Invalid hostname or IP address"
    elif "network is unreachable" in error_text:
        return "Network unreachable - check network configuration"
    elif "permission denied" in error_text:
        return "Permission denied - insufficient privileges"
    else:
        return "Device is offline or not responding"


class DeviceTypeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing device types.
    """
    queryset = DeviceType.objects.all()
    serializer_class = DeviceTypeSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']


class DeviceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing network devices with real ping functionality.
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['device_type', 'status', 'vendor', 'monitoring_enabled']
    search_fields = ['name', 'ip_address', 'vendor', 'model', 'location']
    ordering_fields = ['name', 'ip_address', 'status', 'last_seen', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        """Get devices based on user permissions."""
        return Device.objects.select_related(
            'device_type', 'created_by'
        ).prefetch_related('metrics', 'alerts')

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'list':
            return DeviceListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return DeviceCreateUpdateSerializer
        else:
            return DeviceDetailSerializer

    def perform_create(self, serializer):
        """Set created_by to current user."""
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        """Check permissions before updating."""
        # Allow all authenticated users to modify devices for now
        # You can re-enable role-based permissions later
        if not hasattr(self.request.user, 'can_modify_devices') or not self.request.user.can_modify_devices():
            # For development: allow all authenticated users
            print(
                f"Warning: User {self.request.user.username} doesn't have modify permissions, but allowing for development")

        serializer.save()

    def perform_destroy(self, instance):
        """Check permissions before deleting."""
        # Allow all authenticated users to delete devices for now
        # You can re-enable role-based permissions later
        if not hasattr(self.request.user, 'can_modify_devices') or not self.request.user.can_modify_devices():
            # For development: allow all authenticated users
            print(
                f"Warning: User {self.request.user.username} doesn't have delete permissions, but allowing for development")

        super().perform_destroy(instance)

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get device statistics dashboard data."""
        devices = self.get_queryset()

        stats = {
            'total_devices': devices.count(),
            'online_devices': devices.filter(status='online').count(),
            'offline_devices': devices.filter(status='offline').count(),
            'warning_devices': devices.filter(status='warning').count(),
            'device_types': dict(
                devices.values('device_type__name')
                .annotate(count=Count('id'))
                .values_list('device_type__name', 'count')
            ),
            'avg_response_time': devices.filter(
                response_time__isnull=False
            ).aggregate(avg=Avg('response_time'))['avg'] or 0,
            'uptime_percentage': self._calculate_uptime_percentage(devices)
        }

        serializer = DeviceStatsSerializer(stats)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def ping(self, request, pk=None):
        """
        Perform REAL network ping on a device.
        This replaces the simulated ping with actual network testing.
        """
        device = self.get_object()

        if not device.monitoring_enabled:
            return Response({
                'status': 'error',
                'message': 'Monitoring is disabled for this device',
                'device_id': device.id,
                'name': device.name,
                'ip_address': device.ip_address,
                'success': False
            }, status=status.HTTP_400_BAD_REQUEST)

        # Perform real ping
        print(f"🔄 Performing real ping to {device.name} ({device.ip_address})")
        is_online, response_time, error_message = perform_ping(device.ip_address)

        # Update device status
        old_status = device.status
        if is_online:
            device.status = Device.Status.ONLINE
            device.last_seen = timezone.now()
            device.response_time = response_time

            # Create metric record for successful ping
            DeviceMetric.objects.create(
                device=device,
                metric_type=DeviceMetric.MetricType.PING_TIME,
                value=response_time,
                unit='ms'
            )
        else:
            device.status = Device.Status.OFFLINE
            device.response_time = None

        device.save()

        # Log the result
        status_changed = old_status != device.status
        if status_changed:
            print(f"📊 Device {device.name} status changed: {old_status} → {device.status}")

        # Prepare response
        if is_online:
            return Response({
                'status': 'success',
                'message': f'Ping successful: {response_time:.1f}ms',
                'device_id': device.id,
                'name': device.name,
                'ip_address': device.ip_address,
                'response_time': round(response_time, 1),
                'last_ping': device.last_seen,
                'status_changed': status_changed,
                'success': True,
                'device_status': device.status
            })
        else:
            return Response({
                'status': 'failed',
                'message': error_message or 'Ping failed: Device unreachable',
                'device_id': device.id,
                'name': device.name,
                'ip_address': device.ip_address,
                'response_time': None,
                'last_ping': timezone.now(),
                'status_changed': status_changed,
                'success': False,
                'device_status': device.status
            })

    @action(detail=False, methods=['post'])
    def ping_all(self, request):
        """
        Ping all devices owned by the user concurrently using real network pings.
        """
        devices = self.get_queryset().filter(monitoring_enabled=True)

        if not devices.exists():
            return Response({
                'results': [],
                'summary': {
                    'total': 0,
                    'online': 0,
                    'offline': 0,
                    'failed': 0,
                    'success_rate': 0
                }
            })

        results = []
        online_count = 0
        offline_count = 0
        failed_count = 0

        print(f"🔄 Starting concurrent ping of {devices.count()} devices")

        # Use ThreadPoolExecutor for concurrent pings
        with ThreadPoolExecutor(max_workers=10) as executor:
            # Submit all ping tasks
            future_to_device = {
                executor.submit(perform_ping, device.ip_address): device
                for device in devices
            }

            # Collect results as they complete
            for future in as_completed(future_to_device):
                device = future_to_device[future]
                try:
                    is_online, response_time, error_message = future.result()

                    # Update device status
                    old_status = device.status
                    if is_online:
                        device.status = Device.Status.ONLINE
                        device.last_seen = timezone.now()
                        device.response_time = response_time
                        online_count += 1

                        # Create metric record
                        DeviceMetric.objects.create(
                            device=device,
                            metric_type=DeviceMetric.MetricType.PING_TIME,
                            value=response_time,
                            unit='ms'
                        )
                    else:
                        device.status = Device.Status.OFFLINE
                        device.response_time = None
                        offline_count += 1

                    device.save()

                    # Add to results
                    results.append({
                        'device_id': device.id,
                        'name': device.name,
                        'ip_address': device.ip_address,
                        'status': device.status,
                        'response_time': response_time,
                        'status_changed': old_status != device.status,
                        'success': is_online,
                        'message': f"Ping successful: {response_time:.1f}ms" if is_online else error_message
                    })

                except Exception as e:
                    failed_count += 1
                    print(f"❌ Failed to ping {device.name}: {str(e)}")
                    results.append({
                        'device_id': device.id,
                        'name': device.name,
                        'ip_address': device.ip_address,
                        'status': 'unknown',
                        'response_time': None,
                        'status_changed': False,
                        'success': False,
                        'message': f"Ping failed: {str(e)}"
                    })

        # Sort results by device name for consistent ordering
        results.sort(key=lambda x: x['name'])
        total_devices = len(devices)

        print(f"✅ Ping all completed: {online_count} online, {offline_count} offline, {failed_count} failed")

        return Response({
            'results': results,
            'summary': {
                'total': total_devices,
                'online': online_count,
                'offline': offline_count,
                'failed': failed_count,
                'success_rate': round((online_count / total_devices) * 100, 1) if total_devices else 0
            }
        })

    @action(detail=True, methods=['get'])
    def metrics(self, request, pk=None):
        """Get device metrics history."""
        device = self.get_object()

        # Get time range from query params
        hours = int(request.query_params.get('hours', 24))
        metric_type = request.query_params.get('type', None)

        metrics_query = device.metrics.filter(
            timestamp__gte=timezone.now() - timedelta(hours=hours)
        ).order_by('-timestamp')

        if metric_type:
            metrics_query = metrics_query.filter(metric_type=metric_type)

        metrics = metrics_query[:100]  # Limit to 100 recent metrics
        serializer = DeviceMetricSerializer(metrics, many=True)

        return Response({
            'device': device.name,
            'time_range_hours': hours,
            'metric_type': metric_type,
            'metrics': serializer.data
        })

    @action(detail=True, methods=['post'])
    def backup_config(self, request, pk=None):
        """Create a configuration backup for the device."""
        device = self.get_object()

        # Allow all authenticated users for now
        if not hasattr(request.user, 'can_modify_devices') or not request.user.can_modify_devices():
            print(
                f"Warning: User {request.user.username} doesn't have backup permissions, but allowing for development")

        # Simulate configuration backup
        # In a real implementation, you would connect to the device and get its config
        config_data = f"""
! Configuration backup for {device.name}
! Generated on {timezone.now()}
!
hostname {device.name}
ip address {device.ip_address}
!
! End of configuration
        """.strip()

        # Calculate size and checksum
        config_size = len(config_data.encode('utf-8'))
        checksum = hashlib.md5(config_data.encode('utf-8')).hexdigest()

        # Save configuration backup
        config_backup = DeviceConfiguration.objects.create(
            device=device,
            config_data=config_data,
            config_type='running_config',
            backed_up_by=request.user,
            size=config_size,
            checksum=checksum
        )

        serializer = DeviceConfigurationSerializer(config_backup)
        return Response({
            'message': 'Configuration backup created successfully',
            'backup': serializer.data
        })

    @action(detail=True, methods=['get'])
    def configurations(self, request, pk=None):
        """Get configuration backups for the device."""
        device = self.get_object()
        configs = device.configurations.all()[:10]  # Last 10 backups

        serializer = DeviceConfigurationSerializer(configs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def test_connectivity(self, request):
        """Test network connectivity by pinging common servers."""
        test_hosts = [
            ('Google DNS', '8.8.8.8'),
            ('Cloudflare DNS', '1.1.1.1'),
            ('OpenDNS', '208.67.222.222')
        ]

        results = []
        for name, ip in test_hosts:
            is_online, response_time, error_message = perform_ping(ip, timeout=2, count=1)
            results.append({
                'name': name,
                'ip_address': ip,
                'online': is_online,
                'response_time': response_time,
                'message': f"Response: {response_time:.1f}ms" if is_online else error_message
            })

        online_count = sum(1 for r in results if r['online'])

        return Response({
            'connectivity_status': 'good' if online_count >= 2 else 'poor' if online_count >= 1 else 'none',
            'tests': results,
            'summary': f"{online_count}/{len(test_hosts)} connectivity tests passed"
        })

    def _calculate_uptime_percentage(self, devices):
        """Calculate overall uptime percentage."""
        online_count = devices.filter(status='online').count()
        total_count = devices.count()

        if total_count == 0:
            return 100.0

        return round((online_count / total_count) * 100, 1)


class DeviceMetricViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing device metrics.
    """
    queryset = DeviceMetric.objects.all()
    serializer_class = DeviceMetricSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['device', 'metric_type']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get metrics summary for dashboard."""
        device_id = request.query_params.get('device_id')
        hours = int(request.query_params.get('hours', 24))

        metrics_query = self.get_queryset().filter(
            timestamp__gte=timezone.now() - timedelta(hours=hours)
        )

        if device_id:
            metrics_query = metrics_query.filter(device_id=device_id)

        # Group by metric type and get averages
        summary = {}
        for metric_type, _ in DeviceMetric.MetricType.choices:
            avg_value = metrics_query.filter(
                metric_type=metric_type
            ).aggregate(avg=Avg('value'))['avg']

            if avg_value is not None:
                summary[metric_type] = round(avg_value, 2)

        return Response(summary)
