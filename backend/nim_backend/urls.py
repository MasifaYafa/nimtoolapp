# nim_backend/urls.py
"""
Main URL configuration for nim_backend project.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # Admin interface
    path('admin/', admin.site.urls),

    # API routes
    path('api/v1/auth/', include('apps.authentication.urls')),
    path('api/v1/', include('apps.devices.urls')),
    path('api/v1/alerts/', include('apps.alerts.urls')),
    path('api/v1/reports/', include('apps.reports.urls')),
    path('api/v1/troubleshoot/', include('apps.troubleshoot.urls')),
    path('api/v1/app_settings/', include('apps.app_settings.urls')),  # Add this line
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)