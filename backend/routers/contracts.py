from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

from database import get_db
import models

router = APIRouter(prefix="/api/contracts", tags=["contracts"])


class ContractCreate(BaseModel):
    property_id: int
    tenant_name: str
    tenant_email: Optional[str] = None
    tenant_phone: Optional[str] = None
    tenant_id_number: Optional[str] = None
    start_date: date
    end_date: date
    monthly_rent: float
    deposit: Optional[float] = None
    currency: models.Currency = models.Currency.EUR
    notes: Optional[str] = None


class ContractUpdate(BaseModel):
    tenant_name: Optional[str] = None
    tenant_email: Optional[str] = None
    tenant_phone: Optional[str] = None
    tenant_id_number: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    monthly_rent: Optional[float] = None
    deposit: Optional[float] = None
    currency: Optional[models.Currency] = None
    notes: Optional[str] = None


class ContractFinish(BaseModel):
    finish_date: date
    notes: Optional[str] = None


def contract_to_dict(c: models.Contract) -> dict:
    return {
        "id": c.id,
        "property_id": c.property_id,
        "property_name": c.property.name if c.property else None,
        "tenant_name": c.tenant_name,
        "tenant_email": c.tenant_email,
        "tenant_phone": c.tenant_phone,
        "tenant_id_number": c.tenant_id_number,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "monthly_rent": c.monthly_rent,
        "deposit": c.deposit,
        "currency": c.currency.value if c.currency else None,
        "status": c.status.value if c.status else None,
        "finish_date": c.finish_date.isoformat() if c.finish_date else None,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("/")
def list_contracts(db: Session = Depends(get_db)):
    contracts = db.query(models.Contract).all()
    return [contract_to_dict(c) for c in contracts]


@router.get("/active")
def list_active_contracts(db: Session = Depends(get_db)):
    contracts = db.query(models.Contract).filter(
        models.Contract.status == models.ContractStatus.ACTIVE
    ).all()
    return [contract_to_dict(c) for c in contracts]


@router.get("/{contract_id}")
def get_contract(contract_id: int, db: Session = Depends(get_db)):
    c = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract_to_dict(c)


@router.post("/", status_code=201)
def create_contract(data: ContractCreate, db: Session = Depends(get_db)):
    prop = db.query(models.Property).filter(models.Property.id == data.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    contract = models.Contract(**data.model_dump())
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return {"id": contract.id, "message": "Contract created"}


@router.put("/{contract_id}")
def update_contract(contract_id: int, data: ContractUpdate, db: Session = Depends(get_db)):
    c = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(c, field, value)
    db.commit()
    return {"id": c.id, "message": "Contract updated"}


@router.post("/{contract_id}/finish")
def finish_contract(contract_id: int, data: ContractFinish, db: Session = Depends(get_db)):
    c = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    c.status = models.ContractStatus.FINISHED
    c.finish_date = data.finish_date
    if data.notes:
        c.notes = (c.notes or "") + f"\n[Finalizado {data.finish_date}]: {data.notes}"
    db.commit()
    return {"id": c.id, "message": "Contract finished"}


@router.delete("/{contract_id}")
def delete_contract(contract_id: int, db: Session = Depends(get_db)):
    c = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    db.delete(c)
    db.commit()
    return {"message": "Contract deleted"}
