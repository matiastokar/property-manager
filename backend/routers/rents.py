from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from database import get_db
import models

router = APIRouter(prefix="/api/rents", tags=["rents"])


class RentPaymentCreate(BaseModel):
    contract_id: int
    amount: float
    currency: models.Currency
    payment_date: date
    period_month: int
    period_year: int
    payment_method: Optional[str] = None
    reference: Optional[str] = None
    has_proof: bool = False
    notes: Optional[str] = None


class RentPaymentUpdate(BaseModel):
    amount: Optional[float] = None
    currency: Optional[models.Currency] = None
    payment_date: Optional[date] = None
    payment_method: Optional[str] = None
    reference: Optional[str] = None
    has_proof: Optional[bool] = None
    notes: Optional[str] = None


def payment_to_dict(p: models.RentPayment) -> dict:
    return {
        "id": p.id,
        "contract_id": p.contract_id,
        "tenant_name": p.contract.tenant_name if p.contract else None,
        "property_name": p.contract.property.name if p.contract and p.contract.property else None,
        "property_id": p.contract.property_id if p.contract else None,
        "country": p.contract.property.country if p.contract and p.contract.property else None,
        "amount": p.amount,
        "currency": p.currency.value if p.currency else None,
        "payment_date": p.payment_date.isoformat() if p.payment_date else None,
        "period_month": p.period_month,
        "period_year": p.period_year,
        "payment_method": p.payment_method,
        "reference": p.reference,
        "has_proof": p.has_proof,
        "notes": p.notes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/")
def list_payments(
    contract_id: Optional[int] = None,
    period_year: Optional[int] = None,
    period_month: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.RentPayment)
    if contract_id:
        q = q.filter(models.RentPayment.contract_id == contract_id)
    if period_year:
        q = q.filter(models.RentPayment.period_year == period_year)
    if period_month:
        q = q.filter(models.RentPayment.period_month == period_month)
    return [payment_to_dict(p) for p in q.order_by(
        models.RentPayment.period_year.desc(),
        models.RentPayment.period_month.desc()
    ).all()]


@router.get("/missing")
def get_missing_payments(
    period_year: int,
    period_month: int,
    db: Session = Depends(get_db)
):
    """Return active contracts that don't have a payment for the given period."""
    active_contracts = db.query(models.Contract).filter(
        models.Contract.status == models.ContractStatus.ACTIVE
    ).all()
    missing = []
    for contract in active_contracts:
        payment = db.query(models.RentPayment).filter(
            models.RentPayment.contract_id == contract.id,
            models.RentPayment.period_year == period_year,
            models.RentPayment.period_month == period_month
        ).first()
        if not payment:
            missing.append({
                "contract_id": contract.id,
                "tenant_name": contract.tenant_name,
                "tenant_email": contract.tenant_email,
                "property_id": contract.property_id,
                "property_name": contract.property.name if contract.property else None,
                "monthly_rent": contract.monthly_rent,
                "currency": contract.currency.value,
            })
    return missing


@router.get("/payment-status")
def get_payment_status(
    period_year: int,
    period_month: int,
    db: Session = Depends(get_db)
):
    """Return all active contracts with their payment status for the given period."""
    active_contracts = db.query(models.Contract).filter(
        models.Contract.status == models.ContractStatus.ACTIVE
    ).order_by(models.Contract.property_id).all()

    result = []
    for contract in active_contracts:
        # Skip contracts that haven't started yet for this period
        period_start = date(period_year, period_month, 1)
        if contract.start_date and contract.start_date > period_start:
            continue

        payment = db.query(models.RentPayment).filter(
            models.RentPayment.contract_id == contract.id,
            models.RentPayment.period_year == period_year,
            models.RentPayment.period_month == period_month
        ).first()
        result.append({
            "contract_id": contract.id,
            "tenant_name": contract.tenant_name,
            "tenant_email": contract.tenant_email,
            "tenant_phone": contract.tenant_phone,
            "property_id": contract.property_id,
            "property_name": contract.property.name if contract.property else None,
            "country": contract.property.country if contract.property else None,
            "city": contract.property.city if contract.property else None,
            "expected_amount": contract.monthly_rent,
            "currency": contract.currency.value,
            "paid": payment is not None,
            "payment": payment_to_dict(payment) if payment else None,
        })
    return result


@router.get("/{payment_id}")
def get_payment(payment_id: int, db: Session = Depends(get_db)):
    p = db.query(models.RentPayment).filter(models.RentPayment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment_to_dict(p)


@router.post("/", status_code=201)
def create_payment(data: RentPaymentCreate, db: Session = Depends(get_db)):
    contract = db.query(models.Contract).filter(models.Contract.id == data.contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    payment = models.RentPayment(**data.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return {"id": payment.id, "message": "Payment registered"}


@router.put("/{payment_id}")
def update_payment(payment_id: int, data: RentPaymentUpdate, db: Session = Depends(get_db)):
    p = db.query(models.RentPayment).filter(models.RentPayment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    db.commit()
    return {"id": p.id, "message": "Payment updated"}


@router.delete("/{payment_id}")
def delete_payment(payment_id: int, db: Session = Depends(get_db)):
    p = db.query(models.RentPayment).filter(models.RentPayment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    db.delete(p)
    db.commit()
    return {"message": "Payment deleted"}
