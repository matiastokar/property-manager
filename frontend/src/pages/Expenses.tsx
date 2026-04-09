import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Receipt } from 'lucide-react'
import { expensesApi, incidentsApi, propertiesApi, type Expense, type Incident, type Property } from '../api/client'
import Modal from '../components/Modal'

const FIXED_CATEGORIES = ['mortgage', 'hoa', 'insurance', 'cleaning', 'other']
const VARIABLE_CATEGORIES = ['incident', 'repair', 'improvement', 'other']
const CATEGORY_LABEL: Record<string, string> = {
  mortgage: 'Hipoteca', hoa: 'Comunidad', insurance: 'Seguro', cleaning: 'Limpieza',
  incident: 'Incidencia', repair: 'Reparación', improvement: 'Mejora', other: 'Otro'
}

function ExpenseForm({ initial, properties, incidents, onSave, onCancel }: {
  initial?: Partial<Expense>
  properties: Property[]
  incidents: Incident[]
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    property_id: initial?.property_id ?? (properties[0]?.id ?? 0),
    expense_type: initial?.expense_type ?? 'fixed',
    category: initial?.category ?? 'other',
    amount: initial?.amount ?? '',
    currency: initial?.currency ?? 'EUR',
    description: initial?.description ?? '',
    expense_date: initial?.expense_date ?? new Date().toISOString().slice(0, 10),
    incident_id: initial?.incident_id ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const categories = form.expense_type === 'fixed' ? FIXED_CATEGORIES : VARIABLE_CATEGORIES
  const propIncidents = incidents.filter(i => i.property_id === Number(form.property_id))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        ...form,
        property_id: Number(form.property_id),
        amount: Number(form.amount),
        incident_id: form.incident_id ? Number(form.incident_id) : null,
      })
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Propiedad *</label>
        <select className="input" value={form.property_id} onChange={e => set('property_id', e.target.value)} required>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Tipo *</label>
          <select className="input" value={form.expense_type} onChange={e => { set('expense_type', e.target.value); set('category', 'other') }}>
            <option value="fixed">Fijo</option>
            <option value="variable">Variable</option>
          </select>
        </div>
        <div>
          <label className="label">Categoría *</label>
          <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
      </div>
      {form.expense_type === 'variable' && propIncidents.length > 0 && (
        <div>
          <label className="label">Incidencia relacionada</label>
          <select className="input" value={form.incident_id} onChange={e => set('incident_id', e.target.value)}>
            <option value="">Sin incidencia</option>
            {propIncidents.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label">Descripción *</label>
        <input className="input" value={form.description} onChange={e => set('description', e.target.value)} required />
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
        <label className="label">Fecha *</label>
        <input className="input" type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} required />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [filterType, setFilterType] = useState('')

  const load = () => Promise.all([
    expensesApi.list(filterType ? { expense_type: filterType } : {}),
    propertiesApi.list(), incidentsApi.list()
  ]).then(([e, p, i]) => { setExpenses(e); setProperties(p); setIncidents(i) })
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [filterType])

  const handleCreate = async (data: any) => { await expensesApi.create(data); setShowForm(false); load() }
  const handleUpdate = async (data: any) => { if (!editing) return; await expensesApi.update(editing.id, data); setEditing(null); load() }
  const handleDelete = async (id: number) => { if (!confirm('¿Eliminar este gasto?')) return; await expensesApi.delete(id); load() }

  const total = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.currency] = (acc[e.currency] ?? 0) + e.amount; return acc
  }, {})

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
          <p className="text-gray-500 text-sm mt-1">
            {Object.entries(total).map(([c, v]) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${c}`).join(' | ') || '0'}
          </p>
        </div>
        <div className="flex gap-3">
          <select className="input w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="fixed">Fijos</option>
            <option value="variable">Variables</option>
          </select>
          <button className="btn-primary" onClick={() => setShowForm(true)} disabled={properties.length === 0}>
            <Plus className="w-4 h-4" /> Nuevo gasto
          </button>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Cargando...</div> : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Propiedad</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Descripción</th>
                <th className="px-6 py-3 font-medium text-right">Monto</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {expenses.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-500">{e.expense_date}</td>
                  <td className="px-6 py-3 font-medium">{e.property_name}</td>
                  <td className="px-6 py-3">
                    <span className={e.expense_type === 'fixed' ? 'badge-blue' : 'badge-yellow'}>
                      {CATEGORY_LABEL[e.category] ?? e.category}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-600 max-w-xs truncate">{e.description}</td>
                  <td className="px-6 py-3 text-right font-medium text-red-600">
                    {e.amount.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {e.currency}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-1 justify-end">
                      <button className="p-1.5 text-gray-400 hover:text-blue-600" onClick={() => setEditing(e)}><Pencil className="w-4 h-4" /></button>
                      <button className="p-1.5 text-gray-400 hover:text-red-500" onClick={() => handleDelete(e.id)}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Sin gastos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title="Nuevo gasto" onClose={() => setShowForm(false)} size="lg">
          <ExpenseForm properties={properties} incidents={incidents} onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Editar gasto" onClose={() => setEditing(null)} size="lg">
          <ExpenseForm initial={editing} properties={properties} incidents={incidents} onSave={handleUpdate} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}
