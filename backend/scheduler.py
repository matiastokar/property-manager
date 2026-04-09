"""
APScheduler configuration: runs AI agents on day 10 of each month.
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

logger = logging.getLogger(__name__)


def create_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler()

    # Recurring expenses: day 1 of each month, 8:00 AM
    scheduler.add_job(
        _run_recurring_expenses,
        CronTrigger(day=1, hour=8, minute=0),
        id="recurring_expenses",
        name="Monthly Recurring Expenses",
        replace_existing=True,
    )

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


def _run_recurring_expenses():
    logger.info("Creating recurring expenses for this month...")
    try:
        from datetime import date
        from database import SessionLocal
        import models

        db = SessionLocal()
        today = date.today()
        month, year = today.month, today.year

        recurring = db.query(models.RecurringExpense).filter(
            models.RecurringExpense.active == True
        ).all()

        created = 0
        for rec in recurring:
            # Check not already created this month
            exists = db.query(models.Expense).filter(
                models.Expense.property_id == rec.property_id,
                models.Expense.category == rec.category,
                models.Expense.amount == rec.amount,
                models.Expense.expense_date >= date(year, month, 1),
                models.Expense.expense_date <= date(year, month, 28),
            ).first()
            if not exists:
                expense = models.Expense(
                    property_id=rec.property_id,
                    expense_type=rec.expense_type,
                    category=rec.category,
                    amount=rec.amount,
                    currency=rec.currency,
                    description=f"{rec.description} — {month}/{year} (automático)",
                    expense_date=date(year, month, 1),
                )
                db.add(expense)
                created += 1

        db.commit()
        db.close()
        logger.info(f"Recurring expenses: {created} created for {month}/{year}")
    except Exception as e:
        logger.error(f"Recurring expenses job failed: {e}")


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
