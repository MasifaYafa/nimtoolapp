# apps/app_settings/models.py
from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator, MaxValueValidator

User = get_user_model()


class AppSettings(models.Model):
    """
    Single model for app settings with monitoring configuration.
    """
    # Monitoring Settings
    ping_interval = models.PositiveIntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(300)],
        help_text="Ping interval in seconds"
    )

    snmp_timeout = models.PositiveIntegerField(
        default=10,
        validators=[MinValueValidator(1), MaxValueValidator(60)],
        help_text="SNMP timeout in seconds"
    )

    alert_threshold = models.PositiveIntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text="Failed checks before alert"
    )

    retry_attempts = models.PositiveIntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Number of retry attempts"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    class Meta:
        db_table = 'app_settings'
        verbose_name = 'App Settings'
        verbose_name_plural = 'App Settings'

    def __str__(self):
        return f"App Settings - Updated: {self.updated_at}"

    @classmethod
    def get_settings(cls):
        """Get or create the settings instance."""
        settings, created = cls.objects.get_or_create(pk=1)
        return settings


class UserProfile(models.Model):
    """
    Extended user profile for additional user information.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='app_profile'
    )

    phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Phone number"
    )

    department = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="User department"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'app_user_profiles'
        verbose_name = 'User Profile'
        verbose_name_plural = 'User Profiles'

    def __str__(self):
        return f"{self.user.username} - {self.department or 'No Dept'}"