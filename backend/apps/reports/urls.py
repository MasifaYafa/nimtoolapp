from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ReportTemplateViewSet, ReportViewSet, ReportScheduleViewSet

router = DefaultRouter()
router.register(r'templates', ReportTemplateViewSet, basename='report-template')
router.register(r'reports', ReportViewSet, basename='report')
router.register(r'schedules', ReportScheduleViewSet, basename='report-schedule')

urlpatterns = [
    path('', include(router.urls)),
    # --- explicit route so /reports/<uuid>/export/ resolves ---
    path(
        'reports/<uuid:pk>/export/',
        ReportViewSet.as_view({'get': 'export', 'post': 'export'}),
        name='report-export',
    ),
]
