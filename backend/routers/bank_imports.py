import io, csv, re
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
import models

router = APIRouter(prefix="/api/bank-imports", tags=["bank-imports"])

# ── Amount / date parsers ─────────────────────────────────────────────────────

def parse_amount(s: str) -> Optional[float]:
    s = str(s).strip().replace('\xa0', '').replace(' ', '')
    if not s or s in ('-', '—', ''):
        return None
    negative = s.startswith('-') or s.startswith('(')
    s = s.lstrip('+-').strip('()')
    # EU format 1.234,56  vs  US format 1,234.56
    if re.search(r'\.\d{3}', s) and ',' in s:
        s = s.replace('.', '').replace(',', '.')
    elif re.search(r',\d{3}', s) and '.' in s:
        s = s.replace(',', '')
    else:
        s = s.replace(',', '.')
    try:
        v = float(s)
        return -v if negative else v
    except ValueError:
        return None


def parse_date(s: str) -> Optional[date]:
    s = str(s).strip()
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%m/%d/%Y',
                '%d/%m/%y', '%d.%m.%Y', '%d.%m.%y'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


# ── Property matching ─────────────────────────────────────────────────────────

def score_property(description: str, prop: models.Property) -> int:
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
    best_prop, best_score = None, 0
    for prop in properties:
        s = score_property(row.description, prop)
        if s > best_score:
            best_score, best_prop = s, prop
    if best_prop and best_score >= 2:
        row.suggested_property_id = best_prop.id

    if row.amount > 0:
        row.suggested_type = "income"
        row.suggested_category = "rent"
    else:
        row.suggested_type = "expense"
        desc = row.description.lower()
        if any(k in desc for k in ['hipotec', 'mortgage', 'prestamo', 'préstamo', 'bankinter', 'caixabank', 'sabadell']):
            row.suggested_category = "mortgage"
        elif any(k in desc for k in ['comunidad', 'community', 'hoa', 'vecinos']):
            row.suggested_category = "hoa"
        elif any(k in desc for k in ['seguro', 'insurance', 'occident', 'mapfre', 'axa']):
            row.suggested_category = "insurance"
        elif any(k in desc for k in ['limpieza', 'cleaning']):
            row.suggested_category = "cleaning"
        elif any(k in desc for k in ['internet', 'telefon', 'movistar', 'orange', 'vodafone', 'fiber']):
            row.suggested_category = "internet"
        elif any(k in desc for k in ['luz', 'electr', 'endesa', 'iberdrola', 'naturgy', 'repsol elec', 'holaluz', 'eléctric']):
            row.suggested_category = "electricity"
        elif any(k in desc for k in ['gas', 'naturgas', 'repsol gas']):
            row.suggested_category = "gas"
        elif any(k in desc for k in ['agua', 'water', 'aigues', 'aguas', 'canal de isabel']):
            row.suggested_category = "water"
        elif any(k in desc for k in ['tribut', 'impuest', 'ibi', 'icio', 'hacienda', 'agencia tributaria', 'tax', 'tasa', 'irpf', 'iva ']):
            row.suggested_category = "tax"
        else:
            row.suggested_category = "other"


# ── PDF parser ────────────────────────────────────────────────────────────────

# Patterns for text-based PDF parsing (handles OpenBank and similar formats)
_DATE_ROW   = re.compile(r'^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s*(.*)')
_AMOUNT_EOL = re.compile(r'([-+]?\d[\d.,]+)\s*(?:EUR|USD|ARS)\s+([-+]?\d[\d.,]+)\s*(?:EUR|USD|ARS)\s*$')
_AMOUNT_SINGLE = re.compile(r'([-+]?\d[\d.,]+)\s*(?:EUR|USD|ARS)\s*$')
_SKIP = re.compile(r'Fecha|Operación|Valor|Concepto|Saldo|Importe|OpenBank|Registro|litnacreM|oilicimoD|FIN|NIF|IBAN|titular|entidad|Cuenta|CUENTA|Folio|Tomo|Hoja', re.I)


