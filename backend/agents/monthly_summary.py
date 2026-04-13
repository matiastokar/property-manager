"""
AI Agent: Monthly Summary
Runs on day 10 of each month.
- Consolidates income, expenses and incidents for the previous month
- Generates a professional HTML email with tables
- Sends it via Gmail
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


RECIPIENT_EMAIL = os.getenv("RECIPIENT_EMAIL", "")
RECIPIENT_NAME  = os.getenv("RECIPIENT_NAME",  "Administrador")
GMAIL_USER      = os.getenv("GMAIL_USER",      "")
GMAIL_PASSWORD  = os.getenv("GMAIL_APP_PASSWORD", "")

MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

CATEGORY_LABELS = {
    "mortgage": "Hipoteca", "hoa": "Comunidad", "insurance": "Seguro",
    "cleaning": "Limpieza", "internet": "Internet",
    "electricity": "Electricidad", "gas": "Gas", "water": "Agua",
    "tax": "Tributos/Impuestos",
    "incident": "Incidencia", "repair": "Reparación",
    "improvement": "Mejora", "rent": "Alquiler", "other": "Otro",
}

# ── Email delivery ─────────────────────────────────────────────────────────────

def send_email(subject: str, html_body: str) -> bool:
    if not GMAIL_USER or not GMAIL_PASSWORD:
        print("[Email] GMAIL_USER / GMAIL_APP_PASSWORD not configured. Printing preview:\n")
        print(subject)
        print(html_body[:1000])
        return False
    if not RECIPIENT_EMAIL:
        print("[Email] RECIPIENT_EMAIL not configured.")
        return False
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"Gestor Patrimonial <{GMAIL_USER}>"
    msg["To"]      = f"{RECIPIENT_NAME} <{RECIPIENT_EMAIL}>"
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_PASSWORD)
            server.sendmail(GMAIL_USER, RECIPIENT_EMAIL, msg.as_string())
        print(f"[Email] Sent to {RECIPIENT_EMAIL}")
        return True
    except Exception as e:
        print(f"[Email] Error: {e}")
        return False


# ── Data helpers ───────────────────────────────────────────────────────────────

def fmt(amounts: dict[str, float]) -> str:
    if not amounts:
        return "—"
    return "  ".join(f"<strong>{v:,.2f} {k}</strong>" for k, v in sorted(amounts.items()))


def add_amounts(a: dict, b: dict) -> dict:
    result = dict(a)
    for k, v in b.items():
        result[k] = result.get(k, 0) + v
    return result


def net(income: dict, expenses: dict) -> dict:
    result = dict(income)
    for k, v in expenses.items():
        result[k] = result.get(k, 0) - v
    return result


# ── HTML builder ───────────────────────────────────────────────────────────────

COLORS = {
    "blue":  "#2563eb",
    "green": "#059669",
    "red":   "#dc2626",
    "amber": "#d97706",
    "gray":  "#6b7280",
    "light": "#f8fafc",
    "border":"#e2e8f0",
}

def html_card(title: str, content: str, border_color: str = COLORS["blue"]) -> str:
    return f"""
    <div style="border:1px solid {COLORS['border']};border-radius:10px;margin:16px 0;overflow:hidden;">
      <div style="background:{border_color};padding:10px 18px;">
        <h3 style="margin:0;color:#fff;font-size:14px;font-weight:600;">{title}</h3>
      </div>
      <div style="padding:16px 18px;background:#fff;">{content}</div>
    </div>"""


def html_kpi_row(kpis: list[tuple[str, str, str]]) -> str:
    """kpis = [(label, value, color), ...]"""
    cells = "".join(
        f"""<td style="text-align:center;padding:12px 8px;width:{100//len(kpis)}%;">
              <div style="font-size:11px;color:{COLORS['gray']};margin-bottom:4px;">{label}</div>
              <div style="font-size:18px;font-weight:700;color:{color};">{value}</div>
            </td>"""
        for label, value, color in kpis
    )
    return f'<table width="100%" style="border-collapse:collapse;"><tr>{cells}</tr></table>'


def html_table(headers: list[str], rows: list[list[str]], highlight_last: bool = False) -> str:
    header_html = "".join(
        f'<th style="text-align:left;padding:8px 10px;font-size:12px;color:{COLORS["gray"]};'
        f'border-bottom:2px solid {COLORS["border"]};font-weight:600;">{h}</th>'
        for h in headers
    )
    body_html = ""
    for i, row in enumerate(rows):
        bg = COLORS["light"] if i % 2 == 0 else "#fff"
        cells = "".join(
            f'<td style="padding:7px 10px;font-size:12px;border-bottom:1px solid {COLORS["border"]};">{c}</td>'
            for c in row
        )
        body_html += f'<tr style="background:{bg};">{cells}</tr>'
    return f'<table width="100%" style="border-collapse:collapse;"><thead><tr>{header_html}</tr></thead><tbody>{body_html}</tbody></table>'


def colored_amount(amounts: dict[str, float], positive_is_good: bool = True) -> str:
    if not amounts:
        return '<span style="color:#9ca3af;">—</span>'
    parts = []
    for cur, val in sorted(amounts.items()):
        is_positive = val >= 0
        color = COLORS["green"] if (is_positive == positive_is_good) else COLORS["red"]
        sign  = "+" if is_positive else ""
        parts.append(f'<span style="color:{color};font-weight:600;">{sign}{val:,.2f} {cur}</span>')
    return "  ".join(parts)


# ── Claude narrative ───────────────────────────────────────────────────────────

def get_claude_analysis(summary_text: str, month_name: str, year: int) -> str:
    """Ask Claude for a short executive narrative. Returns plain HTML paragraphs."""
    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return "<p>Análisis automático no disponible (ANTHROPIC_API_KEY no configurada).</p>"

        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=800,
            system=(
                "Eres un asesor de gestión patrimonial inmobiliaria. "
                "Redactá un análisis ejecutivo breve (3-4 párrafos en español) basado en los datos. "
                "Destacá puntos positivos, alertas importantes e incidencias abiertas. "
                "Devolvé solo el texto en HTML (<p> tags), sin HTML exterior ni markdown."
            ),
            messages=[{
                "role": "user",
                "content": f"Datos del mes de {month_name} {year}:\n\n{summary_text}"
            }]
        )
        # Extract text block
        text = next((b.text for b in response.content if hasattr(b, "text") and b.type == "text"), "")
        return text or "<p>No se pudo generar el análisis automático.</p>"
    except Exception as e:
        print(f"[Claude] Error: {e}")
        return f"<p>Análisis automático no disponible: {e}</p>"


# ── Main agent ─────────────────────────────────────────────────────────────────

def run_monthly_summary_agent():
    now = datetime.now()
    if now.month == 1:
        report_month, report_year = 12, now.year - 1
    else:
        report_month, report_year = now.month - 1, now.year

    month_name = MONTH_NAMES[report_month - 1]
    print(f"\n=== Monthly Summary Agent — {month_name} {report_year} ===")

    db: Session = SessionLocal()
    try:
        # ── Gather data ──────────────────────────────────────────────────────
        properties = db.query(models.Property).all()

        total_income:   dict[str, float] = {}
        total_expenses: dict[str, float] = {}
        property_rows   = []   # for property table
        expense_detail  = []   # category breakdown across all properties

        for prop in properties:
            # Income (rent payments)
            payments = db.query(models.RentPayment).join(models.Contract).filter(
                models.Contract.property_id == prop.id,
                models.RentPayment.period_year  == report_year,
                models.RentPayment.period_month == report_month,
            ).all()
            prop_income: dict[str, float] = {}
            for p in payments:
                cur = p.currency.value
                prop_income[cur]   = prop_income.get(cur, 0)   + p.amount
                total_income[cur]  = total_income.get(cur, 0)  + p.amount

            # Expenses
            expenses = db.query(models.Expense).filter(
                models.Expense.property_id == prop.id,
                extract("year",  models.Expense.expense_date) == report_year,
                extract("month", models.Expense.expense_date) == report_month,
            ).all()
            prop_expenses: dict[str, float] = {}
            prop_fixed:    dict[str, float] = {}
            prop_variable: dict[str, float] = {}
            cat_totals:    dict[str, dict]  = {}

            for e in expenses:
                cur = e.currency.value
                prop_expenses[cur] = prop_expenses.get(cur, 0) + e.amount
                total_expenses[cur] = total_expenses.get(cur, 0) + e.amount
                if e.expense_type == models.ExpenseType.FIXED:
                    prop_fixed[cur] = prop_fixed.get(cur, 0) + e.amount
                else:
                    prop_variable[cur] = prop_variable.get(cur, 0) + e.amount
                cat = CATEGORY_LABELS.get(e.category, e.category)
                if cat not in cat_totals:
                    cat_totals[cat] = {}
                cat_totals[cat][cur] = cat_totals[cat].get(cur, 0) + e.amount
                expense_detail.append((prop.name, cat, cur, e.amount))

            # Incidents created this month
            incidents = db.query(models.Incident).filter(
                models.Incident.property_id == prop.id,
                extract("year",  models.Incident.created_at) == report_year,
                extract("month", models.Incident.created_at) == report_month,
            ).all()

            if prop_income or prop_expenses or incidents:
                prop_net = net(prop_income, prop_expenses)
                property_rows.append({
                    "name":      prop.name,
                    "city":      prop.city,
                    "country":   prop.country,
                    "income":    prop_income,
                    "expenses":  prop_expenses,
                    "fixed":     prop_fixed,
                    "variable":  prop_variable,
                    "net":       prop_net,
                    "incidents": incidents,
                    "cat_totals": cat_totals,
                })

        # Open incidents (all statuses != resolved)
        open_incidents = db.query(models.Incident).filter(
            models.Incident.status != models.IncidentStatus.RESOLVED
        ).all()

        total_net = net(total_income, total_expenses)

        # ── Plain-text summary for Claude ───────────────────────────────────
        def fmt_plain(d: dict) -> str:
            return "  ".join(f"{v:,.2f} {k}" for k, v in d.items()) if d else "0"

        summary_lines = [
            f"Mes: {month_name} {report_year}",
            f"Ingresos totales: {fmt_plain(total_income)}",
            f"Gastos totales: {fmt_plain(total_expenses)}",
            f"Resultado neto: {fmt_plain(total_net)}",
            f"Incidencias abiertas: {len(open_incidents)}",
            "",
        ]
        for p in property_rows:
            summary_lines.append(f"Propiedad: {p['name']} ({p['city']})")
            summary_lines.append(f"  Ingresos: {fmt_plain(p['income'])}")
            summary_lines.append(f"  Gastos: {fmt_plain(p['expenses'])}")
            summary_lines.append(f"  Neto: {fmt_plain(p['net'])}")
            summary_lines.append(f"  Incidencias nuevas: {len(p['incidents'])}")
        if open_incidents:
            summary_lines.append("\nIncidencias abiertas:")
            for i in open_incidents:
                summary_lines.append(f"  - {i.title} [{i.status.value}]")

        summary_text = "\n".join(summary_lines)
        print(summary_text)

        # ── Claude analysis ─────────────────────────────────────────────────
        analysis_html = get_claude_analysis(summary_text, month_name, report_year)

        # ── Build HTML email ────────────────────────────────────────────────

        # KPI bar
        def first_currency_str(d: dict, positive_is_good: bool = True) -> tuple[str, str]:
            """Returns (formatted_str, color) using first currency found."""
            if not d:
                return "—", COLORS["gray"]
            cur, val = next(iter(sorted(d.items())))
            color = COLORS["green"] if (val >= 0) == positive_is_good else COLORS["red"]
            sign  = "+" if val >= 0 else ""
            return f"{sign}{val:,.2f} {cur}", color

        income_str,   income_color   = first_currency_str(total_income,   True)
        expenses_str, expenses_color = first_currency_str(total_expenses,  False)
        net_str,      net_color      = first_currency_str(total_net,       True)

        kpi_html = html_kpi_row([
            ("Ingresos",     income_str,   income_color),
            ("Gastos",       expenses_str, expenses_color),
            ("Resultado Neto", net_str,    net_color),
            ("Incidencias Abiertas", str(len(open_incidents)),
             COLORS["amber"] if open_incidents else COLORS["green"]),
        ])

        # Property table
        if property_rows:
            prop_table_rows = []
            for p in property_rows:
                status_icons = ""
                if p["incidents"]:
                    status_icons += f'⚠️ {len(p["incidents"])} nueva(s)'
                prop_table_rows.append([
                    f'<strong>{p["name"]}</strong><br><span style="color:{COLORS["gray"]};font-size:11px;">{p["city"]}, {p["country"]}</span>',
                    colored_amount(p["income"],   True),
                    colored_amount(p["expenses"], False),
                    colored_amount(p["net"],      True),
                    status_icons or "—",
                ])
            properties_html = html_table(
                ["Propiedad", "Ingresos", "Gastos", "Neto", "Incidencias"],
                prop_table_rows,
            )
        else:
            properties_html = "<p style='color:#9ca3af;text-align:center;padding:20px;'>Sin movimientos registrados en este período.</p>"

        # Expense category breakdown
        if expense_detail:
            # Aggregate by category
            cat_agg: dict[str, dict[str, float]] = {}
            for prop_name, cat, cur, amt in expense_detail:
                if cat not in cat_agg:
                    cat_agg[cat] = {}
                cat_agg[cat][cur] = cat_agg[cat].get(cur, 0) + amt
            cat_rows = sorted(
                [(cat, totals) for cat, totals in cat_agg.items()],
                key=lambda x: -sum(x[1].values())
            )
            cat_table_rows = [
                [cat, colored_amount(totals, False)]
                for cat, totals in cat_rows
            ]
            categories_html = html_table(["Categoría", "Total"], cat_table_rows)
        else:
            categories_html = "<p style='color:#9ca3af;text-align:center;padding:20px;'>Sin gastos registrados.</p>"

        # Open incidents table
        if open_incidents:
            STATUS_LABEL = {
                "open": "🔴 Abierta",
                "in_progress": "🟡 En progreso",
                "resolved": "🟢 Resuelta",
            }
            # Get property names
            prop_name_map = {p.id: p.name for p in properties}
            inc_rows = [
                [
                    f'<strong>{i.title}</strong>',
                    prop_name_map.get(i.property_id, f"Prop {i.property_id}"),
                    STATUS_LABEL.get(i.status.value, i.status.value),
                    i.incident_date.strftime("%d/%m/%Y") if i.incident_date else "—",
                ]
                for i in open_incidents
            ]
            incidents_html = html_table(
                ["Incidencia", "Propiedad", "Estado", "Fecha"],
                inc_rows,
            )
        else:
            incidents_html = "<p style='color:#059669;'>✅ No hay incidencias abiertas.</p>"

        # ── Assemble full email ─────────────────────────────────────────────
        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td>
  <table width="620" cellpadding="0" cellspacing="0" align="center" style="max-width:620px;margin:0 auto;">

    <!-- Header -->
    <tr><td style="background:{COLORS['blue']};border-radius:12px 12px 0 0;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">
        📊 Resumen Mensual — {month_name} {report_year}
      </h1>
      <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">
        Gestor Patrimonial · Generado el {now.strftime('%d/%m/%Y a las %H:%M')}
      </p>
    </td></tr>

    <!-- KPIs -->
    <tr><td style="background:#fff;padding:20px 32px;border-left:1px solid {COLORS['border']};border-right:1px solid {COLORS['border']};">
      {kpi_html}
    </td></tr>

    <!-- Divider -->
    <tr><td style="background:#fff;padding:0 32px;">
      <hr style="border:none;border-top:1px solid {COLORS['border']};margin:0;">
    </td></tr>

    <!-- AI Analysis -->
    <tr><td style="background:#fff;padding:20px 32px;border-left:1px solid {COLORS['border']};border-right:1px solid {COLORS['border']};">
      <h2 style="margin:0 0 12px;font-size:15px;color:#1e293b;">🤖 Análisis Ejecutivo</h2>
      <div style="font-size:13px;color:#334155;line-height:1.7;">
        {analysis_html}
      </div>
    </td></tr>

    <!-- Properties -->
    <tr><td style="background:#fff;padding:4px 32px 20px;border-left:1px solid {COLORS['border']};border-right:1px solid {COLORS['border']};">
      {html_card("🏠 Ingresos y Gastos por Propiedad", properties_html, COLORS['blue'])}
    </td></tr>

    <!-- Expense categories -->
    <tr><td style="background:#fff;padding:0 32px 20px;border-left:1px solid {COLORS['border']};border-right:1px solid {COLORS['border']};">
      {html_card("📂 Detalle de Gastos por Categoría", categories_html, COLORS['amber'])}
    </td></tr>

    <!-- Incidents -->
    <tr><td style="background:#fff;padding:0 32px 24px;border-left:1px solid {COLORS['border']};border-right:1px solid {COLORS['border']};">
      {html_card("⚠️ Incidencias Abiertas", incidents_html,
                 COLORS['red'] if open_incidents else COLORS['green'])}
    </td></tr>

    <!-- Footer -->
    <tr><td style="background:{COLORS['light']};border:1px solid {COLORS['border']};border-top:none;
                   border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
      <p style="margin:0;font-size:11px;color:{COLORS['gray']};">
        Este resumen fue generado automáticamente por el Gestor Patrimonial.<br>
        {now.strftime('%d/%m/%Y %H:%M')} · Período: {month_name} {report_year}
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>"""

        subject = f"📊 Resumen {month_name} {report_year} — Gestor Patrimonial"
        send_email(subject, html)
        print(f"[Agent] Monthly summary completed for {month_name} {report_year}.")

    finally:
        db.close()


if __name__ == "__main__":
    run_monthly_summary_agent()
