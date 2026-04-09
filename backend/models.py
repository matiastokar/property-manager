from datetime import date, datetime
from enum import Enum as PyEnum
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, Boolean,
    ForeignKey, Enum, Text
)
from sqlalchemy.orm import relationship
from database import Base


class Currency(str, PyEnum):
    ARS = "ARS"
    EUR = "EUR"
    USD = "USD"


class ContractStatus(str, PyEnum):
    ACTIVE = "active"
    FINISHED = "finished"
    EXPIRED = "expired"


class ExpenseType(str, PyEnum):
    FIXED = "fixed"
    VARIABLE = "variable"


class FixedCategory(str, PyEnum):
    MORTGAGE = "mortgage"
    HOA = "hoa"
    INSURANCE = "insurance"
    CLEANING = "cleaning"
    OTHER = "other"


class VariableCategory(str, PyEnum):
    INCIDENT = "incident"
    REPAIR = "repair"
    IMPROVEMENT = "improvement"
    OTHER = "other"


class IncidentStatus(str, PyEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"


class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    city = Column(String, nullable=False)
    country = Column(String, nullable=False)
    type = Column(String, nullable=False)  # apartment, house, commercial, etc.
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    contracts = relationship("Contract", back_populates="property", cascade="all, delete")
    expenses = relationship("Expense", back_populates="property", cascade="all, delete")
    incidents = relationship("Incident", back_populates="property", cascade="all, delete")


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    tenant_name = Column(String, nullable=False)
    tenant_email = Column(String, nullable=True)
    tenant_phone = Column(String, nullable=True)
    tenant_id_number = Column(String, nullable=True)  # DNI/NIE/Passport
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    monthly_rent = Column(Float, nullable=False)
    deposit = Column(Float, nullable=True)  # security deposit amount
    currency = Column(Enum(Currency), nullable=False, default=Currency.EUR)
    status = Column(Enum(ContractStatus), nullable=False, default=ContractStatus.ACTIVE)
    finish_date = Column(Date, nullable=True)  # actual end date if finished early
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    property = relationship("Property", back_populates="contracts")
    rent_payments = relationship("RentPayment", back_populates="contract", cascade="all, delete")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=True)
    expense_type = Column(Enum(ExpenseType), nullable=False)
    # For fixed: mortgage, hoa, insurance, cleaning, other
    # For variable: incident, repair, improvement, other
    category = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(Enum(Currency), nullable=False, default=Currency.EUR)
    description = Column(Text, nullable=False)
    expense_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    property = relationship("Property", back_populates="expenses")
    incident = relationship("Incident", back_populates="expenses")


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    incident_date = Column(Date, nullable=False)
    status = Column(Enum(IncidentStatus), nullable=False, default=IncidentStatus.OPEN)
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    property = relationship("Property", back_populates="incidents")
    expenses = relationship("Expense", back_populates="incident")


class RecurringExpense(Base):
    """Template for expenses that are automatically created each month."""
    __tablename__ = "recurring_expenses"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    expense_type = Column(Enum(ExpenseType), nullable=False)
    category = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(Enum(Currency), nullable=False, default=Currency.EUR)
    description = Column(String, nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    property = relationship("Property")


class RentPayment(Base):
    __tablename__ = "rent_payments"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(Enum(Currency), nullable=False)
    payment_date = Column(Date, nullable=False)
    period_month = Column(Integer, nullable=False)  # 1-12
    period_year = Column(Integer, nullable=False)
    payment_method = Column(String, nullable=True)  # transfer, cash, etc.
    reference = Column(String, nullable=True)  # bank transfer reference
    has_proof = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    contract = relationship("Contract", back_populates="rent_payments")
