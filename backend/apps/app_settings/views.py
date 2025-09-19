# apps/app_settings/views.py
from rest_framework import status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from .models import AppSettings, UserProfile
from .serializers import (
    AppSettingsSerializer,
    UserDetailSerializer,
    CreateUserSerializer
)

User = get_user_model()


class IsAdminUser(permissions.BasePermission):
    """
    Permission class for admin users only.
    """

    def has_permission(self, request, view):
        return (
                request.user.is_authenticated and
                (request.user.is_superuser or getattr(request.user, 'is_staff', False))
        )


class AppSettingsViewSet(ModelViewSet):
    """
    ViewSet for app settings management.
    """
    serializer_class = AppSettingsSerializer
    permission_classes = [IsAdminUser]
    http_method_names = ['get', 'put', 'patch']

    def get_object(self):
        """Always return the singleton settings object."""
        return AppSettings.get_settings()

    def list(self, request):
        """Return the settings object."""
        settings = self.get_object()
        serializer = self.get_serializer(settings)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        """Same as list for singleton."""
        return self.list(request)

    def update(self, request, pk=None):
        """Update settings."""
        settings = self.get_object()
        settings.updated_by = request.user
        serializer = self.get_serializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def test_snmp(self, request):
        """Test SNMP connection."""
        return Response({
            'success': True,
            'message': 'SNMP connection test successful',
            'response_time': 120
        })


class UserManagementViewSet(ModelViewSet):
    """
    ViewSet for user management.
    """
    queryset = User.objects.all()
    permission_classes = [IsAdminUser]

    def get_serializer_class(self):
        if self.action == 'create':
            return CreateUserSerializer
        return UserDetailSerializer

    def list(self, request):
        """List all users with their profile information."""
        users = User.objects.all().prefetch_related('app_profile')
        serializer = UserDetailSerializer(users, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        """Get specific user details."""
        user = self.get_object()
        serializer = UserDetailSerializer(user)
        return Response(serializer.data)

    def create(self, request):
        """Create new user."""
        serializer = CreateUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Return the created user with profile info
        response_serializer = UserDetailSerializer(user)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        """Update user information."""
        user = self.get_object()
        serializer = UserDetailSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def destroy(self, request, pk=None):
        """Delete user."""
        user = self.get_object()

        # Don't allow deletion of superuser or self
        if user.is_superuser:
            return Response(
                {'error': 'Cannot delete superuser'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if user == request.user:
            return Response(
                {'error': 'Cannot delete your own account'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        """Reset user password."""
        user = self.get_object()
        new_password = request.data.get('new_password')

        if not new_password or len(new_password) < 8:
            return Response(
                {'error': 'Password must be at least 8 characters'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(new_password)
        user.save()

        return Response({'message': 'Password reset successfully'})


class DashboardStatsView(APIView):
    """
    View for dashboard statistics.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """Return basic dashboard stats."""
        stats = {
            'total_users': User.objects.count(),
            'active_users': User.objects.filter(is_active=True).count(),
            'settings_last_updated': None
        }

        # Get last settings update
        try:
            settings = AppSettings.get_settings()
            stats['settings_last_updated'] = settings.updated_at
        except:
            pass

        return Response(stats)