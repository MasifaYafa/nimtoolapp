#!/usr/bin/env bash
set -euxo pipefail

cd backend

PY=${PYTHON_BIN:-$(command -v python3 || command -v python || true)}
if [ -z "${PY:-}" ]; then
  echo "❌ Python not found in PATH" >&2
  exit 1
fi

"$PY" --version

"$PY" manage.py migrate --noinput
"$PY" manage.py collectstatic --noinput

exec gunicorn nim_backend.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers ${GUNICORN_WORKERS:-3} \
  --threads ${GUNICORN_THREADS:-2} \
  --timeout ${GUNICORN_TIMEOUT:-120}
