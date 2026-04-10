import io, csv, re
from datetime import date, datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
import models

router = APIRouter(prefix="/api/bank-imports", tags=["bank-imports"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_amount(s: str) -> Optional[float]:
    """Parse amount string handling dots/commas as thousand separators or decimals."""
    s = s.strip().replace(' ', '').replace('\xa0', '')
    if not s or s == '-':
        return None
    negative = s.startswith('-') or s.startswith('(')
    s = s.lstrip('+-').strip('()')
    # Detect format: 1.234,56 (EU) vs 1,234.56 (US)
    if re.search(r'\.\d{3}', s) and ',' in s:
        s = s.replace('.', '').replace(',', '.')
    elif re.search(r',\d{3}', s) and '.' in s:
        s = s.replace(',', '')
    else:
        s = s.replace(',', '.')
    try:
        val = float(s)
        return -val if negative else val
    except ValueError:
        return None


def parse_date(s: str) -> Optional[date]:
    """Try common date formats."""
    s = s.strip()
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%m/%d/%Y',
                '%d/%m/%y', '%d.%m.%Y', '%d.%m.%y'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def score_property(description: str, prop: models.Property) -> int:
    """Return match score between transaction description and a property."""
    desc = description.lower()
    score = 0
    for word in re.split(r'\W+', prop.name.lower()):
        if len(word) > 3 and word in desc:
            score += 2
    for word in re.split(r'\W+', prop.city.lower()):
        if len(word) > 3 and word in desc:
            score += 1
    for contract in prop.contracts:
        for word in re.split(r'\W+', contract.tenant_name.lower()):
            if len(word) > 3 and word in desc:
                score += 3
    return score


def suggest_row(row: models.BankImportRow, properties: list):
    """Fill suggested_property, suggested_type, suggested_category using heuristics."""
    best_prop = None
    best_score = 0
    for prop in properties:
        s = score_property(row.description, prop)
        if s > best_score:
            best_score = s
            best_prop = prop

    if best_prop and best_score >= 2:
        row.suggested_property_id = best_prop.id

    # Type: credits = income, debits = expense
    if row.amount > 0:
        row.suggested_type = "income"
        row.suggested_category = "rent"
    else:
        row.suggested_type = "expense"
        desc = row.description.lower()
        if any(k in desc for k in ['hipotec', 'mortgage', 'prestamo', 'préstamo']):
            row.suggested_category = "mortgage"
        elif any(k in desc for k in ['comunidad', 'community', 'hoa']):
            row.suggested_category = "hoa"
        elif any(k in desc for k in ['seguro', 'insurance']):
            row.suggested_category = "insurance"
        elif any(k in desc for k in ['limpieza', 'cleaning']):
            row.suggested_category = "cleaning"
        else:
            row.suggested_category = "other"


def parse_csv_bytes(content: bytes, currency: models.Currency) -> list[dict]:
    """Parse CSV and return list of raw transaction dicts."""
    text = content.decode('utf-8-sig', errors='replace')
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for line in reader:
        keys = list(line.keys())
        # Find date column
        date_val = None
        for k in keys:
            if any(w in k.lower() for w in ['fecha', 'date', 'data', 'dat']):
                date_val = parse_date(str(line[k]))
                if date_val:
                    break
        # Find description column
        desc = ''
        for k in keys:
            if any(w in k.lower() for w in ['concepto', 'descripcion', 'descripción',
                                              'description', 'detail', 'detalle', 'movimiento']):
                desc = str(line[k]).strip()
                break
        if not desc:
            desc = ' '.join(str(v) for v in list(line.values())[:3])

        # Find amount — try debit/credit columns first, then single amount column
        amount = None
        debit_col = next((k for k in keys if any(w in k.lower() for w in
                          ['debito', 'débito', 'cargo', 'debit', 'salida'])), None)
        credit_col = next((k for k in keys if any(w in k.lower() for w in
                           ['credito', 'crédito', 'abono', 'credit', 'entrada', 'haber'])), None)
        if debit_col and credit_col:
            debit  = parse_amount(str(line.get(debit_col, '') or ''))
            credit = parse_amount(str(line.get(credit_col, '') or ''))
            if credit and (not debit or debit == 0):
                amount = abs(credit)
            elif debit and (not credit or credit == 0):
                amount = -abs(debit)
        else:
            for k in keys:
                if any(w in k.lower() for w in ['importe', 'monto', 'amount', 'valor', 'saldo']):
                    amount = parse_amount(str(line[k]))
                    if amount is not None:
                        break

        if amount is None:
            continue
        rows.append({'date': date_val, 'description': desc, 'amount': amount})
    return rows


def parse_pdf_bytes(content: bytes, currency: models.Currency) -> list[dict]:
    """Parse PDF extracting text lines and heuristically finding transactions."""
    import pdfplumber
    rows = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            # Try table extraction first
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                # Determine column positions from header row
                header = [str(c or '').lower() for c in table[0]]
                date_idx = next((i for i, h in enumerate(header)
                                 if any(w in h for w in ['fecha', 'date', 'data'])), None)
                desc_idx = next((i for i, h in enumerate(header)
                                 if any(w in h for w in ['concepto', 'descripcion', 'description',
                                                          'detalle', 'detail', 'movimiento'])), None)
                amount_idx = next((i for i, h in enumerate(header)
                                   if any(w in h for w in ['importe', 'amount', 'monto', 'valor'])), None)
                debit_idx  = next((i for i, h in enumerate(header)
                                   if any(w in h for w in ['debito', 'débito', 'cargo', 'debit'])), None)
                credit_idx = next((i for i, h in enumerate(header)
                                   if any(w in h for w in ['credito', 'crédito', 'abono', 'credit', 'haber'])), None)

                for row in table[1:]:
                    if not row:
                        continue
                    date_val = parse_date(str(row[date_idx] or '')) if date_idx is not None else None
                    desc = str(row[desc_idx] or '').strip() if desc_idx is not None else ''
                    if not desc:
                        desc = ' | '.join(str(c or '') for c in row if c)

                    amount = None
                    if debit_idx is not None and credit_idx is not None:
                        d = parse_amount(str(row[debit_idx] or ''))
                        c = parse_amount(str(row[credit_idx] or ''))
                        if c and (not d or d == 0):
                            amount = abs(c)
                        elif d and (not c or c == 0):
                            amount = -abs(d)
                    elif amount_idx is not None:
                        amount = parse_amount(str(row[amount_idx] or ''))

                    if amount is None:
                        continue
                    rows.append({'date': date_val, 'description': desc, 'amount': amount})

            # Fallback: raw text line parsing if no tables found
            if not tables:
                text = page.extract_text() or ''
                date_pattern = re.compile(
                    r'(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s+(.+?)\s+([-+]?\d[\d.,]+)\s*$'
                )
                for line in text.splitlines():
                    m = date_pattern.search(line)
                    if m:
                        d = parse_date(m.group(1))
                        desc = m.group(2).strip()
                        amount = parse_amount(m.group(3))
                        if amount is not None:
                            rows.append({'date': d, 'description': desc, 'amount': amount})
    return rows


def row_to_dict(r: models.BankImportRow) -> dict:
    return {
        "id": r.id,
        "bank_import_id": r.bank_import_id,
        "transaction_date": r.transaction_date.isoformat() if r.transaction_date else None,
        "description": r.description,
        "amount": r.amount,
        "currency": r.currency.value,
        "suggested_property_id": r.suggested_property_id,
        "suggested_property_name": r.suggested_property.name if r.suggested_property else None,
        "confirmed_property_id": r.confirmed_property_id,
        "confirmed_property_name": r.confirmed_property.name if r.confirmed_property else None,
        "suggested_type": r.suggested_type,
        "confirmed_type": r.confirmed_type,
        "suggested_category": r.suggested_category,
        "confirmed_category": r.confirmed_category,
        "status": r.status.value,
        "created_expense_id": r.created_expense_id,
        "created_payment_id": r.created_payment_id,
    }


def import_to_dict(i: models.BankImport) -> dict:
    return {
        "id": i.id,
        "filename": i.filename,
        "period_month": i.period_month,
        "period_year": i.period_year,
        "currency": i.currency.value,
        "status": i.status.value,
        "created_at": i.created_at.isoformat(),
        "total_rows": len(i.rows),
        "confirmed_rows": sum(1 for r in i.rows if r.status == models.BankImportRowStatus.CONFIRMED),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def list_imports(db: Session = Depends(get_db)):
    imports = db.query(models.BankImport).order_by(models.BankImport.created_at.desc()).all()
    return [import_to_dict(i) for i in imports]


@router.get("/{import_id}/rows")
def list_rows(import_id: int, db: Session = Depends(get_db)):
    rows = db.query(models.BankImportRow).filter(
        models.BankImportRow.bank_import_id == import_id
    ).all()
    return [row_to_dict(r) for r in rows]


@router.post("/upload", status_code=201)
async def upload_statement(
    file: UploadFile = File(...),
    period_month: int = Form(...),
    period_year: int = Form(...),
    currency: str = Form("EUR"),
    db: Session = Depends(get_db),
):
    content = await file.read()
    filename = file.filename or "upload"
    cur = models.Currency(currency)

    # Parse file
    if filename.lower().endswith('.pdf'):
        raw_rows = parse_pdf_bytes(content, cur)
    elif filename.lower().endswith('.csv'):
        raw_rows = parse_csv_bytes(content, cur)
    else:
        raise HTTPException(status_code=400, detail="Solo se admiten archivos PDF o CSV")

    if not raw_rows:
        raise HTTPException(status_code=422, detail="No se encontraron transacciones en el archivo")

    # Load properties for matching
    properties = db.query(models.Property).all()

    # Create import record
    bank_import = models.BankImport(
        filename=filename,
        period_month=period_month,
        period_year=period_year,
        currency=cur,
        status=models.BankImportStatus.PENDING,
    )
    db.add(bank_import)
    db.flush()

    for raw in raw_rows:
        row = models.BankImportRow(
            bank_import_id=bank_import.id,
            transaction_date=raw['date'],
            description=raw['description'],
            amount=raw['amount'],
            currency=cur,
        )
        suggest_row(row, properties)
        db.add(row)

    db.commit()
    db.refresh(bank_import)
    return {"id": bank_import.id, "total_rows": len(raw_rows)}


class RowUpdate(BaseModel):
    confirmed_property_id: Optional[int] = None
    confirmed_type: Optional[str] = None
    confirmed_category: Optional[str] = None
    status: Optional[str] = None


@router.put("/{import_id}/rows/{row_id}")
def update_row(import_id: int, row_id: int, data: RowUpdate, db: Session = Depends(get_db)):
    row = db.query(models.BankImportRow).filter(
        models.BankImportRow.id == row_id,
        models.BankImportRow.bank_import_id == import_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    if data.confirmed_property_id is not None:
        row.confirmed_property_id = data.confirmed_property_id
    if data.confirmed_type is not None:
        row.confirmed_type = data.confirmed_type
    if data.confirmed_category is not None:
        row.confirmed_category = data.confirmed_category
    if data.status is not None:
        row.status = models.BankImportRowStatus(data.status)
    db.commit()
    return row_to_dict(row)


@router.post("/{import_id}/confirm")
def confirm_import(import_id: int, db: Session = Depends(get_db)):
    """Import all confirmed rows into expenses or rent payments."""
    bank_import = db.query(models.BankImport).filter(models.BankImport.id == import_id).first()
    if not bank_import:
        raise HTTPException(status_code=404, detail="Import not found")

    rows = db.query(models.BankImportRow).filter(
        models.BankImportRow.bank_import_id == import_id,
        models.BankImportRow.status == models.BankImportRowStatus.CONFIRMED,
        models.BankImportRow.created_expense_id == None,
        models.BankImportRow.created_payment_id == None,
    ).all()

    created_expenses = 0
    created_payments = 0

    for row in rows:
        prop_id = row.confirmed_property_id or row.suggested_property_id
        rtype   = row.confirmed_type or row.suggested_type
        cat     = row.confirmed_category or row.suggested_category or "other"
        tx_date = row.transaction_date or date(bank_import.period_year, bank_import.period_month, 1)

        if not prop_id:
            continue

        if rtype == "income":
            # Find active contract for property
            contract = db.query(models.Contract).filter(
                models.Contract.property_id == prop_id,
                models.Contract.status == models.ContractStatus.ACTIVE,
            ).first()
            if contract:
                payment = models.RentPayment(
                    contract_id=contract.id,
                    amount=abs(row.amount),
                    currency=row.currency,
                    payment_date=tx_date,
                    period_month=bank_import.period_month,
                    period_year=bank_import.period_year,
                    payment_method="Transferencia",
                    notes=f"Importado desde extracto: {row.description}",
                )
                db.add(payment)
                db.flush()
                row.created_payment_id = payment.id
                created_payments += 1
        else:
            expense = models.Expense(
                property_id=prop_id,
                expense_type=models.ExpenseType.FIXED if cat in ('mortgage', 'hoa', 'insurance') else models.ExpenseType.VARIABLE,
                category=cat,
                amount=abs(row.amount),
                currency=row.currency,
                description=row.description,
                expense_date=tx_date,
            )
            db.add(expense)
            db.flush()
            row.created_expense_id = expense.id
            created_expenses += 1

    bank_import.status = models.BankImportStatus.COMPLETED
    db.commit()
    return {"created_expenses": created_expenses, "created_payments": created_payments}


@router.delete("/{import_id}")
def delete_import(import_id: int, db: Session = Depends(get_db)):
    bi = db.query(models.BankImport).filter(models.BankImport.id == import_id).first()
    if not bi:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(bi)
    db.commit()
    return {"message": "Deleted"}
