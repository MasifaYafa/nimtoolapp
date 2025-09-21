#!/usr/bin/env bash
set -euo pipefail

# pick whichever python is available (python or python3)
if command -v python >/dev/null 2>&1; then
  PY=python
elif command -v python3 >/dev/null 2>&1; then
  PY=python3
else
  echo "❌ Neither python nor python3 found on PATH."
  exit 1
fi

cd backend

# DB migrations & static files
$PY manage.py migrate --noinput
$PY manage.py collectstatic --noinput

# Start Gunicorn (PORT is provided by Railway)
exec gunicorn nim_backend.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers 3 \
  --threads 2 \
  --timeout 120