def _parse_openbank_text(full_text: str) -> list[dict]:
    """Parse Spanish bank statement text format (date / description / amount EUR balance EUR)."""
    rows = []
    lines = [l.strip() for l in full_text.splitlines() if l.strip()]
    current = None
    for line in lines:
        dm = _DATE_ROW.match(line)
        if dm:
            if current and current['amount'] is not None:
                rows.append(current)
            current = {
                'date': parse_date(dm.group(1)),
                'desc_parts': [dm.group(3)] if dm.group(3) else [],
                'amount': None,
            }
        elif current is not None:
            am = _AMOUNT_EOL.search(line)
            if am:
                current['amount'] = parse_amount(am.group(1))
                if current['amount'] is not None:
                    rows.append(current)
                current = None
            elif not _SKIP.search(line):
                current['desc_parts'].append(line)
    if current and current['amount'] is not None:
        rows.append(current)
    return [{'date': r['date'],
             'description': ' '.join(r['desc_parts']).strip() or '(sin descripción)',
             'amount': r['amount']} for r in rows]


def parse_pdf_bytes(content: bytes, currency: models.Currency) -> list[dict]:
    import pdfplumber
    rows: list[dict] = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        full_text = ''
        table_rows_found = False

        for page in pdf.pages:
            # ── Try structured table extraction first ──────────────────────
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                header = [str(c or '').lower().strip() for c in table[0]]
                date_idx   = next((i for i, h in enumerate(header) if any(w in h for w in ['fecha','date','data'])), None)
                desc_idx   = next((i for i, h in enumerate(header) if any(w in h for w in ['concepto','descripcion','description','detalle','movimiento'])), None)
                amount_idx = next((i for i, h in enumerate(header) if any(w in h for w in ['importe','amount','monto','valor'])), None)
                debit_idx  = next((i for i, h in enumerate(header) if any(w in h for w in ['debito','débito','cargo','debit','salida'])), None)
                credit_idx = next((i for i, h in enumerate(header) if any(w in h for w in ['credito','crédito','abono','credit','entrada','haber'])), None)

                for row in table[1:]:
                    if not row:
                        continue
                    d = parse_date(str(row[date_idx] or '')) if date_idx is not None else None
                    desc = str(row[desc_idx] or '').strip() if desc_idx is not None else \
                           ' | '.join(str(c or '') for c in row if c)
                    amount = None
                    if debit_idx is not None and credit_idx is not None:
                        dv = parse_amount(str(row[debit_idx] or ''))
                        cv = parse_amount(str(row[credit_idx] or ''))
                        if cv and (not dv or dv == 0):
                            amount = abs(cv)
                        elif dv and (not cv or cv == 0):
                            amount = -abs(dv)
                    elif amount_idx is not None:
                        amount = parse_amount(str(row[amount_idx] or ''))
                    if amount is not None and desc:
                        rows.append({'date': d, 'description': desc, 'amount': amount})
                        table_rows_found = True

            full_text += (page.extract_text() or '') + '\n'

        # ── Fallback: text-based parsing (OpenBank and similar) ────────────
        if not table_rows_found and full_text.strip():
            rows = _parse_openbank_text(full_text)

    return rows


# ── CSV parser ────────────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    """Lowercase + strip accents for column-name matching."""
    return (s.lower()
             .replace('á','a').replace('é','e').replace('í','i')
             .replace('ó','o').replace('ú','u').replace('ü','u')
             .strip())


