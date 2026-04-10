import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import engine, SessionLocal
import models
from routers import properties, contracts, expenses, incidents, rents, dashboard, recurring
from routers import auth, bank_imports
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


@app.get("/")
def root():
    return {"message": "Property Manager API", "version": "1.0.0"}


@app.get("/api/agents/run-payment-check")
def trigger_payment_check():
    """Manually trigger the payment check agent."""
    from agents.payment_check import run_payment_check_agent
    run_payment_check_agent()
    return {"message": "Payment check agent executed"}


@app.get("/api/agents/run-monthly-summary")
def trigger_monthly_summary():
    """Manually trigger the monthly summary agent."""
    from agents.monthly_summary import run_monthly_summary_agent
    run_monthly_summary_agent()
    return {"message": "Monthly summary agent executed"}
