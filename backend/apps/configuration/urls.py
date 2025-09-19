# apps/configuration/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ConfigurationTemplateViewSet,
    DeviceConfigurationBackupViewSet,
    BackupScheduleViewSet,
    BulkOperationViewSet,
    DeviceConfigurationSessionViewSet,
    configuration_statistics,
)

router = DefaultRouter()
router.register(r'templates', ConfigurationTemplateViewSet, basename='template')
router.register(r'backups', DeviceConfigurationBackupViewSet, basename='backup')
router.register(r'schedules', BackupScheduleViewSet, basename='schedule')
router.register(r'bulk-operations', BulkOperationViewSet, basename='bulk-operation')
router.register(r'sessions', DeviceConfigurationSessionViewSet, basename='session')

urlpatterns = [
    path('', include(router.urls)),
    path('statistics/', configuration_statistics, name='configuration-statistics'),
]
