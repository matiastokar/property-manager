#!/bin/bash
# Property Manager — start backend + frontend
# Usage: ./start.sh
#
#Sincroniza todo el código fuente del backend al /tmp/pm_backend/ (necesario por la restricción de sandbox)
#Restaura la DB desde el proyecto al /tmp si la copia del proyecto es más nueva
#Mata cualquier proceso que ya esté usando los puertos 8000 / 5173
#Inicia el backend (FastAPI en puerto 8000) y espera a que esté listo
#Inicia el frontend (Vite en puerto 5173)
#Ctrl+C detiene ambos servidores limpiamente


set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_SRC="$PROJECT_DIR/backend"
TMP_BACKEND="/tmp/pm_backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
NODE="/usr/local/bin/node"
NPM="/usr/local/bin/npm"
PYTHON="python3"

# ── colours ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[start]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── sync backend source to /tmp ─────────────────────────────────────────────────
info "Syncing backend source → $TMP_BACKEND"
mkdir -p "$TMP_BACKEND/routers" "$TMP_BACKEND/agents"

for f in main.py database.py models.py scheduler.py requirements.txt auth_utils.py; do
  [ -f "$BACKEND_SRC/$f" ] && cp "$BACKEND_SRC/$f" "$TMP_BACKEND/$f"
done

# Copy .env so agents can find their API keys
[ -f "$PROJECT_DIR/.env" ] && cp "$PROJECT_DIR/.env" "$TMP_BACKEND/.env"

for f in "$BACKEND_SRC/routers/"*.py; do
  [ -f "$f" ] && cp "$f" "$TMP_BACKEND/routers/"
done

for f in "$BACKEND_SRC/agents/"*.py; do
  [ -f "$f" ] && cp "$f" "$TMP_BACKEND/agents/"
done 2>/dev/null || true

# ── sync DB: project → /tmp if project copy is newer ───────────────────────────
PROJECT_DB="$BACKEND_SRC/property_manager.db"
TMP_DB="$TMP_BACKEND/property_manager.db"

if [ -f "$PROJECT_DB" ]; then
  if [ ! -f "$TMP_DB" ] || [ "$PROJECT_DB" -nt "$TMP_DB" ]; then
    info "Restoring DB from project copy"
    cp "$PROJECT_DB" "$TMP_DB"
  else
    info "Using existing /tmp DB (up to date)"
  fi
fi

# ── load .env if present ───────────────────────────────────────────────────────
ENV_FILE="$PROJECT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  info "Loading environment from .env"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  warn ".env not found — agents (email/AI) won't work. Copy .env.example → .env and fill in your keys."
fi

# ── kill any processes already on ports 8000 / 5173 ───────────────────────────
for PORT in 8000 5173; do
  PID=$(lsof -ti tcp:$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    warn "Killing existing process on port $PORT (PID $PID)"
    kill -9 $PID 2>/dev/null || true
    sleep 0.5
  fi
done

# ── start backend ───────────────────────────────────────────────────────────────
info "Starting backend on http://localhost:8000"

SITE_PACKAGES="/Users/matias/Library/Python/3.9/lib/python/site-packages"

$PYTHON - <<'PYEOF' &
import os, sys
os.chdir('/tmp')
B = '/tmp/pm_backend'
S = '/Users/matias/Library/Python/3.9/lib/python/site-packages'
sys.path = [B, S] + [p for p in sys.path if p and p != B and p != S]
import uvicorn
from main import app
uvicorn.run(app, host='0.0.0.0', port=8000, loop='asyncio', http='h11')
PYEOF

BACKEND_PID=$!
echo $BACKEND_PID > /tmp/pm_backend.pid
info "Backend PID: $BACKEND_PID"

# ── wait for backend to be ready ───────────────────────────────────────────────
info "Waiting for backend..."
for i in $(seq 1 20); do
  if curl -s http://localhost:8000/api/properties/ > /dev/null 2>&1; then
    info "Backend ready ✓"
    break
  fi
  sleep 0.5
done

# ── start frontend ──────────────────────────────────────────────────────────────
info "Starting frontend on http://localhost:5173"
cd "$FRONTEND_DIR"
$NPM run dev &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/pm_frontend.pid
info "Frontend PID: $FRONTEND_PID"

# ── summary ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}Backend  →${NC}  http://localhost:8000"
echo -e "  ${GREEN}Frontend →${NC}  http://localhost:5173"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop both servers"
echo ""

# ── wait / cleanup on Ctrl+C ───────────────────────────────────────────────────
trap 'echo ""; info "Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT TERM

wait