def parse_csv_bytes(content: bytes, currency: models.Currency) -> list[dict]:
    # 1. Decode
    text = None
    enc_used = None
    for enc in ('utf-8-sig', 'utf-8', 'latin-1', 'cp1252'):
        try:
            text = content.decode(enc)
            enc_used = enc
            break
        except Exception:
            continue
    if text is None:
        raise ValueError("No se pudo decodificar el archivo CSV. Guardalo como UTF-8 o Latin-1.")

    lines = text.splitlines()
    if not lines:
        raise ValueError("El archivo CSV está vacío.")

    # 2. Detect delimiter using ALL lines (not just the first, which may be a title)
    semi_count = sum(l.count(';') for l in lines)
    comma_count = sum(l.count(',') for l in lines)
    # If many commas but they look like decimal separators (digit,digit), discount them
    decimal_comma_count = sum(len(re.findall(r'\d,\d', l)) for l in lines)
    comma_count = max(0, comma_count - decimal_comma_count)
    delimiter = ';' if semi_count > comma_count else ','

    # 3. Find the real header row (skip metadata lines at the top)
    #    Look for the first line with ≥ 2 known column-name keywords
    HEADER_KW = ['fecha', 'date', 'concepto', 'descripci', 'importe',
                 'amount', 'debito', 'credito', 'saldo', 'divisa', 'monto',
                 'movimiento', 'valor']
    header_line_idx = 0
    for i, line in enumerate(lines):
        normalized = _norm(line)
        if sum(1 for kw in HEADER_KW if kw in normalized) >= 2:
            header_line_idx = i
            break

    csv_text = '\n'.join(lines[header_line_idx:])
    reader = csv.DictReader(io.StringIO(csv_text), delimiter=delimiter)

    # Normalised key map: norm_key → original_key
    fieldnames = reader.fieldnames or []
    norm_keys = {_norm(k): k for k in fieldnames}

    def find_col(*keywords):
        for kw in keywords:
            for nk, ok in norm_keys.items():
                if kw in nk:
                    return ok
        return None

    date_col   = find_col('fecha contable', 'fecha op', 'f.op', 'fecha', 'date', 'data', 'fec')
    desc_col   = find_col('descripci', 'concepto', 'description', 'detalle', 'movimiento', 'texto')
    amount_col = find_col('importe', 'monto', 'amount')
    debit_col  = find_col('debito', 'cargo', 'debit', 'salida', 'retiro')
    credit_col = find_col('credito', 'abono', 'credit', 'entrada', 'haber', 'deposito')

    rows = []
    for line in reader:
        if not any(v and str(v).strip() for v in line.values()):
            continue  # skip blank rows

        # Date
        date_val = parse_date(str(line.get(date_col) or '')) if date_col else None

        # Description
        desc = str(line.get(desc_col) or '').strip() if desc_col else ''
        if not desc:
            desc = ' '.join(str(v) for v in list(line.values())[:3] if v and str(v).strip())

        # Amount
        amount = None
        if debit_col and credit_col:
            dv = parse_amount(str(line.get(debit_col) or ''))
            cv = parse_amount(str(line.get(credit_col) or ''))
            if cv and (not dv or dv == 0):
                amount = abs(cv)
            elif dv and (not cv or cv == 0):
                amount = -abs(dv)
        elif amount_col:
            amount = parse_amount(str(line.get(amount_col) or ''))
        else:
            # Last resort: try every column
            for k, v in line.items():
                if k in (date_col, desc_col):
                    continue
                amount = parse_amount(str(v or ''))
                if amount is not None:
                    break

        if amount is None or desc == '':
            continue

        rows.append({'date': date_val, 'description': desc, 'amount': amount})

    return rows


# ── XLS / XLSX parser ─────────────────────────────────────────────────────────

