"""
AI Agent: Monthly Summary
Runs on day 10 of each month.
- Analyzes income, expenses, and incidents for the previous month
- Sends an email summary via Gmail
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import date, datetime
from pathlib import Path

import anthropic
from sqlalchemy.orm import Session
from sqlalchemy import extract

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from database import SessionLocal
import models


RECIPIENT_EMAIL = os.getenv("RECIPIENT_EMAIL", "ignacio.rollan@example.com")
RECIPIENT_NAME = "Ignacio Rollan"
GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")


def send_email(to_email: str, to_name: str, subject: str, body: str):
    if not GMAIL_USER or not GMAIL_PASSWORD:
        print(f"[Email not configured] Would send to {to_email}:\n{subject}")
        print(body[:500])
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
        print(f"Summary email sent to {to_email}")
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def run_monthly_summary_agent():
    """Generate and send a monthly summary of income, expenses, and incidents."""
    now = datetime.now()
    # Summarize the previous month
    if now.month == 1:
        report_month = 12
        report_year = now.year - 1
    else:
        report_month = now.month - 1
        report_year = now.year

    month_names = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]
    month_name = month_names[report_month - 1]

    db: Session = SessionLocal()
    try:
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

        props = db.query(models.Property).all()

        # Aggregate data
        total_income: dict[str, float] = {}
        total_expenses: dict[str, float] = {}
        total_fixed: dict[str, float] = {}
        total_variable: dict[str, float] = {}
        property_summaries = []

        for prop in props:
            # Income
            prop_income: dict[str, float] = {}
            payments = db.query(models.RentPayment).join(models.Contract).filter(
                models.Contract.property_id == prop.id,
                models.RentPayment.period_year == report_year,
                models.RentPayment.period_month == report_month
            ).all()
            for p in payments:
                cur = p.currency.value
                prop_income[cur] = prop_income.get(cur, 0) + p.amount
                total_income[cur] = total_income.get(cur, 0) + p.amount

            # Expenses
            prop_expenses: dict[str, float] = {}
            prop_fixed: dict[str, float] = {}
            prop_variable: dict[str, float] = {}
            expenses = db.query(models.Expense).filter(
                models.Expense.property_id == prop.id,
                extract("year", models.Expense.expense_date) == report_year,
                extract("month", models.Expense.expense_date) == report_month
            ).all()
            for e in expenses:
                cur = e.currency.value
                prop_expenses[cur] = prop_expenses.get(cur, 0) + e.amount
                total_expenses[cur] = total_expenses.get(cur, 0) + e.amount
                if e.expense_type == models.ExpenseType.FIXED:
                    prop_fixed[cur] = prop_fixed.get(cur, 0) + e.amount
                    total_fixed[cur] = total_fixed.get(cur, 0) + e.amount
                else:
                    prop_variable[cur] = prop_variable.get(cur, 0) + e.amount
                    total_variable[cur] = total_variable.get(cur, 0) + e.amount

            # Incidents (new or updated this month)
            incidents = db.query(models.Incident).filter(
                models.Incident.property_id == prop.id,
                extract("year", models.Incident.created_at) == report_year,
                extract("month", models.Incident.created_at) == report_month
            ).all()

            if prop_income or prop_expenses or incidents:
                property_summaries.append({
                    "name": prop.name,
                    "city": prop.city,
                    "country": prop.country,
                    "income": prop_income,
                    "expenses": prop_expenses,
                    "fixed_expenses": prop_fixed,
                    "variable_expenses": prop_variable,
                    "new_incidents": [
                        {"title": i.title, "status": i.status.value, "date": i.incident_date.isoformat()}
                        for i in incidents
                    ]
                })

        # All open incidents
        open_incidents = db.query(models.Incident).filter(
            models.Incident.status != models.IncidentStatus.RESOLVED
        ).all()

        def fmt_amounts(d: dict) -> str:
            if not d:
                return "0"
            return " | ".join(f"{v:,.2f} {k}" for k, v in d.items())

        # Build data summary for Claude
        summary_data = f"""
RESUMEN MENSUAL - {month_name} {report_year}
Generado: {now.strftime('%d/%m/%Y %H:%M')}

=== TOTALES GLOBALES ===
Ingresos totales: {fmt_amounts(total_income)}
Gastos totales: {fmt_amounts(total_expenses)}
  - Gastos fijos: {fmt_amounts(total_fixed)}
  - Gastos variables: {fmt_amounts(total_variable)}

=== POR PROPIEDAD ===
{chr(10).join([f'''
{p['name']} ({p['city']}, {p['country']}):
  Ingresos: {fmt_amounts(p['income'])}
  Gastos: {fmt_amounts(p['expenses'])} (Fijos: {fmt_amounts(p['fixed_expenses'])} | Variables: {fmt_amounts(p['variable_expenses'])})
  Incidencias nuevas: {len(p['new_incidents'])}
  {chr(10).join([f"    - {i['title']} [{i['status']}]" for i in p['new_incidents']]) if p['new_incidents'] else "  Sin incidencias nuevas"}
''' for p in property_summaries]) if property_summaries else "Sin movimientos este mes"}

=== INCIDENCIAS ABIERTAS ===
Total abiertas: {len(open_incidents)}
{chr(10).join([f"- {i.title} (Propiedad ID: {i.property_id}) [{i.status.value}]" for i in open_incidents]) if open_incidents else "No hay incidencias abiertas"}
""".strip()

        print(f"\n=== Monthly Summary Agent - {month_name} {report_year} ===")
        print(summary_data)

        # Use Claude to generate a professional email
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=2048,
            thinking={"type": "adaptive"},
            system="""Eres un asistente de gestión patrimonial.
Redacta un resumen mensual profesional y claro en español con los datos proporcionados.
El email debe estar en HTML con buen formato, tablas donde sea útil, y resaltar puntos importantes.
Incluye: resumen ejecutivo, desglose de ingresos y gastos, incidencias abiertas, y observaciones relevantes.
Sé conciso pero completo.""",
            messages=[{
                "role": "user",
                "content": f"""Redacta el email de resumen mensual para {RECIPIENT_NAME} con los siguientes datos:

{summary_data}

El email debe incluir: resumen ejecutivo, tabla de ingresos y gastos por propiedad, estado de incidencias, y conclusiones."""
            }]
        )

        email_body = next(
            (block.text for block in response.content if block.type == "text"), ""
        )

        full_email = f"""
{email_body}
<br><br>
<hr>
<small>Este resumen fue generado automáticamente el {now.strftime('%d/%m/%Y %H:%M')}.</small>
"""

        subject = f"Resumen Mensual Patrimonio - {month_name} {report_year}"
        send_email(RECIPIENT_EMAIL, RECIPIENT_NAME, subject, full_email)
        print(f"\nMonthly summary agent completed.")

    finally:
        db.close()


if __name__ == "__main__":
    run_monthly_summary_agent()
