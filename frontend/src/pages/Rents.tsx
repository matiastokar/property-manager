import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, CreditCard, CheckCircle, XCircle } from 'lucide-react'
import { rentsApi, contractsApi, type RentPayment, type Contract } from '../api/client'
import Modal from '../components/Modal'

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function PaymentForm({ initial, contracts, onSave, onCancel }: {
  initial?: Partial<RentPayment>
  contracts: Contract[]
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const now = new Date()
  const [form, setForm] = useState({
    contract_id: initial?.contract_id ?? (contracts[0]?.id ?? 0),
    amount: initial?.amount ?? '',
    currency: initial?.currency ?? 'EUR',
    payment_date: initial?.payment_date ?? now.toISOString().slice(0, 10),
    period_month: initial?.period_month ?? now.getMonth() + 1,
    period_year: initial?.period_year ?? now.getFullYear(),
    payment_method: initial?.payment_method ?? 'Transferencia',
    reference: initial?.reference ?? '',
    has_proof: initial?.has_proof ?? false,
    notes: initial?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  // Auto-fill amount from contract
  useEffect(() => {
    if (!initial?.amount && form.contract_id) {
      const c = contracts.find(c => c.id === Number(form.contract_id))
      if (c) { set('amount', c.monthly_rent); set('currency', c.currency) }
    }
  }, [form.contract_id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        ...form,
        contract_id: Number(form.contract_id),
        amount: Number(form.amount),
        period_month: Number(form.period_month),
        period_year: Number(form.period_year),
      })
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Contrato *</label>
        <select className="input" value={form.contract_id} onChange={e => set('contract_id', e.target.value)} required>
          {contracts.filter(c => c.status === 'active').map(c => (
            <option key={c.id} value={c.id}>{c.property_name} — {c.tenant_name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Mes *</label>
          <select className="input" value={form.period_month} onChange={e => set('period_month', e.target.value)}>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Año *</label>
          <input className="input" type="number" value={form.period_year} onChange={e => set('period_year', e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="label">Monto *</label>
          <input className="input" type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} required />
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
        <input className="input" type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Método de pago</label>
          <select className="input" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
            <option>Transferencia</option>
            <option>Efectivo</option>
            <option>Otro</option>
          </select>
        </div>
        <div>
          <label className="label">Referencia / Nro. operación</label>
          <input className="input" value={form.reference} onChange={e => set('reference', e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="has_proof" className="w-4 h-4 text-blue-600 rounded"
          checked={form.has_proof} onChange={e => set('has_proof', e.target.checked)} />
        <label htmlFor="has_proof" className="text-sm text-gray-700">Tiene comprobante de transferencia</label>
      </div>
      <div>
        <label className="label">Notas</label>
        <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

export default function Rents() {
  const [payments, setPayments] = useState<RentPayment[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RentPayment | null>(null)
  const now = new Date()
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1)

  const load = () => Promise.all([
    rentsApi.list({ period_year: filterYear, period_month: filterMonth }),
    contractsApi.list()
  ]).then(([p, c]) => { setPayments(p); setContracts(c) })
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [filterYear, filterMonth])

  const handleCreate = async (data: any) => { await rentsApi.create(data); setShowForm(false); load() }
  const handleUpdate = async (data: any) => { if (!editing) return; await rentsApi.update(editing.id, data); setEditing(null); load() }
  const handleDelete = async (id: number) => { if (!confirm('¿Eliminar este pago?')) return; await rentsApi.delete(id); load() }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagos de Alquiler</h1>
          <p className="text-gray-500 text-sm mt-1">{MONTH_NAMES[filterMonth - 1]} {filterYear} — {payments.length} pago{payments.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-3">
          <select className="input w-auto" value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select className="input w-auto" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <button className="btn-primary" onClick={() => setShowForm(true)} disabled={contracts.filter(c => c.status === 'active').length === 0}>
            <Plus className="w-4 h-4" /> Registrar pago
          </button>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Cargando...</div> : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 font-medium">Propiedad</th>
                <th className="px-6 py-3 font-medium">Inquilino</th>
                <th className="px-6 py-3 font-medium">Fecha pago</th>
                <th className="px-6 py-3 font-medium text-right">Monto</th>
                <th className="px-6 py-3 font-medium">Método</th>
                <th className="px-6 py-3 font-medium">Referencia</th>
                <th className="px-6 py-3 font-medium text-center">Comprobante</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{p.property_name}</td>
                  <td className="px-6 py-3 text-gray-600">{p.tenant_name}</td>
                  <td className="px-6 py-3 text-gray-500">{p.payment_date}</td>
                  <td className="px-6 py-3 text-right font-medium text-green-700">
                    {p.amount.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {p.currency}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{p.payment_method}</td>
                  <td className="px-6 py-3 text-gray-400 font-mono text-xs">{p.reference}</td>
                  <td className="px-6 py-3 text-center">
                    {p.has_proof
                      ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                      : <XCircle className="w-4 h-4 text-red-400 mx-auto" />}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-1 justify-end">
                      <button className="p-1.5 text-gray-400 hover:text-blue-600" onClick={() => setEditing(p)}><Pencil className="w-4 h-4" /></button>
                      <button className="p-1.5 text-gray-400 hover:text-red-500" onClick={() => handleDelete(p.id)}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                  Sin pagos en {MONTH_NAMES[filterMonth - 1]} {filterYear}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title="Registrar pago" onClose={() => setShowForm(false)} size="lg">
          <PaymentForm contracts={contracts} onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Editar pago" onClose={() => setEditing(null)} size="lg">
          <PaymentForm initial={editing} contracts={contracts} onSave={handleUpdate} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}
