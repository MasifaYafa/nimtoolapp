#!/usr/bin/env bash
set -euxo pipefail

# --- build the React app if present (optional; no-op if no Node) ---
# Skipped here since you already commit build/, but leaving placeholder.

# --- Django startup ---
cd backend

PY=${PYTHON_BIN:-$(command -v python3 || command -v python || true)}
if [ -z "${PY:-}" ]; then
  echo "❌ Python not found in PATH" >&2
  exit 1
fi

echo "✅ Using Python at: $PY"
"$PY" --version

# Apply migrations & collect static
"$PY" manage.py migrate --noinput
"$PY" manage.py collectstatic --noinput

# Create a superuser if it doesn't exist (uses env vars)
# Works with custom AUTH_USER_MODEL too.
"$PY" manage.py shell -c "
from django.contrib.auth import get_user_model
import os
User = get_user_model()
u = os.environ.get('DJANGO_SUPERUSER_USERNAME')
p = os.environ.get('DJANGO_SUPERUSER_PASSWORD')
e = os.environ.get('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')
if u and p:
    if not User.objects.filter(username=u).exists():
        User.objects.create_superuser(username=u, email=e, password=p)
        print(f'✅ Created superuser {u}')
    else:
        print(f'ℹ️ Superuser {u} already exists')
else:
    print('⚠️ Skipping superuser creation (missing DJANGO_SUPERUSER_* env vars)')
"

# Run Gunicorn
exec gunicorn nim_backend.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers ${GUNICORN_WORKERS:-3} \
  --threads ${GUNICORN_THREADS:-2} \
  --timeout ${GUNICORN_TIMEOUT:-120}
