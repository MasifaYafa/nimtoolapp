# backend/apps/devices/monitoring.py
"""
Real-time Device Monitoring Service
Automatically detects device status changes and generates alerts
"""

import logging
import threading
import time
from django.utils import timezone
from concurrent.futures import ThreadPoolExecutor
import subprocess
import platform
import socket

from .models import Device
from apps.alerts.models import Alert
from django.contrib.auth import get_user_model
from django.conf import settings

User = get_user_model()
logger = logging.getLogger(__name__)


class DeviceMonitoringService:
    def __init__(self):
        self.monitoring_active = False
        self.check_interval = int(getattr(settings, "DEVICE_MONITORING", {}).get("CHECK_INTERVAL", 300))
        self.ping_timeout = int(getattr(settings, "DEVICE_MONITORING", {}).get("PING_TIMEOUT", 5))
        self.monitor_thread = None

    # ---------------------- ping helpers ----------------------
    def perform_ping(self, ip_address, timeout=None, count=1):
        """Perform network ping to check device availability. Returns (is_online, response_time_ms, error_message)."""
        timeout = timeout or self.ping_timeout
        try:
            if not self.is_valid_ip(ip_address):
                return False, 0, "Invalid IP address format"

            system = platform.system().lower()
            if system == "windows":
                cmd = ["ping", "-n", str(count), "-w", str(timeout * 1000), ip_address]
            else:
                cmd = ["ping", "-c", str(count), "-W", str(timeout), ip_address]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 2)

            if result.returncode == 0:
                response_time = self.parse_ping_time(result.stdout, system) or 0.0
                return True, response_time, None
            else:
                return False, 0, self.parse_ping_error(result.stdout, result.stderr)
        except subprocess.TimeoutExpired:
            return False, 0, "Device not responding - timeout"
        except Exception as e:
            return False, 0, f"Network error: {str(e)}"

    @staticmethod
    def is_valid_ip(ip_address):
        try:
            socket.inet_aton(ip_address)
            return True
        except socket.error:
            return False

    @staticmethod
    def parse_ping_time(output, system):
        import re
        try:
            if system == "windows":
                m = re.search(r'time[<=](\d+)ms', output.lower())
                if m: return float(m.group(1))
            else:
                m = re.search(r'time=(\d+\.?\d*) ms', output.lower())
                if m: return float(m.group(1))
        except Exception:
            pass
        return None

    @staticmethod
    def parse_ping_error(stdout, stderr):
        text = (stdout + " " + stderr).lower()
        if "destination host unreachable" in text:
            return "Host unreachable"
        if "request timeout" in text:
            return "Request timeout - device offline"
        return "Device is offline"

    # ---------------------- alert helpers ----------------------
    def _find_active_offline_alert(self, device):
        return Alert.objects.filter(
            device=device,
            status=Alert.Status.ACTIVE,
            metric_name="device_status",
            current_value="offline",
        ).first()

    def _create_or_bump_offline_alert(self, device, error_message=None):
        # Deduplicate: reuse active offline alert if it exists
        existing = self._find_active_offline_alert(device)
        if existing:
            existing.occurrence_count += 1
            existing.last_occurred = timezone.now()
            existing.save(update_fields=["occurrence_count", "last_occurred"])
            return existing

        return Alert.objects.create(
            title=f"Device Offline: {device.name}",
            message="This device is offline.",
            severity=Alert.Severity.CRITICAL if device.device_type and "server" in device.device_type.name.lower() else Alert.Severity.WARNING,
            device=device,
            metric_name="device_status",
            current_value="offline",
            threshold_value=None,
        )

    def _resolve_offline_alerts_if_any(self, device, resolved_by=None):
        active = self._find_active_offline_alert(device)
        if active:
            active.resolve(resolved_by or getattr(device, "created_by", None), note="Device is back online")
            return active
        return None

    # ---------------------- core monitoring ----------------------
    def monitor_device(self, device):
        """Monitor a single device and detect status changes."""
        try:
            is_online, response_time, error_message = self.perform_ping(device.ip_address)

            old_status = device.status
            new_status = Device.Status.ONLINE if is_online else Device.Status.OFFLINE

            # IMPORTANT: keep last_seen accurate
            if is_online:
                device.last_seen = timezone.now()
                device.response_time = response_time
            else:
                device.response_time = None

            status_changed = old_status != new_status
            device.status = new_status
            device.save()

            # Alerts:
            if new_status == Device.Status.OFFLINE:
                self._create_or_bump_offline_alert(device, error_message)
            else:  # back online
                self._resolve_offline_alerts_if_any(device)

            if status_changed:
                logger.info(f"Device {device.name} status changed: {old_status} -> {new_status}")

            return {
                "device_id": device.id,
                "name": device.name,
                "ip_address": device.ip_address,
                "old_status": old_status,
                "new_status": new_status,
                "status_changed": status_changed,
                "response_time": response_time,
                "error_message": error_message,
            }

        except Exception as e:
            logger.error(f"Error monitoring device {device.name}: {str(e)}")
            return None

    def monitor_all_devices(self):
        """Monitor all enabled devices concurrently."""
        try:
            devices = list(Device.objects.filter(monitoring_enabled=True))
            if not devices:
                logger.info("No devices configured for monitoring")
                return []

            results = []
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = {executor.submit(self.monitor_device, d): d for d in devices}
                for f in futures:
                    try:
                        r = f.result(timeout=30)
                        if r: results.append(r)
                    except Exception as e:
                        logger.error(f"Exception monitoring device {futures[f].name}: {e}")

            return results
        except Exception as e:
            logger.error(f"Error in monitor_all_devices: {e}")
            return []

    def monitoring_loop(self):
        """Continuous monitoring loop that runs in a separate thread."""
        self.monitoring_active = True
        logger.info(f"Device monitoring started - interval {self.check_interval}s")

        while self.monitoring_active:
            try:
                self.monitor_all_devices()
                for _ in range(self.check_interval):
                    if not self.monitoring_active:
                        break
                    time.sleep(1)
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                time.sleep(60)

        logger.info("Monitoring loop ended")

    def start_monitoring(self):
        if self.monitoring_active:
            logger.warning("Monitoring already active")
            return
        self.monitor_thread = threading.Thread(target=self.monitoring_loop, daemon=True)
        self.monitor_thread.start()
        logger.info("Monitoring service started in background thread")

    def stop_monitoring(self):
        self.monitoring_active = False
        if self.monitor_thread and self.monitor_thread.is_alive():
            logger.info("Stopping monitoring service...")
            self.monitor_thread.join(timeout=10)
        logger.info("Device monitoring stopped")

    def is_monitoring_active(self):
        return self.monitoring_active and self.monitor_thread and self.monitor_thread.is_alive()

    def get_monitoring_status(self):
        return {
            "active": self.is_monitoring_active(),
            "check_interval": self.check_interval,
            "ping_timeout": self.ping_timeout,
            "thread_alive": self.is_monitoring_active(),
        }


# Global instance
monitoring_service = DeviceMonitoringService()
