"""
Devices API URLs.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'types', views.DeviceTypeViewSet, basename='devicetype')
router.register(r'devices', views.DeviceViewSet, basename='device')
router.register(r'metrics', views.DeviceMetricViewSet, basename='devicemetric')

urlpatterns = [
    path('', include(router.urls)),
]