"""
APScheduler configuration: runs AI agents on day 10 of each month.
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

logger = logging.getLogger(__name__)


def create_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler()

    # Payment check agent: day 10, 9:00 AM
    scheduler.add_job(
        _run_payment_check,
        CronTrigger(day=10, hour=9, minute=0),
        id="payment_check",
        name="Monthly Payment Check",
        replace_existing=True,
    )

    # Monthly summary agent: day 10, 10:00 AM
    scheduler.add_job(
        _run_monthly_summary,
        CronTrigger(day=10, hour=10, minute=0),
        id="monthly_summary",
        name="Monthly Summary Report",
        replace_existing=True,
    )

    return scheduler


def _run_payment_check():
    logger.info("Running payment check agent...")
    try:
        from agents.payment_check import run_payment_check_agent
        run_payment_check_agent()
    except Exception as e:
        logger.error(f"Payment check agent failed: {e}")


def _run_monthly_summary():
    logger.info("Running monthly summary agent...")
    try:
        from agents.monthly_summary import run_monthly_summary_agent
        run_monthly_summary_agent()
    except Exception as e:
        logger.error(f"Monthly summary agent failed: {e}")
