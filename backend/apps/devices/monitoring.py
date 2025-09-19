# backend/apps/devices/monitoring.py
"""
Real-time Device Monitoring Service
Automatically detects device status changes and generates alerts
"""

import logging
import threading
import time
from datetime import datetime, timedelta
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from concurrent.futures import ThreadPoolExecutor
import subprocess
import platform
import socket
from .models import Device
from apps.alerts.models import Alert, AlertRule
from django.contrib.auth import get_user_model

User = get_user_model()

logger = logging.getLogger(__name__)


class DeviceMonitoringService:
    def __init__(self):
        self.monitoring_active = False
        self.check_interval = 300  # 5 minutes default
        self.ping_timeout = 5
        self.monitor_thread = None

    def perform_ping(self, ip_address, timeout=3, count=1):
        """
        Perform network ping to check device availability
        Returns: (is_online, response_time, error_message)
        """
        try:
            if not self.is_valid_ip(ip_address):
                return False, 0, "Invalid IP address format"

            system = platform.system().lower()
            if system == "windows":
                cmd = ["ping", "-n", str(count), "-w", str(timeout * 1000), ip_address]
            else:
                cmd = ["ping", "-c", str(count), "-W", str(timeout), ip_address]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout + 2
            )

            if result.returncode == 0:
                response_time = self.parse_ping_time(result.stdout, system)
                return True, response_time or 0, None
            else:
                error_msg = self.parse_ping_error(result.stdout, result.stderr)
                return False, 0, error_msg

        except subprocess.TimeoutExpired:
            return False, 0, "Device not responding - timeout"
        except Exception as e:
            return False, 0, f"Network error: {str(e)}"

    def is_valid_ip(self, ip_address):
        """Validate IP address format"""
        try:
            socket.inet_aton(ip_address)
            return True
        except socket.error:
            return False

    def parse_ping_time(self, output, system):
        """Extract ping response time from command output"""
        import re
        try:
            if system == "windows":
                match = re.search(r'time[<=](\d+)ms', output.lower())
                if match:
                    return float(match.group(1))
            else:
                match = re.search(r'time=(\d+\.?\d*) ms', output.lower())
                if match:
                    return float(match.group(1))
        except Exception:
            pass
        return None

    def parse_ping_error(self, stdout, stderr):
        """Parse ping error messages"""
        error_text = (stdout + " " + stderr).lower()
        if "destination host unreachable" in error_text:
            return "Host unreachable"
        elif "request timeout" in error_text:
            return "Request timeout - device offline"
        else:
            return "Device is offline"

    def monitor_device(self, device):
        """Monitor a single device and detect status changes"""
        try:
            # Perform ping check
            is_online, response_time, error_message = self.perform_ping(device.ip_address)

            # Determine new status
            new_status = 'online' if is_online else 'offline'
            old_status = device.status

            # Update device in database
            device.last_ping = timezone.now()
            device.response_time = response_time if is_online else None

            # Check if status changed
            status_changed = old_status != new_status

            if status_changed:
                device.status = new_status
                device.save()

                # Generate alert for status change
                self.generate_status_alert(device, old_status, new_status, error_message)

                logger.info(f"Device {device.name} status changed: {old_status} -> {new_status}")
            else:
                device.save()

            return {
                'device_id': device.id,
                'name': device.name,
                'ip_address': device.ip_address,
                'old_status': old_status,
                'new_status': new_status,
                'status_changed': status_changed,
                'response_time': response_time,
                'error_message': error_message
            }

        except Exception as e:
            logger.error(f"Error monitoring device {device.name}: {str(e)}")
            return None

    def generate_status_alert(self, device, old_status, new_status, error_message):
        """Generate alert when device status changes"""
        try:
            # Determine alert severity
            if new_status == 'offline':
                severity = 'critical' if device.device_type and 'server' in device.device_type.name.lower() else 'warning'
                title = f"Device Offline: {device.name}"
                message = f"Device {device.name} ({device.ip_address}) has gone offline."
                if error_message:
                    message += f" Error: {error_message}"
            else:  # Coming back online
                severity = 'info'
                title = f"Device Online: {device.name}"
                message = f"Device {device.name} ({device.ip_address}) is now online and responding."

            # Create alert
            alert = Alert.objects.create(
                title=title,
                message=message,
                severity=severity,
                device=device,
                metric_name='device_status',
                current_value=new_status,
                threshold_value=old_status
            )

            # Send notifications
            self.send_alert_notifications(alert, device, new_status)

            logger.info(f"Alert created for {device.name}: {title}")

        except Exception as e:
            logger.error(f"Error generating alert for {device.name}: {str(e)}")

    def send_alert_notifications(self, alert, device, status):
        """Send email/SMS notifications for device status changes"""
        try:
            # Get administrators and users who should be notified
            admin_users = User.objects.filter(
                is_staff=True,
                is_active=True,
                email__isnull=False
            ).exclude(email='')

            # Prepare email content
            subject = f"NIM-Tool Alert: {device.name} is {status.upper()}"

            if status == 'offline':
                email_body = f"""
Device Alert - OFFLINE

Device Name: {device.name}
IP Address: {device.ip_address}
Status: OFFLINE
Time: {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}
Location: {device.location or 'Not specified'}

The device has stopped responding to network requests. 
Please check the device connectivity and power status.

Alert Details:
- Alert ID: {alert.id}
- Severity: {alert.severity.upper()}
- Message: {alert.message}

This is an automated alert from NIM-Tool Network Monitoring System.
                """
            else:
                email_body = f"""
Device Alert - ONLINE

Device Name: {device.name}
IP Address: {device.ip_address}
Status: ONLINE
Time: {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}
Response Time: {device.response_time}ms
Location: {device.location or 'Not specified'}

The device has come back online and is responding normally.

Alert Details:
- Alert ID: {alert.id}
- Severity: {alert.severity.upper()}
- Message: {alert.message}

This is an automated alert from NIM-Tool Network Monitoring System.
                """

            # Send emails to administrators
            recipient_emails = [user.email for user in admin_users]

            if recipient_emails:
                try:
                    send_mail(
                        subject=subject,
                        message=email_body,
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=recipient_emails,
                        fail_silently=False,
                    )
                    logger.info(
                        f"Email notifications sent for {device.name} status change to {len(recipient_emails)} recipients")

                    # Update alert notification status
                    alert.email_sent = True
                    alert.notification_count = len(recipient_emails)
                    alert.save()

                except Exception as e:
                    logger.error(f"Failed to send email notifications: {str(e)}")

            # TODO: Implement SMS notifications if needed
            # This would require integration with SMS service like Twilio

        except Exception as e:
            logger.error(f"Error sending notifications for {device.name}: {str(e)}")

    def monitor_all_devices(self):
        """Monitor all devices using threading for concurrency"""
        try:
            # Get all devices that have monitoring enabled
            devices = list(Device.objects.filter(monitoring_enabled=True))

            if not devices:
                logger.info("No devices configured for monitoring")
                return []

            logger.info(f"Starting monitoring check for {len(devices)} devices")

            # Monitor devices using ThreadPoolExecutor for concurrent execution
            results = []
            with ThreadPoolExecutor(max_workers=10) as executor:
                # Submit monitoring tasks for each device
                future_to_device = {
                    executor.submit(self.monitor_device, device): device
                    for device in devices
                }

                # Collect results as they complete
                for future in future_to_device:
                    try:
                        result = future.result(timeout=30)  # 30 second timeout per device
                        if result:
                            results.append(result)
                    except Exception as e:
                        device = future_to_device[future]
                        logger.error(f"Exception monitoring device {device.name}: {str(e)}")

            # Log summary
            status_changes = [r for r in results if r['status_changed']]
            if status_changes:
                logger.info(f"Monitoring completed: {len(status_changes)} devices changed status")
                for change in status_changes:
                    logger.info(f"  {change['name']}: {change['old_status']} -> {change['new_status']}")
            else:
                logger.info("Monitoring completed: No status changes detected")

            return results

        except Exception as e:
            logger.error(f"Error in monitor_all_devices: {str(e)}")
            return []

    def monitoring_loop(self):
        """Continuous monitoring loop that runs in a separate thread"""
        self.monitoring_active = True
        logger.info(f"Device monitoring started - checking every {self.check_interval} seconds")

        while self.monitoring_active:
            try:
                self.monitor_all_devices()

                # Sleep in small intervals so we can check if monitoring should stop
                sleep_time = 0
                while sleep_time < self.check_interval and self.monitoring_active:
                    time.sleep(1)
                    sleep_time += 1

            except KeyboardInterrupt:
                logger.info("Monitoring interrupted by user")
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {str(e)}")
                time.sleep(60)  # Wait 1 minute before retrying

        logger.info("Monitoring loop ended")

    def start_monitoring(self):
        """Start the monitoring service in a background thread"""
        if self.monitoring_active:
            logger.warning("Monitoring is already active")
            return

        self.monitor_thread = threading.Thread(target=self.monitoring_loop, daemon=True)
        self.monitor_thread.start()
        logger.info("Monitoring service started in background thread")

    def stop_monitoring(self):
        """Stop the monitoring service"""
        self.monitoring_active = False

        if self.monitor_thread and self.monitor_thread.is_alive():
            logger.info("Stopping monitoring service...")
            self.monitor_thread.join(timeout=10)  # Wait up to 10 seconds

        logger.info("Device monitoring stopped")

    def is_monitoring_active(self):
        """Check if monitoring is currently active"""
        return self.monitoring_active and (
                self.monitor_thread is not None and self.monitor_thread.is_alive()
        )

    def get_monitoring_status(self):
        """Get detailed monitoring status information"""
        return {
            'active': self.is_monitoring_active(),
            'check_interval': self.check_interval,
            'ping_timeout': self.ping_timeout,
            'thread_alive': self.monitor_thread is not None and self.monitor_thread.is_alive() if self.monitor_thread else False
        }


# Global monitoring service instance
monitoring_service = DeviceMonitoringService()