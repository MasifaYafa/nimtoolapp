# apps/app_settings/serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import AppSettings, UserProfile

User = get_user_model()


class AppSettingsSerializer(serializers.ModelSerializer):
    """
    Serializer for app settings.
    """

    class Meta:
        model = AppSettings
        fields = [
            'id',
            'ping_interval',
            'snmp_timeout',
            'alert_threshold',
            'retry_attempts',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Serializer for user profile.
    """

    class Meta:
        model = UserProfile
        fields = ['phone', 'department']


class UserDetailSerializer(serializers.ModelSerializer):
    """
    Detailed user serializer with profile information.
    """
    profile = UserProfileSerializer(source='app_profile', required=False)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'is_active',
            'date_joined',
            'profile'
        ]
        read_only_fields = ['id', 'date_joined']

    def update(self, instance, validated_data):
        # Handle profile data if provided
        profile_data = validated_data.pop('app_profile', None)

        # Update user fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Update or create profile
        if profile_data:
            profile, created = UserProfile.objects.get_or_create(user=instance)
            for attr, value in profile_data.items():
                setattr(profile, attr, value)
            profile.save()

        return instance


class CreateUserSerializer(serializers.ModelSerializer):
    """
    Serializer for creating new users.
    """
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    profile = UserProfileSerializer(required=False)

    class Meta:
        model = User
        fields = [
            'username',
            'email',
            'first_name',
            'last_name',
            'password',
            'confirm_password',
            'profile'
        ]

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError("Passwords do not match")
        return data

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        profile_data = validated_data.pop('profile', {})

        # Create user
        user = User.objects.create_user(**validated_data)

        # Create profile if provided
        if profile_data:
            UserProfile.objects.create(user=user, **profile_data)

        return user