def parse_excel_bytes(content: bytes, filename: str, currency: models.Currency) -> list[dict]:
    import openpyxl
    rows = []
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active

    all_rows = list(ws.iter_rows(values_only=True))
    if not all_rows:
        return []

    # Find header row (first row with text content)
    header_row_idx = 0
    header = []
    for i, row in enumerate(all_rows[:10]):
        cells = [str(c or '').lower().strip() for c in row]
        if any(any(w in c for w in ['fecha','date','concepto','descripcion','importe','amount','debito','credito']) for c in cells):
            header = cells
            header_row_idx = i
            break

    if not header:
        # No header found, try positional: col0=date, col1=desc, col2=amount
        for row in all_rows:
            if not any(row):
                continue
            d = parse_date(str(row[0] or '')) if len(row) > 0 else None
            desc = str(row[1] or '').strip() if len(row) > 1 else ''
            amount = parse_amount(str(row[2] or '')) if len(row) > 2 else None
            if amount is not None:
                rows.append({'date': d, 'description': desc, 'amount': amount})
        return rows

    date_idx   = next((i for i, h in enumerate(header) if any(w in h for w in ['fecha','date','data','f.op','fec'])), None)
    desc_idx   = next((i for i, h in enumerate(header) if any(w in h for w in ['concepto','descripcion','description','detalle','movimiento','texto'])), None)
    amount_idx = next((i for i, h in enumerate(header) if any(w in h for w in ['importe','monto','amount','valor'])), None)
    debit_idx  = next((i for i, h in enumerate(header) if any(w in h for w in ['debito','débito','cargo','debit','salida'])), None)
    credit_idx = next((i for i, h in enumerate(header) if any(w in h for w in ['credito','crédito','abono','credit','entrada','haber'])), None)

    for row in all_rows[header_row_idx + 1:]:
        if not any(row):
            continue
        def cell(idx):
            return str(row[idx] or '').strip() if idx is not None and idx < len(row) else ''

        d = parse_date(cell(date_idx)) if date_idx is not None else None
        # Try parsing as Excel date serial number
        if d is None and date_idx is not None and row[date_idx]:
            try:
                from openpyxl.utils.datetime import from_excel
                d = from_excel(row[date_idx]).date()
            except Exception:
                pass

        desc = cell(desc_idx) if desc_idx is not None else ' | '.join(str(c or '') for c in row if c)
        amount = None
        if debit_idx is not None and credit_idx is not None:
            dv = parse_amount(cell(debit_idx))
            cv = parse_amount(cell(credit_idx))
            if cv and (not dv or dv == 0):
                amount = abs(cv)
            elif dv and (not cv or cv == 0):
                amount = -abs(dv)
        elif amount_idx is not None:
            v = row[amount_idx]
            if isinstance(v, (int, float)):
                amount = float(v)
            else:
                amount = parse_amount(cell(amount_idx))

        if amount is not None and desc:
            rows.append({'date': d, 'description': desc, 'amount': amount})

    wb.close()
    return rows


# ── Serialization ─────────────────────────────────────────────────────────────

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
    property_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    content = await file.read()
    filename = file.filename or "upload"
    cur = models.Currency(currency)
    fname_lower = filename.lower()

    try:
        if fname_lower.endswith('.pdf'):
            raw_rows = parse_pdf_bytes(content, cur)
        elif fname_lower.endswith('.csv'):
            raw_rows = parse_csv_bytes(content, cur)
        elif fname_lower.endswith(('.xlsx', '.xls')):
            raw_rows = parse_excel_bytes(content, filename, cur)
        else:
            raise HTTPException(status_code=400, detail="Solo se admiten archivos PDF, CSV, XLS o XLSX")
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500,
            detail=f"Error interno al procesar el archivo: {type(e).__name__}: {e}")

    if not raw_rows:
        raise HTTPException(status_code=422,
            detail="No se encontraron transacciones en el archivo. "
                   "Verificá que el archivo tenga datos y que el formato sea compatible.")

    # Validate fixed property if provided
    fixed_property = None
    if property_id:
        fixed_property = db.query(models.Property).filter(models.Property.id == property_id).first()
        if not fixed_property:
            raise HTTPException(status_code=404, detail="Propiedad no encontrada")

    properties = db.query(models.Property).all()

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
        if fixed_property:
            # User pre-selected a property: assign it directly, still suggest type/category
            row.suggested_property_id = fixed_property.id
            suggest_row(row, properties)           # fills type & category
            row.suggested_property_id = fixed_property.id  # ensure it stays after suggest_row
        else:
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
    bank_import = db.query(models.BankImport).filter(models.BankImport.id == import_id).first()
    if not bank_import:
        raise HTTPException(status_code=404, detail="Import not found")

    rows = db.query(models.BankImportRow).filter(
        models.BankImportRow.bank_import_id == import_id,
        models.BankImportRow.status == models.BankImportRowStatus.CONFIRMED,
        models.BankImportRow.created_expense_id == None,
        models.BankImportRow.created_payment_id == None,
    ).all()

    created_expenses = created_payments = 0

    for row in rows:
        prop_id = row.confirmed_property_id or row.suggested_property_id
        rtype   = row.confirmed_type or row.suggested_type
        cat     = row.confirmed_category or row.suggested_category or "other"
        tx_date = row.transaction_date or date(bank_import.period_year, bank_import.period_month, 1)

        if not prop_id:
            continue

        if rtype == "income":
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
