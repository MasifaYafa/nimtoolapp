"""
Django admin configuration for authentication app.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, UserSession


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin configuration for custom User model."""

    # Fields to display in the user list
    list_display = [
        'username', 'email', 'first_name', 'last_name', 'role',
        'is_active', 'is_staff', 'last_login', 'date_joined'
    ]

    # Filters for the user list
    list_filter = [
        'role', 'is_active', 'is_staff', 'is_superuser',
        'is_active_monitoring', 'date_joined', 'last_login'
    ]

    # Fields to search
    search_fields = ['username', 'email', 'first_name', 'last_name']

    # Ordering
    ordering = ['username']

    # Fieldsets for the user form
    fieldsets = BaseUserAdmin.fieldsets + (
        ('NIM-Tool Information', {
            'fields': ('role', 'phone_number', 'is_active_monitoring', 'last_login_ip')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    # Fields to show when adding a new user
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('NIM-Tool Information', {
            'fields': ('email', 'first_name', 'last_name', 'role', 'phone_number')
        }),
    )

    # Read-only fields
    readonly_fields = ['last_login_ip', 'created_at', 'updated_at']


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    """Admin configuration for UserSession model."""

    list_display = [
        'user', 'ip_address', 'created_at', 'last_activity', 'is_active'
    ]
    list_filter = ['is_active', 'created_at', 'last_activity']
    search_fields = ['user__username', 'ip_address']
    ordering = ['-last_activity']
    readonly_fields = ['session_key', 'created_at', 'last_activity']

    def has_add_permission(self, request):
        """Sessions are created automatically."""
        return False