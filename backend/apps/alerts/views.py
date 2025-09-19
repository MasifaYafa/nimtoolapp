"""
Alert API views for NIM-Tool.
Enhanced alert management with real-time monitoring integration.
"""

from rest_framework import viewsets, status, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db.models import Q, Count, Avg, Max, Min
from django.db import transaction
from datetime import timedelta
from collections import defaultdict
import logging

from .models import AlertRule, Alert, AlertNotification
from .serializers import (
    AlertRuleSerializer,
    AlertListSerializer,
    AlertDetailSerializer,
    AlertAcknowledgeSerializer,
    AlertResolveSerializer,
    AlertBulkActionSerializer,
    AlertNotificationSerializer,
    AlertStatsSerializer,
    AlertCreateSerializer
)

logger = logging.getLogger(__name__)


class AlertRuleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing alert rules with enhanced functionality.
    """
    queryset = AlertRule.objects.all()
    serializer_class = AlertRuleSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['severity', 'is_active', 'metric_type', 'condition']
    search_fields = ['name', 'description', 'metric_type']
    ordering_fields = ['name', 'severity', 'created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        """Get alert rules based on user permissions."""
        return AlertRule.objects.select_related('created_by').prefetch_related(
            'specific_devices', 'triggered_alerts'
        )

    def perform_create(self, serializer):
        """Set created_by to current user."""
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        """Check permissions before updating - allow all authenticated users for now."""
        # For development: allow all authenticated users
        # You can re-enable role checks later
        try:
            if hasattr(self.request.user, 'is_operator') and not self.request.user.is_operator():
                logger.warning(f"User {self.request.user.username} doesn't have operator permissions, but allowing for development")
        except:
            pass  # Skip permission check for development

        serializer.save()

    def perform_destroy(self, instance):
        """Check permissions before deleting - allow all authenticated users for now."""
        # For development: allow all authenticated users
        try:
            if hasattr(self.request.user, 'is_operator') and not self.request.user.is_operator():
                logger.warning(f"User {self.request.user.username} doesn't have operator permissions, but allowing for development")
        except:
            pass  # Skip permission check for development

        super().perform_destroy(instance)

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        """Toggle alert rule active status."""
        rule = self.get_object()

        # For development: allow all authenticated users
        try:
            if hasattr(request.user, 'is_operator') and not request.user.is_operator():
                logger.warning(f"User {request.user.username} doesn't have operator permissions, but allowing for development")
        except:
            pass

        rule.is_active = not rule.is_active
        rule.save()

        return Response({
            'message': f'Alert rule {"activated" if rule.is_active else "deactivated"}',
            'is_active': rule.is_active,
            'rule_name': rule.name
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get alert rules summary."""
        rules = self.get_queryset()

        summary = {
            'total_rules': rules.count(),
            'active_rules': rules.filter(is_active=True).count(),
            'inactive_rules': rules.filter(is_active=False).count(),
            'rules_by_severity': dict(
                rules.values('severity').annotate(count=Count('id')).values_list('severity', 'count')
            ),
            'rules_by_metric': dict(
                rules.values('metric_type').annotate(count=Count('id')).values_list('metric_type', 'count')
            )
        }

        return Response(summary)


