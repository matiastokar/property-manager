from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import date, datetime

from database import get_db
import models

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_summary(db: Session = Depends(get_db)):
    now = datetime.now()
    current_month = now.month
    current_year = now.year

    total_properties = db.query(func.count(models.Property.id)).scalar()
    active_contracts = db.query(func.count(models.Contract.id)).filter(
        models.Contract.status == models.ContractStatus.ACTIVE
    ).scalar()
    open_incidents = db.query(func.count(models.Incident.id)).filter(
        models.Incident.status != models.IncidentStatus.RESOLVED
    ).scalar()

    # Monthly income (current month)
    monthly_income = {}
    payments = db.query(models.RentPayment).filter(
        models.RentPayment.period_year == current_year,
        models.RentPayment.period_month == current_month
    ).all()
    for p in payments:
        currency = p.currency.value
        monthly_income[currency] = monthly_income.get(currency, 0) + p.amount

    # Monthly expenses (current month)
    monthly_expenses = {}
    expenses = db.query(models.Expense).filter(
        extract('year', models.Expense.expense_date) == current_year,
        extract('month', models.Expense.expense_date) == current_month
    ).all()
    for e in expenses:
        currency = e.currency.value
        monthly_expenses[currency] = monthly_expenses.get(currency, 0) + e.amount

    return {
        "total_properties": total_properties,
        "active_contracts": active_contracts,
        "open_incidents": open_incidents,
        "monthly_income": monthly_income,
        "monthly_expenses": monthly_expenses,
        "current_month": current_month,
        "current_year": current_year,
    }


@router.get("/property/{property_id}/performance")
def get_property_performance(property_id: int, year: int = None, db: Session = Depends(get_db)):
    if year is None:
        year = datetime.now().year

    prop = db.query(models.Property).filter(models.Property.id == property_id).first()
    if not prop:
        return {"error": "Property not found"}

    # Income by month
    monthly_data = []
    for month in range(1, 13):
        income_by_currency = {}
        payments = db.query(models.RentPayment).join(models.Contract).filter(
            models.Contract.property_id == property_id,
            models.RentPayment.period_year == year,
            models.RentPayment.period_month == month
        ).all()
        for p in payments:
            cur = p.currency.value
            income_by_currency[cur] = income_by_currency.get(cur, 0) + p.amount

        expense_by_type = {"fixed": {}, "variable": {}}
        expenses = db.query(models.Expense).filter(
            models.Expense.property_id == property_id,
            extract('year', models.Expense.expense_date) == year,
            extract('month', models.Expense.expense_date) == month
        ).all()
        for e in expenses:
            etype = e.expense_type.value
            cur = e.currency.value
            expense_by_type[etype][cur] = expense_by_type[etype].get(cur, 0) + e.amount

        monthly_data.append({
            "month": month,
            "income": income_by_currency,
            "fixed_expenses": expense_by_type["fixed"],
            "variable_expenses": expense_by_type["variable"],
        })

    # Totals for the year
    total_income = {}
    total_fixed = {}
    total_variable = {}
    for m in monthly_data:
        for cur, amt in m["income"].items():
            total_income[cur] = total_income.get(cur, 0) + amt
        for cur, amt in m["fixed_expenses"].items():
            total_fixed[cur] = total_fixed.get(cur, 0) + amt
        for cur, amt in m["variable_expenses"].items():
            total_variable[cur] = total_variable.get(cur, 0) + amt

    return {
        "property_id": property_id,
        "property_name": prop.name,
        "year": year,
        "monthly_data": monthly_data,
        "totals": {
            "income": total_income,
            "fixed_expenses": total_fixed,
            "variable_expenses": total_variable,
        }
    }


@router.get("/overview")
def get_all_properties_performance(year: int = None, db: Session = Depends(get_db)):
    if year is None:
        year = datetime.now().year

    props = db.query(models.Property).all()
    result = []
    for prop in props:
        income = {}
        payments = db.query(models.RentPayment).join(models.Contract).filter(
            models.Contract.property_id == prop.id,
            models.RentPayment.period_year == year
        ).all()
        for p in payments:
            cur = p.currency.value
            income[cur] = income.get(cur, 0) + p.amount

        expenses = {}
        exps = db.query(models.Expense).filter(
            models.Expense.property_id == prop.id,
            extract('year', models.Expense.expense_date) == year
        ).all()
        for e in exps:
            cur = e.currency.value
            expenses[cur] = expenses.get(cur, 0) + e.amount

        active_contract = db.query(models.Contract).filter(
            models.Contract.property_id == prop.id,
            models.Contract.status == models.ContractStatus.ACTIVE
        ).first()

        incidents = db.query(func.count(models.Incident.id)).filter(
            models.Incident.property_id == prop.id,
            models.Incident.status != models.IncidentStatus.RESOLVED
        ).scalar()

        result.append({
            "property_id": prop.id,
            "property_name": prop.name,
            "city": prop.city,
            "country": prop.country,
            "has_active_contract": active_contract is not None,
            "tenant_name": active_contract.tenant_name if active_contract else None,
            "monthly_rent": active_contract.monthly_rent if active_contract else 0,
            "rent_currency": active_contract.currency.value if active_contract else None,
            "annual_income": income,
            "annual_expenses": expenses,
            "open_incidents": incidents,
        })
    return {"year": year, "properties": result}
