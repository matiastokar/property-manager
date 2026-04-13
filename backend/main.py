import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load .env from /tmp/pm_backend/ first, then fall back to the project source dir
_env_candidates = [
    Path(__file__).parent / ".env",                                    # /tmp/pm_backend/.env
    Path(__file__).parent.parent / ".env",                             # one level up
    Path("/Users/matias/Documents/Claude/Projects/property-manager/.env"),  # project root
]
for _env_path in _env_candidates:
    if _env_path.exists():
        load_dotenv(_env_path, override=True)   # override=True so .env wins over empty shell vars
        break

from database import engine, SessionLocal
import models
from routers import properties, contracts, expenses, incidents, rents, dashboard, recurring
from routers import auth, bank_imports, utilities
from auth_utils import get_current_user, hash_password
from scheduler import create_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create all tables
models.Base.metadata.create_all(bind=engine)


def seed_default_user():
    """Create default admin user if no users exist."""
    db = SessionLocal()
    try:
        if db.query(models.User).count() == 0:
            user = models.User(
                username="admin",
                hashed_password=hash_password("admin123"),
                is_active=True,
            )
            db.add(user)
            db.commit()
            logger.info("Default user created: admin / admin123")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_default_user()
    scheduler = create_scheduler()
    scheduler.start()
    logger.info("Scheduler started — agents will run on day 10 of each month.")
    yield
    scheduler.shutdown()
    logger.info("Scheduler stopped.")


app = FastAPI(
    title="Property Manager API",
    description="Sistema de gestión de propiedades y rentas",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth router (public — no token required)
app.include_router(auth.router)

# Protected routers
protected = {"dependencies": [Depends(get_current_user)]}
app.include_router(properties.router, **protected)
app.include_router(contracts.router, **protected)
app.include_router(expenses.router, **protected)
app.include_router(incidents.router, **protected)
app.include_router(rents.router, **protected)
app.include_router(dashboard.router, **protected)
app.include_router(recurring.router, **protected)
app.include_router(bank_imports.router, **protected)
app.include_router(utilities.router, **protected)


@app.get("/")
def root():
    return {"message": "Property Manager API", "version": "1.0.0"}


def _check_agent_config():
    """Raise HTTPException with a clear message if required env vars are missing."""
    missing = []
    if not os.getenv("ANTHROPIC_API_KEY"):
        missing.append("ANTHROPIC_API_KEY")
    if not os.getenv("GMAIL_USER"):
        missing.append("GMAIL_USER")
    if not os.getenv("GMAIL_APP_PASSWORD"):
        missing.append("GMAIL_APP_PASSWORD")
    if missing:
        raise HTTPException(
            status_code=503,
            detail=(
                f"El agente no puede ejecutarse porque faltan variables de entorno: "
                f"{', '.join(missing)}. "
                f"Configurá el archivo .env en la raíz del proyecto y reiniciá el servidor."
            ),
        )


@app.get("/api/agents/run-payment-check")
def trigger_payment_check():
    """Manually trigger the payment check agent."""
    _check_agent_config()
    try:
        from agents.payment_check import run_payment_check_agent
        run_payment_check_agent()
        return {"message": "Agente de verificación de pagos ejecutado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al ejecutar el agente: {e}")


@app.get("/api/agents/run-monthly-summary")
def trigger_monthly_summary():
    """Manually trigger the monthly summary agent."""
    _check_agent_config()
    try:
        from agents.monthly_summary import run_monthly_summary_agent
        run_monthly_summary_agent()
        return {"message": "Agente de resumen mensual ejecutado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al ejecutar el agente: {e}")
