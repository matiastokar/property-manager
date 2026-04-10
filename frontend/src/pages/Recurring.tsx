import { useEffect, useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, RefreshCw, CalendarClock } from 'lucide-react'
import { recurringApi, propertiesApi, type RecurringExpense, type Property } from '../api/client'
import Modal from '../components/Modal'

const CATEGORY_LABELS: Record<string, string> = {
  mortgage: 'Hipoteca',
  hoa: 'Comunidad',
  insurance: 'Seguro',
  cleaning: 'Limpieza',
  internet: 'Internet',
  other: 'Otro',
}

const TYPE_LABELS: Record<string, string> = { fixed: 'Fijo', variable: 'Variable' }

const CURRENCY_COLORS: Record<string, string> = {
  EUR: 'bg-indigo-50 text-indigo-700',
  USD: 'bg-green-50 text-green-700',
  ARS: 'bg-amber-50 text-amber-700',
}

function RecurringForm({ initial, properties, onSave, onCancel }: {
  initial?: Partial<RecurringExpense>
  properties: Property[]
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    property_id: initial?.property_id ?? (properties[0]?.id ?? 0),
    expense_type: initial?.expense_type ?? 'fixed',
    category: initial?.category ?? 'mortgage',
    amount: initial?.amount ?? '',
    currency: initial?.currency ?? 'EUR',
    description: initial?.description ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  // Auto-fill description from category
  useEffect(() => {
    if (!initial?.description) {
      set('description', CATEGORY_LABELS[form.category] ?? form.category)
    }
  }, [form.category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ ...form, property_id: Number(form.property_id), amount: Number(form.amount) })
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
          <label className="label">Tipo</label>
          <select className="input" value={form.expense_type} onChange={e => set('expense_type', e.target.value)}>
            <option value="fixed">Fijo</option>
            <option value="variable">Variable</option>
          </select>
        </div>
        <div>
          <label className="label">Categoría</label>
          <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
            <option value="mortgage">Hipoteca</option>
            <option value="hoa">Comunidad</option>
            <option value="insurance">Seguro</option>
            <option value="cleaning">Limpieza</option>
            <option value="internet">Internet</option>
            <option value="other">Otro</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="label">Monto *</label>
          <input className="input" type="number" step="0.01" min="0" value={form.amount}
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
        <label className="label">Descripción *</label>
        <input className="input" value={form.description} onChange={e => set('description', e.target.value)} required />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

export default function Recurring() {
  const [items, setItems] = useState<RecurringExpense[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RecurringExpense | null>(null)
  const [filterProperty, setFilterProperty] = useState<number | ''>('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')

  const load = () => Promise.all([recurringApi.list(), propertiesApi.list()])
    .then(([r, p]) => { setItems(r); setProperties(p) })
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const handleCreate = async (data: any) => { await recurringApi.create(data); setShowForm(false); load() }
  const handleUpdate = async (data: any) => { if (!editing) return; await recurringApi.update(editing.id, data); setEditing(null); load() }
  const handleDelete = async (id: number) => { if (!confirm('¿Eliminar este gasto fijo?')) return; await recurringApi.delete(id); load() }
  const handleToggle = async (item: RecurringExpense) => { await recurringApi.update(item.id, { active: !item.active }); load() }

  const filtered = useMemo(() => items.filter(i => {
    if (filterProperty && i.property_id !== filterProperty) return false
    if (filterActive === 'active' && !i.active) return false
    if (filterActive === 'inactive' && i.active) return false
    return true
  }), [items, filterProperty, filterActive])

  // Totals by currency (active only)
  const totals = useMemo(() => filtered.filter(i => i.active).reduce<Record<string, number>>((acc, i) => {
    acc[i.currency] = (acc[i.currency] ?? 0) + i.amount
    return acc
  }, {}), [filtered])

  // Group by property for display
  const grouped = useMemo(() => {
    const map: Record<string, RecurringExpense[]> = {}
    for (const item of filtered) {
      const key = item.property_name ?? `Propiedad ${item.property_id}`
      if (!map[key]) map[key] = []
      map[key].push(item)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos Fijos Recurrentes</h1>
          <p className="text-gray-500 text-sm mt-1">
            Se generan automáticamente el día 1 de cada mes · {items.filter(i => i.active).length} activos
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)} disabled={properties.length === 0}>
          <Plus className="w-4 h-4" /> Nuevo gasto fijo
        </button>
      </div>

      {/* Summary cards */}
      {!loading && Object.keys(totals).length > 0 && (
        <div className="flex gap-4 flex-wrap">
          <div className="card py-3 px-5 flex items-center gap-3 bg-blue-50 border border-blue-100">
            <CalendarClock className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-xs text-blue-500 font-medium uppercase tracking-wide">Total mensual activo</p>
              <div className="flex gap-3 mt-0.5">
                {Object.entries(totals).map(([cur, val]) => (
                  <span key={cur} className="text-lg font-bold text-blue-700">
                    {val.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {cur}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="card py-3 px-5 flex items-center gap-3 bg-gray-50">
            <RefreshCw className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Propiedades con gastos</p>
              <p className="text-lg font-bold text-gray-700">{grouped.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select className="input w-auto" value={filterProperty} onChange={e => setFilterProperty(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Todas las propiedades</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input w-auto" value={filterActive} onChange={e => setFilterActive(e.target.value as any)}>
          <option value="all">Activos e inactivos</option>
          <option value="active">Solo activos</option>
          <option value="inactive">Solo inactivos</option>
        </select>
      </div>

      {/* Grouped table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : grouped.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No hay gastos fijos configurados.</p>
          <p className="text-sm mt-1">Creá uno con el botón "Nuevo gasto fijo".</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([propertyName, propItems]) => {
            const propTotals = propItems.filter(i => i.active).reduce<Record<string, number>>((acc, i) => {
              acc[i.currency] = (acc[i.currency] ?? 0) + i.amount; return acc
            }, {})
            return (
              <div key={propertyName} className="card overflow-hidden p-0">
                {/* Property header */}
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 text-sm">{propertyName}</h3>
                  <div className="flex gap-2">
                    {Object.entries(propTotals).map(([cur, val]) => (
                      <span key={cur} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CURRENCY_COLORS[cur] ?? 'bg-gray-100 text-gray-600'}`}>
                        {val.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {cur}/mes
                      </span>
                    ))}
                  </div>
                </div>
                {/* Rows */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-50">
                      <th className="px-5 py-2 font-medium">Descripción</th>
                      <th className="px-5 py-2 font-medium">Categoría</th>
                      <th className="px-5 py-2 font-medium">Tipo</th>
                      <th className="px-5 py-2 font-medium text-right">Monto</th>
                      <th className="px-5 py-2 font-medium text-center">Estado</th>
                      <th className="px-5 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {propItems.map(item => (
                      <tr key={item.id} className={`hover:bg-gray-50 ${!item.active ? 'opacity-50' : ''}`}>
                        <td className="px-5 py-2.5 font-medium text-gray-800">{item.description}</td>
                        <td className="px-5 py-2.5 text-gray-500">{CATEGORY_LABELS[item.category] ?? item.category}</td>
                        <td className="px-5 py-2.5 text-gray-400 text-xs">{TYPE_LABELS[item.expense_type]}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-gray-800">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${CURRENCY_COLORS[item.currency] ?? ''}`}>
                            {item.amount.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {item.currency}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          <button onClick={() => handleToggle(item)} title={item.active ? 'Desactivar' : 'Activar'}
                            className={`transition-colors ${item.active ? 'text-emerald-500 hover:text-gray-400' : 'text-gray-300 hover:text-emerald-500'}`}>
                            {item.active
                              ? <ToggleRight className="w-5 h-5" />
                              : <ToggleLeft className="w-5 h-5" />}
                          </button>
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <button className="p-1.5 text-gray-400 hover:text-blue-600" onClick={() => setEditing(item)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 text-gray-400 hover:text-red-500" onClick={() => handleDelete(item.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <Modal title="Nuevo gasto fijo recurrente" onClose={() => setShowForm(false)} size="lg">
          <RecurringForm properties={properties} onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Editar gasto fijo" onClose={() => setEditing(null)} size="lg">
          <RecurringForm initial={editing} properties={properties} onSave={handleUpdate} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}
