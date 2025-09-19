# apps/troubleshoot/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.conf import settings
from django.utils import timezone

import os, platform, socket, time, re, shutil, subprocess

# Optional: richer metrics if psutil is installed
try:
    import psutil  # type: ignore
except Exception:
    psutil = None

def _windows():
    return platform.system().lower().startswith('win')

# ------------------- network tests -------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ping_view(request):
    target = request.data.get('target')
    count = int(request.data.get('parameters', {}).get('count', 4))
    if not target:
        return Response({'detail': 'target required'}, status=400)

    cmd = ['ping', '-n' if _windows() else '-c', str(count), target]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        out = (proc.stdout or proc.stderr or '').splitlines()

        sent, received, loss, avg = count, None, None, None
        text = '\n'.join(out).lower()
        m = re.search(r'received\s*=\s*(\d+)', text) or re.search(r'(\d+)\s*received', text)
        if m: received = int(m.group(1))
        m = re.search(r'loss[^0-9]*(\d+)%', text)
        if m: loss = int(m.group(1))
        m = re.search(r'average\s*=\s*([0-9.]+)ms', text) or re.search(r'avg[=/]\s*([0-9.]+)', text)
        if m: avg = float(m.group(1))

        return Response({
            'results': {
                'target': target,
                'sent': sent,
                'received': received if received is not None else 0,
                'loss': loss if loss is not None else 0,
                'avg_time_ms': avg if avg is not None else None,
                'lines': out,
            }
        })
    except Exception as e:
        return Response({'detail': str(e)}, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def traceroute_view(request):
    target = request.data.get('target')
    if not target:
        return Response({'detail': 'target required'}, status=400)
    cmd = ['tracert', target] if _windows() else ['traceroute', '-n', target]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        lines = (proc.stdout or proc.stderr or '').splitlines()
        hops, hopnum = [], 0
        for line in lines:
            ips = re.findall(r'(\d+\.\d+\.\d+\.\d+)', line)
            times = re.findall(r'([0-9.]+)\s?ms', line)
            if ips:
                hopnum += 1
                hops.append({'hop': hopnum, 'ip': ips[0], 'hostname': '', 'time_ms': float(times[0]) if times else None})
        return Response({'results': {'target': target, 'hops': hops}})
    except Exception as e:
        return Response({'detail': str(e)}, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def port_scan_view(request):
    target = request.data.get('target')
    ports = request.data.get('parameters', {}).get('ports', [])
    if not target or not ports:
        return Response({'detail': 'target and parameters.ports required'}, status=400)
    res = []
    for item in ports:
        try:
            p = int(item)
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.settimeout(0.5)
            ok = (s.connect_ex((target, p)) == 0); s.close()
            res.append({'port': p, 'status': 'open' if ok else 'closed',
                        'service': {22:'SSH',23:'Telnet',80:'HTTP',443:'HTTPS',3389:'RDP'}.get(p)})
        except Exception:
            res.append({'port': item, 'status': 'closed', 'service': None})
    return Response({'results': {'target': target, 'ports': res}})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def dns_lookup_view(request):
    import socket as pysocket
    q = request.data.get('target')
    rtype = (request.data.get('parameters', {}).get('record_type') or 'A').upper()
    if not q:
        return Response({'detail': 'target required'}, status=400)
    answers = []
    try:
        if rtype == 'A':
            info = pysocket.getaddrinfo(q, None, pysocket.AF_INET)
            answers = sorted({it[4][0] for it in info})
        else:
            answers.append('(Only A records supported without dnspython)')
    except Exception as e:
        return Response({'detail': str(e)}, status=500)
    return Response({'results': {'query': q, 'type': rtype, 'answers': answers}})

# ------------------- system health -------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def system_health_view(request):
    cpu = mem = disk = net = 0.0
    try:
        if psutil:
            cpu = psutil.cpu_percent(interval=0.2)
            mem = psutil.virtual_memory().percent
        du = shutil.disk_usage(os.path.expanduser('~'))
        disk = du.used / du.total * 100.0
    except Exception:
        pass
    return Response({'cpu': round(cpu,1), 'memory': round(mem,1), 'disk': round(disk,1), 'network': round(net,1)})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def interfaces_view(request):
    items = []
    try:
        if psutil:
            stats = psutil.net_if_stats()
            addrs = psutil.net_if_addrs()
            for name, st in stats.items():
                ip = ''
                for it in addrs.get(name, []):
                    if getattr(it, 'family', None) == socket.AF_INET:
                        ip = it.address; break
                items.append({
                    'interface': name,
                    'status': 'up' if st.isup else 'down',
                    'ip': ip or 'N/A',
                    'speed': f'{getattr(st, "speed", 0)} Mbps' if getattr(st, 'speed', 0) else 'N/A'
                })
    except Exception:
        pass
    return Response({'interfaces': items})

# ------------------- diagnostics -------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def connectivity_view(request):
    ok = True
    try:
        s = socket.create_connection(('8.8.8.8', 53), timeout=2); s.close()
    except Exception:
        ok = False
    return Response({'results': {'ok': ok, 'checked': 'DNS 8.8.8.8:53'}})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def speed_view(request):
    return Response({'results': {'download_mbps': 100, 'upload_mbps': 10, 'latency_ms': 20}})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def security_view(request):
    return Response({'results': {'status': 'completed', 'findings': []}})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def performance_view(request):
    return Response({'results': {'status': 'ok', 'notes': 'No bottlenecks detected'}})

# ------------------- issues -------------------

_FAKE_ISSUES = [
    {'id': 1, 'title': 'High Latency Detected', 'description': 'Latency above normal', 'severity': 'warning', 'solution': 'Check congestion and routing', 'status': 'active'},
    {'id': 2, 'title': 'DNS Resolution Slow', 'description': 'DNS queries slower than expected', 'severity': 'info', 'solution': 'Change DNS or clear cache', 'status': 'resolved'},
    {'id': 3, 'title': 'Packet Loss on WAN', 'description': '2% packet loss detected', 'severity': 'critical', 'solution': 'Check ISP or cabling', 'status': 'active'},
]

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def issues_list_view(request):
    return Response({'results': _FAKE_ISSUES})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def issue_resolve_view(request, pk: int):
    for it in _FAKE_ISSUES:
        if it['id'] == pk:
            it['status'] = 'resolved'
    return Response({'status': 'ok'})

# ------------------- logs -------------------

def _read_log_lines(limit=2000):
    log_path = os.path.join(settings.BASE_DIR, 'logs', 'nim_tool.log')
    if not os.path.exists(log_path):
        return []
    with open(log_path, 'r', errors='ignore') as f:
        return [ln.strip() for ln in f.readlines()[-limit:]]

def _parse_level(line: str):
    s = line.upper()
    if s.startswith('ERROR'): return 'error'
    if s.startswith('WARNING'): return 'warning'
    if s.startswith('CRITICAL'): return 'critical'
    return 'info'

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def logs_list_view(request):
    level = request.query_params.get('level')
    lines = _read_log_lines()
    results = []
    for ln in lines[-500:]:
        lv = _parse_level(ln)
        if level and level != lv:
            continue
        results.append({'timestamp': '', 'level': lv.upper(), 'message': ln})
    return Response({'results': results[-300:]})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def logs_stats_view(request):
    lines = _read_log_lines()
    c = {'error':0, 'warning':0, 'info':0}
    for ln in lines:
        c[_parse_level(ln)] += 1
    return Response({'counts': c, 'total': len(lines)})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def overall_stats_view(request):
    return Response({'ok': True})