class AlertViewSet(viewsets.ModelViewSet):
    """
    Enhanced ViewSet for managing alerts with real-time capabilities.
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['severity', 'status', 'device', 'device__device_type']
    search_fields = ['title', 'message', 'device__name', 'device__ip_address']
    ordering_fields = ['first_occurred', 'last_occurred', 'severity', 'occurrence_count']
    ordering = ['-first_occurred']

    def get_queryset(self):
        """Get alerts based on user permissions with optimized queries."""
        return Alert.objects.select_related(
            'device',
            'device__device_type',
            'alert_rule',
            'acknowledged_by',
            'resolved_by'
        ).prefetch_related('notifications')

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'list':
            return AlertListSerializer
        elif self.action == 'create':
            return AlertCreateSerializer
        else:
            return AlertDetailSerializer

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get comprehensive alert statistics for dashboard."""
        # Get query parameters
        hours = int(request.query_params.get('hours', 24))
        device_id = request.query_params.get('device_id')

        # Base queryset
        alerts = self.get_queryset()

        # Apply time filter if specified
        if hours > 0:
            time_filter = timezone.now() - timedelta(hours=hours)
            alerts = alerts.filter(first_occurred__gte=time_filter)

        # Apply device filter if specified
        if device_id:
            alerts = alerts.filter(device_id=device_id)

        # Calculate comprehensive statistics
        total_alerts = alerts.count()
        active_alerts = alerts.filter(status='active').count()
        critical_alerts = alerts.filter(severity='critical').count()
        warning_alerts = alerts.filter(severity='warning').count()
        info_alerts = alerts.filter(severity='info').count()
        acknowledged_alerts = alerts.filter(status='acknowledged').count()
        resolved_alerts = alerts.filter(status='resolved').count()
        unacknowledged_alerts = alerts.filter(status='active').count()

        # Calculate trends and additional metrics
        recent_critical_count = alerts.filter(
            severity='critical',
            first_occurred__gte=timezone.now() - timedelta(hours=1)
        ).count()

        # Get alerts by device (top 10)
        alerts_by_device = dict(
            alerts.values('device__name')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
            .values_list('device__name', 'count')
        )

        # Get alerts by type/severity
        alerts_by_type = dict(
            alerts.values('severity')
            .annotate(count=Count('id'))
            .values_list('severity', 'count')
        )

        # Calculate hourly distribution for trends
        alerts_by_hour = self._get_hourly_alert_distribution(alerts, hours)

        # Calculate average resolution and acknowledgment times
        avg_resolution_time = self._calculate_avg_resolution_time(alerts)
        avg_acknowledgment_time = self._calculate_avg_acknowledgment_time(alerts)

        # Get top alerting devices with details
        top_alerting_devices = list(
            alerts.values('device__name', 'device__ip_address')
            .annotate(alert_count=Count('id'))
            .order_by('-alert_count')[:5]
        )

        # Determine trend direction
        trend_direction = self._calculate_trend_direction(alerts, hours)

        stats = {
            'total_alerts': total_alerts,
            'active_alerts': active_alerts,
            'critical_alerts': critical_alerts,
            'warning_alerts': warning_alerts,
            'info_alerts': info_alerts,
            'acknowledged_alerts': acknowledged_alerts,
            'resolved_alerts': resolved_alerts,
            'unacknowledged_alerts': unacknowledged_alerts,
            'alerts_by_device': alerts_by_device,
            'alerts_by_type': alerts_by_type,
            'alerts_by_hour': alerts_by_hour,
            'avg_resolution_time': avg_resolution_time,
            'avg_acknowledgment_time': avg_acknowledgment_time,
            'top_alerting_devices': top_alerting_devices,
            'recent_critical_count': recent_critical_count,
            'trend_direction': trend_direction
        }

        serializer = AlertStatsSerializer(stats)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        """Acknowledge an alert with enhanced validation."""
        alert = self.get_object()

        if alert.status != Alert.Status.ACTIVE:
            return Response({
                'error': 'Only active alerts can be acknowledged',
                'current_status': alert.status
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer = AlertAcknowledgeSerializer(data=request.data)
        if serializer.is_valid():
            note = serializer.validated_data.get('note', '')

            try:
                with transaction.atomic():
                    alert.acknowledge(request.user, note)

                    # Log the acknowledgment
                    logger.info(f"Alert {alert.id} acknowledged by {request.user.username}")

                return Response({
                    'message': 'Alert acknowledged successfully',
                    'alert': AlertDetailSerializer(alert).data,
                    'acknowledged_by': request.user.username,
                    'acknowledged_at': alert.acknowledged_at
                })
            except Exception as e:
                logger.error(f"Failed to acknowledge alert {alert.id}: {str(e)}")
                return Response({
                    'error': 'Failed to acknowledge alert'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Resolve an alert with enhanced validation."""
        alert = self.get_object()

        if alert.status not in [Alert.Status.ACTIVE, Alert.Status.ACKNOWLEDGED]:
            return Response({
                'error': 'Only active or acknowledged alerts can be resolved',
                'current_status': alert.status
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer = AlertResolveSerializer(data=request.data)
        if serializer.is_valid():
            note = serializer.validated_data.get('note', '')

            try:
                with transaction.atomic():
                    alert.resolve(request.user, note)

                    # Log the resolution
                    logger.info(f"Alert {alert.id} resolved by {request.user.username}")

                return Response({
                    'message': 'Alert resolved successfully',
                    'alert': AlertDetailSerializer(alert).data,
                    'resolved_by': request.user.username,
                    'resolved_at': alert.resolved_at
                })
            except Exception as e:
                logger.error(f"Failed to resolve alert {alert.id}: {str(e)}")
                return Response({
                    'error': 'Failed to resolve alert'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def acknowledge_all(self, request):
        """Acknowledge all active alerts with enhanced functionality."""
        # For development: allow all authenticated users
        try:
            if hasattr(request.user, 'is_operator') and not request.user.is_operator():
                logger.warning(f"User {request.user.username} doesn't have operator permissions, but allowing for development")
        except:
            pass

        # Get filters from request
        severity_filter = request.data.get('severity')
        device_filter = request.data.get('device_id')
        note = request.data.get('note', 'Bulk acknowledgment')

        # Build queryset
        active_alerts = self.get_queryset().filter(status='active')

        if severity_filter:
            active_alerts = active_alerts.filter(severity=severity_filter)
        if device_filter:
            active_alerts = active_alerts.filter(device_id=device_filter)

        count = 0
        errors = []

        try:
            with transaction.atomic():
                for alert in active_alerts:
                    try:
                        alert.acknowledge(request.user, note)
                        count += 1
                    except Exception as e:
                        errors.append(f"Failed to acknowledge alert {alert.id}: {str(e)}")
                        logger.error(f"Failed to acknowledge alert {alert.id}: {str(e)}")

                logger.info(f"Bulk acknowledged {count} alerts by {request.user.username}")

        except Exception as e:
            logger.error(f"Bulk acknowledgment failed: {str(e)}")
            return Response({
                'error': 'Bulk acknowledgment failed',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        response_data = {
            'message': f'Acknowledged {count} alerts',
            'count': count,
            'total_processed': active_alerts.count()
        }

        if errors:
            response_data['errors'] = errors

        return Response(response_data)

    @action(detail=False, methods=['post'])
    def bulk_acknowledge(self, request):
        """Acknowledge multiple specific alerts."""
        serializer = AlertBulkActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        alert_ids = serializer.validated_data['alert_ids']
        note = serializer.validated_data.get('note', 'Bulk acknowledgment')

        alerts = self.get_queryset().filter(
            id__in=alert_ids,
            status='active'
        )

        count = 0
        errors = []

        try:
            with transaction.atomic():
                for alert in alerts:
                    try:
                        alert.acknowledge(request.user, note)
                        count += 1
                    except Exception as e:
                        errors.append(f"Failed to acknowledge alert {alert.id}: {str(e)}")

                logger.info(f"Bulk acknowledged {count} specific alerts by {request.user.username}")

        except Exception as e:
            return Response({
                'error': 'Bulk acknowledgment failed',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        response_data = {
            'message': f'Acknowledged {count} alerts',
            'count': count,
            'requested': len(alert_ids)
        }

        if errors:
            response_data['errors'] = errors

        return Response(response_data)

    @action(detail=False, methods=['post'])
    def bulk_resolve(self, request):
        """Resolve multiple specific alerts."""
        serializer = AlertBulkActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        alert_ids = serializer.validated_data['alert_ids']
        note = serializer.validated_data.get('note', 'Bulk resolution')

        alerts = self.get_queryset().filter(
            id__in=alert_ids,
            status__in=['active', 'acknowledged']
        )

        count = 0
        errors = []

        try:
            with transaction.atomic():
                for alert in alerts:
                    try:
                        alert.resolve(request.user, note)
                        count += 1
                    except Exception as e:
                        errors.append(f"Failed to resolve alert {alert.id}: {str(e)}")

                logger.info(f"Bulk resolved {count} specific alerts by {request.user.username}")

        except Exception as e:
            return Response({
                'error': 'Bulk resolution failed',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        response_data = {
            'message': f'Resolved {count} alerts',
            'count': count,
            'requested': len(alert_ids)
        }

        if errors:
            response_data['errors'] = errors

        return Response(response_data)

    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent alerts with configurable time window."""
        hours = int(request.query_params.get('hours', 24))
        limit = int(request.query_params.get('limit', 10))
        severity = request.query_params.get('severity')

        recent_alerts = self.get_queryset().filter(
            first_occurred__gte=timezone.now() - timedelta(hours=hours)
        )

        if severity:
            recent_alerts = recent_alerts.filter(severity=severity)

        recent_alerts = recent_alerts[:limit]

        serializer = AlertListSerializer(recent_alerts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all currently active alerts."""
        active_alerts = self.get_queryset().filter(status='active')

        # Optional severity filter
        severity = request.query_params.get('severity')
        if severity:
            active_alerts = active_alerts.filter(severity=severity)

        serializer = AlertListSerializer(active_alerts, many=True)
        return Response({
            'count': active_alerts.count(),
            'alerts': serializer.data
        })

    @action(detail=False, methods=['get'])
    def critical(self, request):
        """Get all critical alerts."""
        critical_alerts = self.get_queryset().filter(
            severity='critical',
            status__in=['active', 'acknowledged']
        )

        serializer = AlertListSerializer(critical_alerts, many=True)
        return Response({
            'count': critical_alerts.count(),
            'alerts': serializer.data
        })

    @action(detail=False, methods=['post'])
    def create_test_alert(self, request):
        """Create a test alert for development/testing purposes."""
        from apps.devices.models import Device

        # Get a random device for testing
        device = Device.objects.first()
        if not device:
            return Response({
                'error': 'No devices available to create test alert'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Create test alert
        test_alert = Alert.objects.create(
            title=f"Test Alert - {timezone.now().strftime('%H:%M:%S')}",
            message="This is a test alert created for development purposes",
            severity='warning',
            device=device,
            metric_name='test_metric',
            current_value=85.0,
            threshold_value=80.0
        )

        serializer = AlertDetailSerializer(test_alert)
        return Response({
            'message': 'Test alert created successfully',
            'alert': serializer.data
        })

    def _get_hourly_alert_distribution(self, alerts, hours):
        """Calculate hourly distribution of alerts."""
        if hours > 168:  # More than a week, group by day
            return self._get_daily_alert_distribution(alerts, hours)

        now = timezone.now()
        hourly_data = []

        for i in range(hours):
            hour_start = now - timedelta(hours=i+1)
            hour_end = now - timedelta(hours=i)

            count = alerts.filter(
                first_occurred__gte=hour_start,
                first_occurred__lt=hour_end
            ).count()

            hourly_data.append({
                'hour': hour_start.strftime('%H:00'),
                'count': count,
                'timestamp': hour_start.isoformat()
            })

        return list(reversed(hourly_data))

    def _get_daily_alert_distribution(self, alerts, hours):
        """Calculate daily distribution of alerts for longer periods."""
        now = timezone.now()
        days = min(hours // 24, 30)  # Max 30 days
        daily_data = []

        for i in range(days):
            day_start = now - timedelta(days=i+1)
            day_end = now - timedelta(days=i)

            count = alerts.filter(
                first_occurred__gte=day_start,
                first_occurred__lt=day_end
            ).count()

            daily_data.append({
                'day': day_start.strftime('%m/%d'),
                'count': count,
                'timestamp': day_start.isoformat()
            })

        return list(reversed(daily_data))

    def _calculate_avg_resolution_time(self, alerts):
        """Calculate average resolution time for resolved alerts."""
        resolved_alerts = alerts.filter(
            status='resolved',
            resolved_at__isnull=False
        )

        if not resolved_alerts.exists():
            return 0

        total_time = 0
        count = 0

        for alert in resolved_alerts:
            if alert.resolved_at and alert.first_occurred:
                duration = alert.resolved_at - alert.first_occurred
                total_time += duration.total_seconds()
                count += 1

        if count == 0:
            return 0

        avg_seconds = total_time / count
        return round(avg_seconds / 3600, 2)  # Return in hours

    def _calculate_avg_acknowledgment_time(self, alerts):
        """Calculate average time to acknowledge alerts."""
        acknowledged_alerts = alerts.filter(
            acknowledged_at__isnull=False
        )

        if not acknowledged_alerts.exists():
            return 0

        total_time = 0
        count = 0

        for alert in acknowledged_alerts:
            if alert.acknowledged_at and alert.first_occurred:
                duration = alert.acknowledged_at - alert.first_occurred
                total_time += duration.total_seconds()
                count += 1

        if count == 0:
            return 0

        avg_seconds = total_time / count
        return round(avg_seconds / 60, 2)  # Return in minutes

    def _calculate_trend_direction(self, alerts, hours):
        """Calculate if alerts are trending up, down, or stable."""
        if hours < 2:
            return 'stable'

        # Split time period in half
        midpoint = timezone.now() - timedelta(hours=hours/2)

        recent_count = alerts.filter(first_occurred__gte=midpoint).count()
        older_count = alerts.filter(first_occurred__lt=midpoint).count()

        if recent_count > older_count * 1.2:  # 20% increase threshold
            return 'up'
        elif recent_count < older_count * 0.8:  # 20% decrease threshold
            return 'down'
        else:
            return 'stable'


class AlertNotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Enhanced ViewSet for viewing alert notifications.
    """
    queryset = AlertNotification.objects.all()
    serializer_class = AlertNotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['alert', 'type', 'status', 'alert__device']
    ordering_fields = ['created_at', 'last_attempt', 'attempts']
    ordering = ['-created_at']

    def get_queryset(self):
        """Get notifications with optimized queries."""
        return AlertNotification.objects.select_related(
            'alert', 'alert__device'
        )

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get comprehensive notification summary."""
        notifications = self.get_queryset()

        # Time filter
        hours = int(request.query_params.get('hours', 24))
        if hours > 0:
            time_filter = timezone.now() - timedelta(hours=hours)
            notifications = notifications.filter(created_at__gte=time_filter)

        summary = {
            'total_notifications': notifications.count(),
            'sent_notifications': notifications.filter(status='sent').count(),
            'failed_notifications': notifications.filter(status='failed').count(),
            'pending_notifications': notifications.filter(status='pending').count(),
            'retry_notifications': notifications.filter(status='retry').count(),
            'notifications_by_type': dict(
                notifications.values('type')
                .annotate(count=Count('id'))
                .values_list('type', 'count')
            ),
            'success_rate': self._calculate_success_rate(notifications),
            'avg_attempts': notifications.aggregate(avg=Avg('attempts'))['avg'] or 0
        }

        return Response(summary)

    @action(detail=False, methods=['get'])
    def failed(self, request):
        """Get all failed notifications for troubleshooting."""
        failed_notifications = self.get_queryset().filter(status='failed')

        serializer = self.get_serializer(failed_notifications, many=True)
        return Response({
            'count': failed_notifications.count(),
            'notifications': serializer.data
        })

    def _calculate_success_rate(self, notifications):
        """Calculate notification success rate."""
        total = notifications.count()
        if total == 0:
            return 100.0

        successful = notifications.filter(status='sent').count()
        return round((successful / total) * 100, 1)