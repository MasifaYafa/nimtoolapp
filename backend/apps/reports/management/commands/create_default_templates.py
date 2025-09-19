"""
Django management command to create default report templates.
Save this as: backend/apps/reports/management/commands/create_default_templates.py
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.reports.models import ReportTemplate

User = get_user_model()


class Command(BaseCommand):
    help = 'Create default report templates for NIM-Tool'

    def handle(self, *args, **options):
        # Get or create a system user for creating templates
        admin_user, created = User.objects.get_or_create(
            username='system',
            defaults={
                'email': 'system@nimtool.local',
                'is_staff': True,
                'is_superuser': False,
            }
        )

        if created:
            self.stdout.write(f'Created system user: {admin_user.username}')

        # Default report templates
        templates_data = [
            {
                'name': 'Device Uptime Report',
                'description': 'Comprehensive report showing device availability and uptime statistics',
                'category': ReportTemplate.Category.UPTIME,
                'data_sources': ['devices', 'metrics'],
                'filters': {
                    'device_types': [],
                    'locations': [],
                    'status': 'all'
                },
                'grouping': {
                    'group_by': 'device_type',
                    'sort_by': 'uptime_percentage'
                },
                'sorting': {
                    'primary': 'uptime_percentage',
                    'order': 'desc'
                },
                'supported_formats': ['pdf', 'excel', 'csv'],
                'default_format': ReportTemplate.Format.PDF,
                'include_charts': True,
                'chart_types': ['bar', 'pie'],
                'is_system_template': True,
            },
            {
                'name': 'Alert Summary Report',
                'description': 'Detailed analysis of alerts, response times, and resolution statistics',
                'category': ReportTemplate.Category.ALERTS,
                'data_sources': ['alerts', 'devices'],
                'filters': {
                    'severity': ['critical', 'high', 'medium', 'low'],
                    'status': 'all',
                    'device_types': []
                },
                'grouping': {
                    'group_by': 'severity',
                    'sort_by': 'created_at'
                },
                'sorting': {
                    'primary': 'created_at',
                    'order': 'desc'
                },
                'supported_formats': ['pdf', 'excel', 'csv'],
                'default_format': ReportTemplate.Format.PDF,
                'include_charts': True,
                'chart_types': ['pie', 'line'],
                'is_system_template': True,
            },
            {
                'name': 'Performance Analysis Report',
                'description': 'Network performance metrics including response times and throughput',
                'category': ReportTemplate.Category.PERFORMANCE,
                'data_sources': ['devices', 'metrics'],
                'filters': {
                    'device_types': [],
                    'performance_threshold': 100
                },
                'grouping': {
                    'group_by': 'device_type',
                    'sort_by': 'avg_response_time'
                },
                'sorting': {
                    'primary': 'avg_response_time',
                    'order': 'asc'
                },
                'supported_formats': ['pdf', 'excel', 'csv'],
                'default_format': ReportTemplate.Format.EXCEL,
                'include_charts': True,
                'chart_types': ['bar', 'line'],
                'is_system_template': True,
            },
            {
                'name': 'Network Inventory Report',
                'description': 'Complete inventory of all network devices and their configurations',
                'category': ReportTemplate.Category.INVENTORY,
                'data_sources': ['devices', 'device_types'],
                'filters': {
                    'active_only': True,
                    'device_types': []
                },
                'grouping': {
                    'group_by': 'device_type',
                    'sort_by': 'name'
                },
                'sorting': {
                    'primary': 'name',
                    'order': 'asc'
                },
                'supported_formats': ['pdf', 'excel', 'csv'],
                'default_format': ReportTemplate.Format.EXCEL,
                'include_charts': False,
                'chart_types': [],
                'is_system_template': True,
            },
            {
                'name': 'Bandwidth Usage Report',
                'description': 'Network bandwidth utilization and traffic analysis',
                'category': ReportTemplate.Category.BANDWIDTH,
                'data_sources': ['devices', 'bandwidth_metrics'],
                'filters': {
                    'usage_threshold': 80,
                    'device_types': []
                },
                'grouping': {
                    'group_by': 'device_type',
                    'sort_by': 'avg_usage'
                },
                'sorting': {
                    'primary': 'avg_usage',
                    'order': 'desc'
                },
                'supported_formats': ['pdf', 'excel', 'csv'],
                'default_format': ReportTemplate.Format.PDF,
                'include_charts': True,
                'chart_types': ['bar', 'line'],
                'is_system_template': True,
            },
        ]

        created_count = 0
        updated_count = 0

        for template_data in templates_data:
            template, created = ReportTemplate.objects.get_or_create(
                name=template_data['name'],
                defaults={
                    **template_data,
                    'created_by': admin_user,
                    'is_active': True,
                }
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Created template: {template.name}')
                )
            else:
                # Update existing template
                for key, value in template_data.items():
                    if key != 'name':  # Don't update the name
                        setattr(template, key, value)
                template.save()
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(f'📝 Updated template: {template.name}')
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'\n🎉 Report templates setup complete!'
                f'\n📊 Created: {created_count} new templates'
                f'\n📝 Updated: {updated_count} existing templates'
                f'\n📋 Total templates: {ReportTemplate.objects.count()}'
            )
        )

        # Display summary
        self.stdout.write('\n📋 Available Report Templates:')
        for template in ReportTemplate.objects.filter(is_active=True):
            self.stdout.write(
                f'  • {template.name} ({template.get_category_display()}) - {", ".join(template.supported_formats)}'
            )