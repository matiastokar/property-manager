import { useEffect, useState, useMemo } from 'react'
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, ChevronsUpDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { rentsApi, type PaymentStatus, type RentPayment } from '../api/client'
import Modal from '../components/Modal'

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const METHOD_OPTIONS = ['Transferencia', 'Efectivo', 'Otro']

// ── Quick-pay modal ─────────────────────────────────────────────────────────
function QuickPayForm({ row, month, year, onSave, onCancel }: {
  row: PaymentStatus
  month: number
  year: number
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    amount: row.expected_amount,
    currency: row.currency,
    payment_date: today,
    payment_method: 'Transferencia',
    reference: '',
    has_proof: false,
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        contract_id: row.contract_id,
        amount: Number(form.amount),
        currency: form.currency,
        payment_date: form.payment_date,
        period_month: month,
        period_year: year,
        payment_method: form.payment_method,
        reference: form.reference,
        has_proof: form.has_proof,
        notes: form.notes,
      })
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-3 text-sm">
        <p className="font-medium text-gray-800">{row.property_name}</p>
        <p className="text-gray-500">{row.tenant_name} · {MONTH_NAMES[month - 1]} {year}</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="label">Monto *</label>
          <input className="input" type="number" step="0.01" value={form.amount}
            onChange={e => set('amount', e.target.value)} required />
        </div>
        <div>
          <label className="label">Moneda</label>
          <select className="input" value={form.currency} onChange={e => set('currency', e.target.value)}>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Fecha de pago *</label>
        <input className="input" type="date" value={form.payment_date}
          onChange={e => set('payment_date', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Método</label>
          <select className="input" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
            {METHOD_OPTIONS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Referencia</label>
          <input className="input" value={form.reference} onChange={e => set('reference', e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="proof" className="w-4 h-4 rounded text-blue-600"
          checked={form.has_proof} onChange={e => set('has_proof', e.target.checked)} />
        <label htmlFor="proof" className="text-sm text-gray-700">Tiene comprobante</label>
      </div>
      <div>
        <label className="label">Notas</label>
        <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Registrando...' : 'Registrar pago'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

// ── Edit payment modal ───────────────────────────────────────────────────────
function EditPayForm({ payment, onSave, onCancel }: {
  payment: RentPayment
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    amount: payment.amount,
    currency: payment.currency,
    payment_date: payment.payment_date,
    payment_method: payment.payment_method ?? 'Transferencia',
    reference: payment.reference ?? '',
    has_proof: payment.has_proof,
    notes: payment.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try { await onSave({ ...form, amount: Number(form.amount) }) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="label">Monto *</label>
          <input className="input" type="number" step="0.01" value={form.amount}
            onChange={e => set('amount', e.target.value)} required />
        </div>
        <div>
          <label className="label">Moneda</label>
          <select className="input" value={form.currency} onChange={e => set('currency', e.target.value)}>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Fecha de pago *</label>
        <input className="input" type="date" value={form.payment_date}
          onChange={e => set('payment_date', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Método</label>
          <select className="input" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
            {METHOD_OPTIONS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Referencia</label>
          <input className="input" value={form.reference} onChange={e => set('reference', e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="proof2" className="w-4 h-4 rounded text-blue-600"
          checked={form.has_proof} onChange={e => set('has_proof', e.target.checked)} />
        <label htmlFor="proof2" className="text-sm text-gray-700">Tiene comprobante</label>
      </div>
      <div>
        <label className="label">Notas</label>
        <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

// ── Sort icon ────────────────────────────────────────────────────────────────
type SortKey = 'property_name' | 'tenant_name' | 'expected_amount' | 'paid'
type SortDir = 'asc' | 'desc'

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="inline w-3 h-3 ml-1 text-gray-300" />
  return sortDir === 'asc'
    ? <ChevronUp className="inline w-3 h-3 ml-1 text-blue-500" />
    : <ChevronDown className="inline w-3 h-3 ml-1 text-blue-500" />
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function PaymentStatusPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [rows, setRows] = useState<PaymentStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<PaymentStatus | null>(null)
  const [editingPayment, setEditingPayment] = useState<RentPayment | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'pending'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('paid')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  const load = () => {
    setLoading(true)
    rentsApi.getPaymentStatus(year, month)
      .then(setRows)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [month, year])

  const handlePay = async (data: any) => {
    await rentsApi.create(data)
    setPaying(null)
    load()
  }

  const handleEdit = async (data: any) => {
    if (!editingPayment) return
    await rentsApi.update(editingPayment.id, data)
    setEditingPayment(null)
    load()
  }

  const handleDelete = async (paymentId: number) => {
    if (!confirm('¿Eliminar este pago? El contrato quedará como pendiente.')) return
    await rentsApi.delete(paymentId)
    load()
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let data = rows.filter(r => {
      if (filterStatus === 'paid') return r.paid
      if (filterStatus === 'pending') return !r.paid
      return true
    })
    return [...data].sort((a, b) => {
      let av: any, bv: any
      if (sortKey === 'paid') { av = a.paid ? 1 : 0; bv = b.paid ? 1 : 0 }
      else if (sortKey === 'expected_amount') { av = a.expected_amount; bv = b.expected_amount }
      else { av = (a[sortKey] ?? '').toLowerCase(); bv = (b[sortKey] ?? '').toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [rows, filterStatus, sortKey, sortDir])

  // Summary stats
  const stats = useMemo(() => {
    const paid = rows.filter(r => r.paid)
    const pending = rows.filter(r => !r.paid)
    const paidByCurrency = paid.reduce<Record<string, number>>((acc, r) => {
      const amt = r.payment?.amount ?? r.expected_amount
      const cur = r.payment?.currency ?? r.currency
      acc[cur] = (acc[cur] ?? 0) + amt
      return acc
    }, {})
    const pendingByCurrency = pending.reduce<Record<string, number>>((acc, r) => {
      acc[r.currency] = (acc[r.currency] ?? 0) + r.expected_amount
      return acc
    }, {})
    return { paid: paid.length, pending: pending.length, paidByCurrency, pendingByCurrency }
  }, [rows])

  const diffAmount = (row: PaymentStatus) => {
    if (!row.payment) return null
    const diff = row.payment.amount - row.expected_amount
    if (Math.abs(diff) < 0.01) return null
    return diff
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estado de Pagos</h1>
          <p className="text-gray-500 text-sm mt-1">
            Control mensual de cobros · {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
        <div className="flex gap-3">
          <select className="input w-auto" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select className="input w-auto" value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Paid */}
          <div className="card border-l-4 border-emerald-400 py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Cobrados</p>
                <p className="text-2xl font-bold text-emerald-600">{stats.paid}</p>
                <div className="text-xs text-emerald-600 mt-0.5 space-y-0">
                  {Object.entries(stats.paidByCurrency).map(([cur, val]) => (
                    <div key={cur}>{val.toLocaleString('es-ES', { maximumFractionDigits: 0 })} {cur}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Pending */}
          <div className="card border-l-4 border-red-400 py-4">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Pendientes</p>
                <p className="text-2xl font-bold text-red-500">{stats.pending}</p>
                <div className="text-xs text-red-500 mt-0.5">
                  {Object.entries(stats.pendingByCurrency).map(([cur, val]) => (
                    <div key={cur}>{val.toLocaleString('es-ES', { maximumFractionDigits: 0 })} {cur}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Progress */}
          <div className="card py-4">
            <div className="flex items-center gap-3 mb-3">
              <Clock className="w-8 h-8 text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Completado</p>
                <p className="text-2xl font-bold text-gray-800">
                  {rows.length > 0 ? Math.round((stats.paid / rows.length) * 100) : 0}%
                </p>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{ width: `${rows.length > 0 ? (stats.paid / rows.length) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{stats.paid} de {rows.length} contratos</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'paid', 'pending'] as const).map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === f
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {f === 'all' ? `Todos (${rows.length})` : f === 'paid' ? `Cobrados (${stats.paid})` : `Pendientes (${stats.pending})`}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                {([
                  ['paid', 'Estado', 'text-center'],
                  ['property_name', 'Propiedad', ''],
                  ['tenant_name', 'Inquilino', ''],
                  ['expected_amount', 'Esperado', 'text-right'],
                ] as [SortKey, string, string][]).map(([key, label, align]) => (
                  <th key={key}
                    className={`px-5 py-3 font-medium cursor-pointer select-none hover:text-gray-800 ${align}`}
                    onClick={() => handleSort(key)}>
                    {label}<SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                  </th>
                ))}
                <th className="px-5 py-3 font-medium text-right">Cobrado</th>
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Método</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(row => {
                const diff = diffAmount(row)
                return (
                  <tr key={row.contract_id}
                    className={`hover:bg-gray-50 ${!row.paid ? 'bg-red-50/30' : ''}`}>
                    {/* Status */}
                    <td className="px-5 py-3 text-center">
                      {row.paid
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                        : <XCircle className="w-5 h-5 text-red-400 mx-auto" />}
                    </td>
                    {/* Property */}
                    <td className="px-5 py-3 font-medium text-gray-900">{row.property_name}</td>
                    {/* Tenant */}
                    <td className="px-5 py-3">
                      <div className="text-gray-700">{row.tenant_name}</div>
                      {row.tenant_email && <div className="text-xs text-gray-400">{row.tenant_email}</div>}
                    </td>
                    {/* Expected */}
                    <td className="px-5 py-3 text-right text-gray-600 font-mono text-xs">
                      {row.expected_amount.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {row.currency}
                    </td>
                    {/* Paid amount */}
                    <td className="px-5 py-3 text-right">
                      {row.payment ? (
                        <div>
                          <span className="font-semibold text-emerald-700">
                            {row.payment.amount.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {row.payment.currency}
                          </span>
                          {diff !== null && (
                            <span className={`ml-1 text-xs ${diff > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              ({diff > 0 ? '+' : ''}{diff.toLocaleString('es-ES', { maximumFractionDigits: 2 })})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* Date */}
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {row.payment?.payment_date ?? <span className="text-gray-300">—</span>}
                    </td>
                    {/* Method */}
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {row.payment?.payment_method ?? <span className="text-gray-300">—</span>}
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-3">
                      <div className="flex gap-1 justify-end items-center">
                        {!row.paid ? (
                          <button
                            onClick={() => setPaying(row)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Registrar
                          </button>
                        ) : (
                          <>
                            <button className="p-1.5 text-gray-400 hover:text-blue-600" title="Editar pago"
                              onClick={() => setEditingPayment(row.payment!)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 text-gray-400 hover:text-red-500" title="Eliminar pago"
                              onClick={() => handleDelete(row.payment!.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                    No hay contratos activos para {MONTH_NAMES[month - 1]} {year}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {paying && (
        <Modal title="Registrar pago" onClose={() => setPaying(null)} size="lg">
          <QuickPayForm row={paying} month={month} year={year}
            onSave={handlePay} onCancel={() => setPaying(null)} />
        </Modal>
      )}
      {editingPayment && (
        <Modal title="Editar pago" onClose={() => setEditingPayment(null)} size="lg">
          <EditPayForm payment={editingPayment}
            onSave={handleEdit} onCancel={() => setEditingPayment(null)} />
        </Modal>
      )}
    </div>
  )
}
