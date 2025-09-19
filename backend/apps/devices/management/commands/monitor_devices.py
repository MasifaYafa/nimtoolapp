# backend/apps/devices/management/commands/monitor_devices.py
"""
Django management command to start device monitoring service
Usage: python manage.py monitor_devices
"""

import time
import signal
import sys
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.devices.monitoring import monitoring_service


class Command(BaseCommand):
    help = 'Start the device monitoring service'

    def add_arguments(self, parser):
        parser.add_argument(
            '--interval',
            type=int,
            default=300,
            help='Monitoring interval in seconds (default: 300 = 5 minutes)',
        )
        parser.add_argument(
            '--timeout',
            type=int,
            default=5,
            help='Ping timeout in seconds (default: 5)',
        )
        parser.add_argument(
            '--single-run',
            action='store_true',
            help='Run monitoring once and exit (for testing)',
        )

    def handle(self, *args, **options):
        # Set monitoring configuration
        monitoring_service.check_interval = options['interval']
        monitoring_service.ping_timeout = options['timeout']

        self.stdout.write("Starting NIM-Tool Device Monitoring Service...")
        self.stdout.write(f"Monitoring interval: {options['interval']} seconds")

        # Setup signal handlers for graceful shutdown
        def signal_handler(signum, frame):
            self.stdout.write("\nReceived interrupt signal. Stopping monitoring...")
            monitoring_service.stop_monitoring()
            self.stdout.write("Monitoring service stopped.")
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        try:
            if options['single_run']:
                # Run monitoring once for testing
                self.stdout.write("Running single monitoring check...")
                results = monitoring_service.monitor_all_devices()

                self.stdout.write(f"Monitoring completed. Checked {len(results)} devices.")

                # Display results
                for result in results:
                    if result['status_changed']:
                        self.stdout.write(
                            f"  {result['name']}: {result['old_status']} -> {result['new_status']}"
                        )
                    else:
                        self.stdout.write(
                            f"  {result['name']}: {result['new_status']} (no change)"
                        )

                self.stdout.write("Single run completed.")

            else:
                # Start continuous monitoring
                self.stdout.write("Device monitoring started successfully!")
                self.stdout.write("Press Ctrl+C to stop monitoring")

                # Start monitoring in main thread (will use background threads internally)
                monitoring_service.monitoring_loop()

        except KeyboardInterrupt:
            self.stdout.write("\nMonitoring stopped by user.")
        except Exception as e:
            self.stderr.write(f"Error starting monitoring service: {str(e)}")
            sys.exit(1)