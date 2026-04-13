from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from enum import Enum

from database import get_db
import models

router = APIRouter(prefix="/api/utilities", tags=["utilities"])


class UtilityType(str, Enum):
    electricity = "electricity"
    gas = "gas"
    water = "water"


class UtilityCreate(BaseModel):
    property_id: int
    utility_type: UtilityType
    year: int
    month: int
    amount: float
    notes: Optional[str] = None


class UtilityUpdate(BaseModel):
    property_id: Optional[int] = None
    utility_type: Optional[UtilityType] = None
    year: Optional[int] = None
    month: Optional[int] = None
    amount: Optional[float] = None
    notes: Optional[str] = None


def reading_to_dict(r: models.UtilityReading) -> dict:
    return {
        "id": r.id,
        "property_id": r.property_id,
        "property_name": r.property.name if r.property else None,
        "utility_type": r.utility_type.value if r.utility_type else None,
        "year": r.year,
        "month": r.month,
        "amount": r.amount,
        "notes": r.notes,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/comparison")
def get_comparison(
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    """
    For the given year & month, return each property's readings for that month
    and the previous month, with pct_change per utility type.
    Alert is True when pct_change > 10.
    """
    if month == 1:
        prev_month = 12
        prev_year = year - 1
    else:
        prev_month = month - 1
        prev_year = year

    current_readings = (
        db.query(models.UtilityReading)
        .filter(
            models.UtilityReading.year == year,
            models.UtilityReading.month == month,
        )
        .all()
    )
    previous_readings = (
        db.query(models.UtilityReading)
        .filter(
            models.UtilityReading.year == prev_year,
            models.UtilityReading.month == prev_month,
        )
        .all()
    )

    # Index by (property_id, utility_type)
    current_map: dict[tuple, float] = {}
    for r in current_readings:
        current_map[(r.property_id, r.utility_type.value)] = r.amount

    previous_map: dict[tuple, float] = {}
    for r in previous_readings:
        previous_map[(r.property_id, r.utility_type.value)] = r.amount

    # Collect all relevant property ids from both periods
    property_ids: set[int] = set()
    for r in current_readings:
        property_ids.add(r.property_id)
    for r in previous_readings:
        property_ids.add(r.property_id)

    # Fetch property names
    properties = (
        db.query(models.Property)
        .filter(models.Property.id.in_(property_ids))
        .all()
    ) if property_ids else []
    property_name_map = {p.id: p.name for p in properties}

    utility_types = [ut.value for ut in UtilityType]
    result = []

    for prop_id in sorted(property_ids):
        utilities: dict[str, dict] = {}
        for ut in utility_types:
            current_val = current_map.get((prop_id, ut))
            previous_val = previous_map.get((prop_id, ut))

            if previous_val is not None and previous_val != 0 and current_val is not None:
                pct_change = round((current_val - previous_val) / previous_val * 100, 2)
            else:
                pct_change = None

            alert = pct_change is not None and pct_change > 10

            utilities[ut] = {
                "current": current_val,
                "previous": previous_val,
                "pct_change": pct_change,
                "alert": alert,
            }

        result.append({
            "property_id": prop_id,
            "property_name": property_name_map.get(prop_id),
            "utilities": utilities,
        })

    return result


@router.get("/")
def list_readings(
    property_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.UtilityReading)
    if property_id is not None:
        q = q.filter(models.UtilityReading.property_id == property_id)
    if year is not None:
        q = q.filter(models.UtilityReading.year == year)
    if month is not None:
        q = q.filter(models.UtilityReading.month == month)
    readings = q.order_by(
        models.UtilityReading.year.desc(),
        models.UtilityReading.month.desc(),
    ).all()
    return [reading_to_dict(r) for r in readings]


@router.post("/", status_code=201)
def create_reading(data: UtilityCreate, db: Session = Depends(get_db)):
    prop = db.query(models.Property).filter(models.Property.id == data.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    reading = models.UtilityReading(**data.model_dump())
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return {"id": reading.id, "message": "Utility reading created"}


@router.put("/{id}")
def update_reading(id: int, data: UtilityUpdate, db: Session = Depends(get_db)):
    reading = db.query(models.UtilityReading).filter(models.UtilityReading.id == id).first()
    if not reading:
        raise HTTPException(status_code=404, detail="Utility reading not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(reading, field, value)
    db.commit()
    return {"id": reading.id, "message": "Utility reading updated"}


@router.delete("/{id}")
def delete_reading(id: int, db: Session = Depends(get_db)):
    reading = db.query(models.UtilityReading).filter(models.UtilityReading.id == id).first()
    if not reading:
        raise HTTPException(status_code=404, detail="Utility reading not found")
    db.delete(reading)
    db.commit()
    return {"message": "Utility reading deleted"}
