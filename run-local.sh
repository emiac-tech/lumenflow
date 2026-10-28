#!/bin/bash
# LumenFlow local runner. Backend :8000 (FastAPI), Frontend :3000 (Next.js dev).
# NOTE: uses the DATABASE_URL in .env = LIVE database (same as os1.risewithai.io).
set -e
cd "$(dirname "$0")"
PY=/Users/sujeet/.aside/runtime/python/runtime/bin/python3
NODE_BIN=/Users/sujeet/.aside/runtime/bin
command -v brew >/dev/null 2>&1 && [ -x "$(brew --prefix 2>/dev/null)/bin/python3" ] && PY="$(brew --prefix)/bin/python3"
export PATH="$NODE_BIN:$PATH"

if [ ! -x venv/bin/uvicorn ]; then
  echo "== Creating Python env (first run only)"
  "$PY" -m venv venv
  venv/bin/python -m pip install -q --upgrade pip
  venv/bin/pip install -q -r requirements-lock.txt
fi
venv/bin/python -c "import fastapi, pydantic_core, psycopg2, fitz, bcrypt, PIL" || { echo "Python packages failed to load"; exit 1; }

if [ ! -f frontend/node_modules/next/package.json ] || [ ! -f frontend/node_modules/.package-lock.json ]; then
  echo "== Installing frontend packages (first run only)"
  (cd frontend && npm ci --no-audit --no-fund)
fi

echo "== Starting backend on http://localhost:8000 (log: local-backend.log)"
venv/bin/uvicorn api:app --host 127.0.0.1 --port 8000 > local-backend.log 2>&1 &
BACK=$!
trap 'echo; echo "Stopping..."; kill $BACK 2>/dev/null' EXIT
sleep 4
curl -s -o /dev/null -w "backend /api/settings/public -> %{http_code}\n" http://127.0.0.1:8000/api/settings/public || true

echo "== Starting frontend on http://localhost:3000  (Ctrl+C to stop both)"
cd frontend && API_URL=http://127.0.0.1:8000 npx next dev -p 3000
