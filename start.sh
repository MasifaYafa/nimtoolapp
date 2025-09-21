#!/usr/bin/env bash
set -euxo pipefail

# Always run from the repo root
cd "$(dirname "$0")"

# Backend lives here
cd backend

# Prefer python3, fallback to python
PY=${PYTHON_BIN:-$(command -v python3 || command -v python || true)}
if [ -z "${PY:-}" ]; then
  echo "❌ Python not found in PATH" >&2
  exit 1
fi

echo "✅ Using Python at: $PY"
"$PY" --version

# Run migrations & collect static
"$PY" manage.py migrate --noinput
"$PY" manage.py collectstatic --noinput

# Start Gunicorn
exec gunicorn nim_backend.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers ${GUNICORN_WORKERS:-3} \
  --threads ${GUNICORN_THREADS:-2} \
  --timeout ${GUNICORN_TIMEOUT:-120}
