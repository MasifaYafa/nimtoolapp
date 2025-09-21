# backend/nim_backend/urls.py
"""
Main URL configuration for nim_backend project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView

from rest_framework_simplejwt.views import (
    TokenObtainPairView, TokenRefreshView, TokenVerifyView
)

urlpatterns = [
    path('admin/', admin.site.urls),

    # Auth (your app + JWT endpoints)
    path('api/v1/auth/', include('apps.authentication.urls')),
    path('api/v1/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/auth/token/verify/', TokenVerifyView.as_view(), name='token_verify'),

    # Other APIs
    path('api/v1/', include('apps.devices.urls')),
    path('api/v1/alerts/', include('apps.alerts.urls')),
    path('api/v1/reports/', include('apps.reports.urls')),
    path('api/v1/troubleshoot/', include('apps.troubleshoot.urls')),
    path('api/v1/app_settings/', include('apps.app_settings.urls')),
]

# Serve media/static in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

# SPA fallback: send any non-API, non-admin route to the React index.html
urlpatterns += [
    re_path(r'^(?!api/|admin/).*$', TemplateView.as_view(template_name='index.html'), name='spa'),
]
