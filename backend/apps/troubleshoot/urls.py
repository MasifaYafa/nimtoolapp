# apps/troubleshoot/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # Network tests
    path('network-tests/ping/', views.ping_view),
    path('network-tests/traceroute/', views.traceroute_view),
    path('network-tests/port_scan/', views.port_scan_view),
    path('network-tests/dns_lookup/', views.dns_lookup_view),

    # System health
    path('system-health/current/', views.system_health_view),
    path('system-health/interfaces/', views.interfaces_view),

    # Diagnostics
    path('diagnostics/connectivity/', views.connectivity_view),
    path('diagnostics/performance/', views.performance_view),
    path('diagnostics/speed/', views.speed_view),
    path('diagnostics/security/', views.security_view),

    # Issues
    path('issues/', views.issues_list_view),
    path('issues/<int:pk>/resolve/', views.issue_resolve_view),

    # Logs
    path('logs/', views.logs_list_view),
    path('logs/statistics/', views.logs_stats_view),

    # Overall stats
    path('statistics/', views.overall_stats_view),
]
