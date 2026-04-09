import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, FileText, XCircle, ToggleLeft } from 'lucide-react'
import { contractsApi, propertiesApi, type Contract, type Property } from '../api/client'
import Modal from '../components/Modal'

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green',
  finished: 'badge-gray',
  expired: 'badge-yellow',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  finished: 'Finalizado',
  expired: 'Vencido',
}

function ContractForm({ initial, properties, onSave, onCancel }: {
  initial?: Partial<Contract>
  properties: Property[]
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    property_id: initial?.property_id ?? (properties[0]?.id ?? 0),
    tenant_name: initial?.tenant_name ?? '',
    tenant_email: initial?.tenant_email ?? '',
    tenant_phone: initial?.tenant_phone ?? '',
    start_date: initial?.start_date ?? '',
    end_date: initial?.end_date ?? '',
    monthly_rent: initial?.monthly_rent ?? '',
    currency: initial?.currency ?? 'EUR',
    status: initial?.status ?? 'active',
    notes: initial?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try { await onSave({ ...form, property_id: Number(form.property_id), monthly_rent: Number(form.monthly_rent) }) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Propiedad *</label>
        <select className="input" value={form.property_id} onChange={e => set('property_id', e.target.value)} required>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name} — {p.city}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Inquilino *</label>
        <input className="input" value={form.tenant_name} onChange={e => set('tenant_name', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.tenant_email} onChange={e => set('tenant_email', e.target.value)} />
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input className="input" value={form.tenant_phone} onChange={e => set('tenant_phone', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Fecha inicio *</label>
          <input className="input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} required />
        </div>
        <div>
          <label className="label">Fecha vencimiento *</label>
          <input className="input" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Renta mensual *</label>
          <input className="input" type="number" step="0.01" value={form.monthly_rent} onChange={e => set('monthly_rent', e.target.value)} required />
        </div>
        <div>
          <label className="label">Moneda *</label>
          <select className="input" value={form.currency} onChange={e => set('currency', e.target.value)}>
            <option value="EUR">EUR — Euro</option>
            <option value="USD">USD — Dólar</option>
            <option value="ARS">ARS — Peso argentino</option>
          </select>
        </div>
      </div>
      {initial && (
        <div>
          <label className="label">Estado</label>
          <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Activo</option>
            <option value="expired">Vencido</option>
            <option value="finished">Finalizado</option>
          </select>
        </div>
      )}
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

function FinishForm({ contract, onSave, onCancel }: {
  contract: Contract
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const [finish_date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try { await onSave({ finish_date, notes }) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-600">Finalizar contrato de <strong>{contract.tenant_name}</strong> en <strong>{contract.property_name}</strong></p>
      <div>
        <label className="label">Fecha de finalización *</label>
        <input className="input" type="date" value={finish_date} onChange={e => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="label">Motivo / Notas</label>
        <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-danger" disabled={saving}>{saving ? 'Finalizando...' : 'Finalizar contrato'}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

export default function Contracts() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [finishing, setFinishing] = useState<Contract | null>(null)

  const load = () => Promise.all([contractsApi.list(), propertiesApi.list()])
    .then(([c, p]) => { setContracts(c); setProperties(p) })
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const handleCreate = async (data: any) => { await contractsApi.create(data); setShowForm(false); load() }
  const handleUpdate = async (data: any) => { if (!editing) return; await contractsApi.update(editing.id, data); setEditing(null); load() }
  const handleFinish = async (data: any) => { if (!finishing) return; await contractsApi.finish(finishing.id, data); setFinishing(null); load() }
  const handleDelete = async (id: number) => { if (!confirm('¿Eliminar este contrato?')) return; await contractsApi.delete(id); load() }
  const handleStatusChange = async (id: number, status: string) => { await contractsApi.update(id, { status }); load() }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contratos</h1>
          <p className="text-gray-500 text-sm mt-1">{contracts.filter(c => c.status === 'active').length} activos</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)} disabled={properties.length === 0}>
          <Plus className="w-4 h-4" /> Nuevo contrato
        </button>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Cargando...</div> : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 font-medium">Propiedad</th>
                <th className="px-6 py-3 font-medium">Inquilino</th>
                <th className="px-6 py-3 font-medium">Vigencia</th>
                <th className="px-6 py-3 font-medium text-right">Renta</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contracts.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{c.property_name}</td>
                  <td className="px-6 py-3">
                    <div>{c.tenant_name}</div>
                    {c.tenant_email && <div className="text-xs text-gray-400">{c.tenant_email}</div>}
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {c.start_date} → {c.finish_date ?? c.end_date}
                  </td>
                  <td className="px-6 py-3 text-right font-medium">
                    {c.monthly_rent.toLocaleString('es-ES')} {c.currency}
                  </td>
                  <td className="px-6 py-3">
                    <select
                      className={`text-xs font-semibold rounded-full px-2 py-1 border-0 cursor-pointer focus:ring-1 focus:ring-offset-0 ${
                        c.status === 'active' ? 'bg-green-100 text-green-800' :
                        c.status === 'expired' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-600'
                      }`}
                      value={c.status}
                      onChange={e => handleStatusChange(c.id, e.target.value)}
                    >
                      <option value="active">Activo</option>
                      <option value="expired">Vencido</option>
                      <option value="finished">Finalizado</option>
                    </select>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-1 justify-end">
                      {c.status === 'active' && (
                        <button className="p-1.5 text-gray-400 hover:text-orange-500" title="Finalizar" onClick={() => setFinishing(c)}>
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button className="p-1.5 text-gray-400 hover:text-blue-600" onClick={() => setEditing(c)}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-gray-400 hover:text-red-500" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {contracts.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Sin contratos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title="Nuevo contrato" onClose={() => setShowForm(false)} size="lg">
          <ContractForm properties={properties} onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Editar contrato" onClose={() => setEditing(null)} size="lg">
          <ContractForm initial={editing} properties={properties} onSave={handleUpdate} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {finishing && (
        <Modal title="Finalizar contrato" onClose={() => setFinishing(null)} size="sm">
          <FinishForm contract={finishing} onSave={handleFinish} onCancel={() => setFinishing(null)} />
        </Modal>
      )}
    </div>
  )
}
