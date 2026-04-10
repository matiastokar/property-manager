from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
import models

router = APIRouter(prefix="/api/recurring-expenses", tags=["recurring-expenses"])


class RecurringExpenseCreate(BaseModel):
    property_id: int
    expense_type: models.ExpenseType
    category: str
    amount: float
    currency: models.Currency = models.Currency.EUR
    description: str


class RecurringExpenseUpdate(BaseModel):
    property_id: Optional[int] = None
    expense_type: Optional[models.ExpenseType] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[models.Currency] = None
    description: Optional[str] = None
    active: Optional[bool] = None


def to_dict(r: models.RecurringExpense) -> dict:
    return {
        "id": r.id,
        "property_id": r.property_id,
        "property_name": r.property.name if r.property else None,
        "expense_type": r.expense_type.value,
        "category": r.category,
        "amount": r.amount,
        "currency": r.currency.value,
        "description": r.description,
        "active": r.active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/")
def list_recurring(property_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.RecurringExpense)
    if property_id:
        q = q.filter(models.RecurringExpense.property_id == property_id)
    return [to_dict(r) for r in q.order_by(models.RecurringExpense.property_id).all()]


@router.post("/", status_code=201)
def create_recurring(data: RecurringExpenseCreate, db: Session = Depends(get_db)):
    prop = db.query(models.Property).filter(models.Property.id == data.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    rec = models.RecurringExpense(**data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "message": "Recurring expense created"}


@router.put("/{rec_id}")
def update_recurring(rec_id: int, data: RecurringExpenseUpdate, db: Session = Depends(get_db)):
    rec = db.query(models.RecurringExpense).filter(models.RecurringExpense.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(rec, field, value)
    db.commit()
    return {"id": rec.id, "message": "Updated"}


@router.delete("/{rec_id}")
def delete_recurring(rec_id: int, db: Session = Depends(get_db)):
    rec = db.query(models.RecurringExpense).filter(models.RecurringExpense.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(rec)
    db.commit()
    return {"message": "Deleted"}
