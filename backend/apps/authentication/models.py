"""
Authentication models for NIM-Tool.
Handles user authentication and authorization with role-based access control.
"""

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """
    Custom User model extending Django's AbstractUser.
    Adds role-based access control and additional fields.
    """

    class Role(models.TextChoices):
        ADMIN = 'admin', 'Administrator'
        OPERATOR = 'operator', 'Operator'
        VIEWER = 'viewer', 'Viewer'

    # Additional fields
    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.ADMIN,  # Changed default to ADMIN for development
        help_text="User's role determines their access level"
    )

    phone_number = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Phone number for SMS alerts"
    )

    is_active_monitoring = models.BooleanField(
        default=True,
        help_text="Whether this user receives monitoring alerts"
    )

    last_login_ip = models.GenericIPAddressField(
        blank=True,
        null=True,
        help_text="IP address of last login"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'auth_users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    def is_admin(self):
        """Check if user has admin role"""
        return self.role == self.Role.ADMIN

    def is_operator(self):
        """Check if user has operator role"""
        return self.role in [self.Role.ADMIN, self.Role.OPERATOR]

    def can_modify_devices(self):
        """Check if user can modify device configurations"""
        # For development: allow all authenticated users
        # In production, you can change this to: return self.role in [self.Role.ADMIN, self.Role.OPERATOR]
        return True  # Allow all authenticated users for now

    def can_delete_devices(self):
        """Check if user can delete devices"""
        # For development: allow all authenticated users
        # In production, you can change this to: return self.role == self.Role.ADMIN
        return True  # Allow all authenticated users for now

    def can_view_sensitive_data(self):
        """Check if user can view sensitive information"""
        return self.role in [self.Role.ADMIN, self.Role.OPERATOR]

    def can_manage_users(self):
        """Check if user can manage other users"""
        return self.role == self.Role.ADMIN

    def can_access_system_settings(self):
        """Check if user can access system settings"""
        return self.role == self.Role.ADMIN


class UserSession(models.Model):
    """
    Track user sessions for security and audit purposes.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    session_key = models.CharField(max_length=40, unique=True)
    ip_address = models.GenericIPAddressField()
    user_agent = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'user_sessions'
        verbose_name = 'User Session'
        verbose_name_plural = 'User Sessions'

    def __str__(self):
        return f"{self.user.username} - {self.ip_address}"