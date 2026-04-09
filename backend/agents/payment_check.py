"""
AI Agent: Payment Check
Runs on day 10 of each month.
- Checks all active contracts for payment records
- If a payment is missing, emails Ignacio Rollan asking for payment ETA
- Can also read an Excel file (Cuenta corriente alquileres) for cross-reference
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import date, datetime
from pathlib import Path

import anthropic
from sqlalchemy.orm import Session

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from database import SessionLocal
import models


RECIPIENT_EMAIL = os.getenv("RECIPIENT_EMAIL", "ignacio.rollan@example.com")
RECIPIENT_NAME = "Ignacio Rollan"
GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")  # Use App Password
ACCOUNTS_FILE = os.getenv("ACCOUNTS_FILE", "")  # Path to Excel file


def send_email(to_email: str, to_name: str, subject: str, body: str):
    """Send an email via Gmail SMTP."""
    if not GMAIL_USER or not GMAIL_PASSWORD:
        print(f"[Email not configured] Would send to {to_email}: {subject}")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Property Manager <{GMAIL_USER}>"
    msg["To"] = f"{to_name} <{to_email}>"

    msg.attach(MIMEText(body, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
        print(f"Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def read_accounts_file() -> str:
    """Read the Excel accounts file if it exists and return as text."""
    if not ACCOUNTS_FILE or not Path(ACCOUNTS_FILE).exists():
        return ""
    try:
        import pandas as pd
        df = pd.read_excel(ACCOUNTS_FILE)
        return df.to_string()
    except Exception as e:
        print(f"Error reading accounts file: {e}")
        return ""


def run_payment_check_agent():
    """Main agent logic for payment checking."""
    now = datetime.now()
    check_month = now.month
    check_year = now.year

    # If running early in month, check previous month
    if now.day <= 10:
        # Check current month payments
        pass

    db: Session = SessionLocal()
    try:
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

        # Get all active contracts
        active_contracts = db.query(models.Contract).filter(
            models.Contract.status == models.ContractStatus.ACTIVE
        ).all()

        if not active_contracts:
            print("No active contracts found.")
            return

        # Check which contracts are missing payments this month
        missing_payments = []
        paid_contracts = []

        for contract in active_contracts:
            payment = db.query(models.RentPayment).filter(
                models.RentPayment.contract_id == contract.id,
                models.RentPayment.period_year == check_year,
                models.RentPayment.period_month == check_month
            ).first()

            prop = db.query(models.Property).filter(
                models.Property.id == contract.property_id
            ).first()

            if not payment:
                missing_payments.append({
                    "contract_id": contract.id,
                    "tenant": contract.tenant_name,
                    "property": prop.name if prop else "Unknown",
                    "city": prop.city if prop else "",
                    "country": prop.country if prop else "",
                    "monthly_rent": contract.monthly_rent,
                    "currency": contract.currency.value,
                    "tenant_email": contract.tenant_email,
                })
            else:
                paid_contracts.append({
                    "tenant": contract.tenant_name,
                    "property": prop.name if prop else "Unknown",
                    "has_proof": payment.has_proof,
                    "reference": payment.reference,
                })

        # Read accounts file for additional context
        accounts_data = read_accounts_file()

        # Build context for Claude
        month_name = [
            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
        ][check_month - 1]

        context = f"""
Fecha de verificación: {now.strftime('%d/%m/%Y')}
Mes a verificar: {month_name} {check_year}

Contratos con pago registrado ({len(paid_contracts)}):
{chr(10).join([f"- {p['property']} ({p['tenant']}): {'Con comprobante' if p['has_proof'] else 'Sin comprobante'}" for p in paid_contracts]) if paid_contracts else "Ninguno"}

Contratos SIN pago registrado ({len(missing_payments)}):
{chr(10).join([f"- {m['property']} en {m['city']}, {m['country']} | Inquilino: {m['tenant']} | Renta: {m['monthly_rent']} {m['currency']}" for m in missing_payments]) if missing_payments else "Ninguno"}

{f"Datos del archivo Cuenta Corriente:{chr(10)}{accounts_data}" if accounts_data else ""}
""".strip()

        print(f"\n=== Payment Check Agent - {month_name} {check_year} ===")
        print(context)

        if not missing_payments:
            print("All payments received. No emails needed.")
            return

        # Use Claude to compose a professional email for each missing payment
        for missing in missing_payments:
            response = client.messages.create(
                model="claude-opus-4-6",
                max_tokens=1024,
                thinking={"type": "adaptive"},
                system="""Eres un asistente de gestión patrimonial.
Redacta emails profesionales y cordiales en español para consultar sobre pagos de alquiler pendientes.
El email debe ser breve, profesional, y preguntar cuándo estima que realizará el pago o si existe alguna incidencia.
Devuelve solo el cuerpo del email en HTML, sin encabezados ni firmas adicionales.""",
                messages=[{
                    "role": "user",
                    "content": f"""Redacta un email a {RECIPIENT_NAME} ({RECIPIENT_EMAIL})
consultando sobre el pago de alquiler pendiente de {month_name} {check_year} para:
- Propiedad: {missing['property']} en {missing['city']}, {missing['country']}
- Inquilino registrado: {missing['tenant']}
- Monto: {missing['monthly_rent']} {missing['currency']}

Pregunta cuándo estima que se realizará el pago o si hay alguna incidencia que deba conocer."""
                }]
            )

            email_body = next(
                (block.text for block in response.content if block.type == "text"), ""
            )

            full_email = f"""
{email_body}
<br><br>
<hr>
<small>Este email fue generado automáticamente por el sistema de gestión patrimonial el {now.strftime('%d/%m/%Y')}.</small>
"""

            subject = f"Consulta Pago Alquiler - {missing['property']} - {month_name} {check_year}"
            send_email(RECIPIENT_EMAIL, RECIPIENT_NAME, subject, full_email)

        print(f"\nAgent completed. Processed {len(missing_payments)} missing payment(s).")

    finally:
        db.close()


if __name__ == "__main__":
    run_payment_check_agent()
