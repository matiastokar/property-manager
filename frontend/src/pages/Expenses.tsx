import { useEffect, useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { expensesApi, incidentsApi, propertiesApi, type Expense, type Incident, type Property } from '../api/client'
import Modal from '../components/Modal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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

type SortKey = 'expense_date' | 'property_name' | 'expense_type' | 'description' | 'amount'
type SortDir = 'asc' | 'desc'

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="inline w-3 h-3 ml-1 text-gray-300" />
  return sortDir === 'asc' ? <ChevronUp className="inline w-3 h-3 ml-1 text-blue-500" /> : <ChevronDown className="inline w-3 h-3 ml-1 text-blue-500" />
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function Expenses() {
  const now = new Date()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [filterType, setFilterType] = useState('')
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1)
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [sortKey, setSortKey] = useState<SortKey>('expense_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => [...expenses].sort((a, b) => {
    let av: any = a[sortKey], bv: any = b[sortKey]
    if (sortKey === 'amount') { av = a.amount; bv = b.amount }
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  }), [expenses, sortKey, sortDir])

  const load = () => Promise.all([
    expensesApi.list({
      ...(filterType ? { expense_type: filterType } : {}),
      period_month: filterMonth,
      period_year: filterYear,
    }),
    propertiesApi.list(), incidentsApi.list()
  ]).then(([e, p, i]) => { setExpenses(e); setProperties(p); setIncidents(i) })
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [filterType, filterMonth, filterYear])

  const handleCreate = async (data: any) => { await expensesApi.create(data); setShowForm(false); load() }
  const handleUpdate = async (data: any) => { if (!editing) return; await expensesApi.update(editing.id, data); setEditing(null); load() }
  const handleDelete = async (id: number) => { if (!confirm('¿Eliminar este gasto?')) return; await expensesApi.delete(id); load() }

  const total = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.currency] = (acc[e.currency] ?? 0) + e.amount; return acc
  }, {})

  const propertyChartData = useMemo(() => {
    const byProperty: Record<string, { currency: string; amount: number }> = {}
    for (const e of expenses) {
      const name = e.property_name || 'Sin nombre'
      if (!byProperty[name]) byProperty[name] = { currency: e.currency, amount: 0 }
      byProperty[name].amount += e.amount
    }
    return Object.entries(byProperty)
      .map(([name, { currency, amount }]) => ({
        name: name.length > 18 ? name.slice(0, 18) + '…' : name,
        amount: Math.round(amount),
        currency,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [expenses])

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
          <p className="text-gray-500 text-sm mt-1">{MONTH_NAMES[filterMonth - 1]} {filterYear} — {expenses.length} gasto{expenses.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-3 flex-wrap justify-end">
          <select className="input w-auto" value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select className="input w-auto" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
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

      {/* Totals by currency */}
      {!loading && Object.keys(total).length > 0 && (
        <div className="flex gap-4 flex-wrap">
          {Object.entries(total).map(([currency, val]) => (
            <div key={currency} className="card flex items-center gap-3 py-3 px-5 min-w-[160px]">
              <div className="flex flex-col">
                <span className="text-xs text-gray-400 uppercase tracking-wide">{currency}</span>
                <span className="text-xl font-bold text-red-600">
                  {val.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
          <div className="card flex items-center gap-3 py-3 px-5 min-w-[160px] bg-gray-50">
            <div className="flex flex-col">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Total gastos</span>
              <span className="text-xl font-bold text-gray-700">{expenses.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Property expenses chart */}
      {!loading && propertyChartData.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Egresos por Propiedad</h2>
          <p className="text-xs text-gray-400 mb-4">{MONTH_NAMES[filterMonth - 1]} {filterYear}{filterType ? ` · ${filterType === 'fixed' ? 'Fijos' : 'Variables'}` : ''}</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={propertyChartData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip formatter={(value: number, _name: string, props: any) => [
                `${value.toLocaleString('es-ES')} ${props.payload.currency}`, 'Gasto'
              ]} />
              <Bar dataKey="amount" fill="#f97316" radius={[4, 4, 0, 0]}
                label={{ position: 'top', fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {loading ? <div className="text-center py-12 text-gray-400">Cargando...</div> : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                {([
                  ['expense_date', 'Fecha', ''],
                  ['property_name', 'Propiedad', ''],
                  ['expense_type', 'Tipo', ''],
                  ['description', 'Descripción', ''],
                  ['amount', 'Monto', 'text-right'],
                ] as [SortKey, string, string][]).map(([key, label, align]) => (
                  <th key={key} className={`px-6 py-3 font-medium cursor-pointer select-none hover:text-gray-800 ${align}`}
                    onClick={() => handleSort(key)}>
                    {label}<SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                  </th>
                ))}
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(e => (
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
