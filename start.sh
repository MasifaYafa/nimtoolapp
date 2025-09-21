#!/usr/bin/env bash
set -euxo pipefail

# --- Build React (production) ---
npm ci --prefix frontend
npm run build --prefix frontend

# --- Django steps ---
cd backend

# Prefer Railway's venv python; fall back to system python3/python
PY=${PYTHON_BIN:-/app/.venv/bin/python}
if [ ! -x "$PY" ]; then
  PY=$(command -v python3 || command -v python)
fi
echo "✅ Using Python at: $PY"
"$PY" --version

"$PY" manage.py migrate --noinput
"$PY" manage.py collectstatic --noinput

exec gunicorn nim_backend.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers ${GUNICORN_WORKERS:-3} \
  --threads ${GUNICORN_THREADS:-2} \
  --timeout ${GUNICORN_TIMEOUT:-120}
