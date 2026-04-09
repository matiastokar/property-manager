from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from database import get_db
import models

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


class IncidentCreate(BaseModel):
    property_id: int
    title: str
    description: str
    incident_date: date
    status: models.IncidentStatus = models.IncidentStatus.OPEN


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    incident_date: Optional[date] = None
    status: Optional[models.IncidentStatus] = None
    resolution_notes: Optional[str] = None


def incident_to_dict(i: models.Incident) -> dict:
    return {
        "id": i.id,
        "property_id": i.property_id,
        "property_name": i.property.name if i.property else None,
        "title": i.title,
        "description": i.description,
        "incident_date": i.incident_date.isoformat() if i.incident_date else None,
        "status": i.status.value if i.status else None,
        "resolution_notes": i.resolution_notes,
        "created_at": i.created_at.isoformat() if i.created_at else None,
        "expense_count": len(i.expenses),
    }


@router.get("/")
def list_incidents(property_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.Incident)
    if property_id:
        q = q.filter(models.Incident.property_id == property_id)
    return [incident_to_dict(i) for i in q.order_by(models.Incident.incident_date.desc()).all()]


@router.get("/{incident_id}")
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    i = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident_to_dict(i)


@router.post("/", status_code=201)
def create_incident(data: IncidentCreate, db: Session = Depends(get_db)):
    prop = db.query(models.Property).filter(models.Property.id == data.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    incident = models.Incident(**data.model_dump())
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return {"id": incident.id, "message": "Incident created"}


@router.put("/{incident_id}")
def update_incident(incident_id: int, data: IncidentUpdate, db: Session = Depends(get_db)):
    i = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Incident not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(i, field, value)
    db.commit()
    return {"id": i.id, "message": "Incident updated"}


@router.delete("/{incident_id}")
def delete_incident(incident_id: int, db: Session = Depends(get_db)):
    i = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Incident not found")
    db.delete(i)
    db.commit()
    return {"message": "Incident deleted"}
