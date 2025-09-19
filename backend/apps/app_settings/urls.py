# apps/app_settings/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AppSettingsViewSet, UserManagementViewSet, DashboardStatsView

router = DefaultRouter()
router.register(r'settings', AppSettingsViewSet, basename='app-settings')
router.register(r'users', UserManagementViewSet, basename='user-management')

urlpatterns = [
    path('', include(router.urls)),
    path('stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
]