#!/usr/bin/env bash
set -euo pipefail

cd backend

# DB migrations & static files
python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Start Gunicorn on the port Railway provides
# (tweak workers/threads if you like)
exec gunicorn nim_backend.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers 3 \
  --threads 2 \
  --timeout 120
