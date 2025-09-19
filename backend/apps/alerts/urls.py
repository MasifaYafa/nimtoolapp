"""
Enhanced Alerts API URLs with comprehensive endpoints.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create router and register viewsets
router = DefaultRouter()
router.register(r'rules', views.AlertRuleViewSet, basename='alertrule')
router.register(r'alerts', views.AlertViewSet, basename='alert')
router.register(r'notifications', views.AlertNotificationViewSet, basename='alertnotification')

# Additional URL patterns for specific endpoints
urlpatterns = [
    # Include all router URLs
    path('', include(router.urls)),

    # Custom endpoints can be added here if needed
    # Example: path('custom-endpoint/', views.custom_view, name='custom-endpoint'),
]

"""
Available API endpoints after including these URLs in main urls.py:

Alert Rules:
- GET    /api/v1/alerts/rules/                    - List all alert rules
- POST   /api/v1/alerts/rules/                    - Create new alert rule
- GET    /api/v1/alerts/rules/{id}/               - Get specific alert rule
- PUT    /api/v1/alerts/rules/{id}/               - Update alert rule
- DELETE /api/v1/alerts/rules/{id}/               - Delete alert rule
- POST   /api/v1/alerts/rules/{id}/toggle_active/ - Toggle rule active status
- GET    /api/v1/alerts/rules/summary/            - Get rules summary statistics

Alerts:
- GET    /api/v1/alerts/alerts/                   - List all alerts (with filtering)
- POST   /api/v1/alerts/alerts/                   - Create new alert
- GET    /api/v1/alerts/alerts/{id}/              - Get specific alert details
- PUT    /api/v1/alerts/alerts/{id}/              - Update alert
- DELETE /api/v1/alerts/alerts/{id}/              - Delete alert
- GET    /api/v1/alerts/alerts/statistics/        - Get alert statistics for dashboard
- POST   /api/v1/alerts/alerts/{id}/acknowledge/  - Acknowledge specific alert
- POST   /api/v1/alerts/alerts/{id}/resolve/      - Resolve specific alert
- POST   /api/v1/alerts/alerts/acknowledge_all/   - Acknowledge all active alerts
- POST   /api/v1/alerts/alerts/bulk_acknowledge/  - Acknowledge multiple alerts
- POST   /api/v1/alerts/alerts/bulk_resolve/      - Resolve multiple alerts
- GET    /api/v1/alerts/alerts/recent/            - Get recent alerts
- GET    /api/v1/alerts/alerts/active/            - Get active alerts only
- GET    /api/v1/alerts/alerts/critical/          - Get critical alerts only
- POST   /api/v1/alerts/alerts/create_test_alert/ - Create test alert (development)

Notifications:
- GET    /api/v1/alerts/notifications/            - List all notifications
- GET    /api/v1/alerts/notifications/{id}/       - Get specific notification
- GET    /api/v1/alerts/notifications/summary/    - Get notification summary
- GET    /api/v1/alerts/notifications/failed/     - Get failed notifications

Query Parameters:
- ?hours=24          - Filter by time (last N hours)
- ?severity=critical - Filter by alert severity
- ?status=active     - Filter by alert status
- ?device_id=123     - Filter by specific device
- ?limit=10          - Limit number of results
- ?ordering=-first_occurred - Order results
- ?search=keyword    - Search in title/message
"""