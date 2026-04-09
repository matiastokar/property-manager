from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db
import models

router = APIRouter(prefix="/api/properties", tags=["properties"])


class PropertyCreate(BaseModel):
    name: str
    address: str
    city: str
    country: str
    type: str
    description: Optional[str] = None


class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None


@router.get("/")
def list_properties(db: Session = Depends(get_db)):
    props = db.query(models.Property).all()
    result = []
    for p in props:
        active_contract = db.query(models.Contract).filter(
            models.Contract.property_id == p.id,
            models.Contract.status == models.ContractStatus.ACTIVE
        ).first()
        result.append({
            "id": p.id,
            "name": p.name,
            "address": p.address,
            "city": p.city,
            "country": p.country,
            "type": p.type,
            "description": p.description,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "has_active_contract": active_contract is not None,
            "tenant_name": active_contract.tenant_name if active_contract else None,
            "monthly_rent": active_contract.monthly_rent if active_contract else None,
            "rent_currency": active_contract.currency.value if active_contract else None,
        })
    return result


@router.get("/{property_id}")
def get_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(models.Property).filter(models.Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return {
        "id": prop.id,
        "name": prop.name,
        "address": prop.address,
        "city": prop.city,
        "country": prop.country,
        "type": prop.type,
        "description": prop.description,
        "created_at": prop.created_at.isoformat() if prop.created_at else None,
    }


@router.post("/", status_code=201)
def create_property(data: PropertyCreate, db: Session = Depends(get_db)):
    prop = models.Property(**data.model_dump())
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return {"id": prop.id, "name": prop.name, "message": "Property created"}


@router.put("/{property_id}")
def update_property(property_id: int, data: PropertyUpdate, db: Session = Depends(get_db)):
    prop = db.query(models.Property).filter(models.Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(prop, field, value)
    db.commit()
    db.refresh(prop)
    return {"id": prop.id, "message": "Property updated"}


@router.delete("/{property_id}")
def delete_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(models.Property).filter(models.Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    db.delete(prop)
    db.commit()
    return {"message": "Property deleted"}
