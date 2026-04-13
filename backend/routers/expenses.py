from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from database import get_db
import models

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


class ExpenseCreate(BaseModel):
    property_id: int
    incident_id: Optional[int] = None
    expense_type: models.ExpenseType
    category: str
    amount: float
    currency: models.Currency = models.Currency.EUR
    description: str
    expense_date: date


class ExpenseUpdate(BaseModel):
    property_id: Optional[int] = None
    expense_type: Optional[models.ExpenseType] = None
    incident_id: Optional[int] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[models.Currency] = None
    description: Optional[str] = None
    expense_date: Optional[date] = None


def expense_to_dict(e: models.Expense) -> dict:
    return {
        "id": e.id,
        "property_id": e.property_id,
        "property_name": e.property.name if e.property else None,
        "incident_id": e.incident_id,
        "expense_type": e.expense_type.value if e.expense_type else None,
        "category": e.category,
        "amount": e.amount,
        "currency": e.currency.value if e.currency else None,
        "description": e.description,
        "expense_date": e.expense_date.isoformat() if e.expense_date else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


@router.get("/")
def list_expenses(
    property_id: Optional[int] = None,
    expense_type: Optional[str] = None,
    category: Optional[str] = None,
    period_month: Optional[int] = None,
    period_year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.Expense)
    if property_id:
        q = q.filter(models.Expense.property_id == property_id)
    if expense_type:
        q = q.filter(models.Expense.expense_type == expense_type)
    if category:
        q = q.filter(models.Expense.category == category)
    if period_year and period_month:
        start = date(period_year, period_month, 1)
        end = date(period_year, period_month + 1, 1) if period_month < 12 else date(period_year + 1, 1, 1)
        q = q.filter(models.Expense.expense_date >= start, models.Expense.expense_date < end)
    elif period_year:
        q = q.filter(models.Expense.expense_date >= date(period_year, 1, 1),
                     models.Expense.expense_date < date(period_year + 1, 1, 1))
    return [expense_to_dict(e) for e in q.order_by(models.Expense.expense_date.desc()).all()]


@router.get("/{expense_id}")
def get_expense(expense_id: int, db: Session = Depends(get_db)):
    e = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense_to_dict(e)


@router.post("/", status_code=201)
def create_expense(data: ExpenseCreate, db: Session = Depends(get_db)):
    prop = db.query(models.Property).filter(models.Property.id == data.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    expense = models.Expense(**data.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return {"id": expense.id, "message": "Expense created"}


@router.put("/{expense_id}")
def update_expense(expense_id: int, data: ExpenseUpdate, db: Session = Depends(get_db)):
    e = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(e, field, value)
    db.commit()
    return {"id": e.id, "message": "Expense updated"}


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    e = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(e)
    db.commit()
    return {"message": "Expense deleted"}
