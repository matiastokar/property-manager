import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { incidentsApi, propertiesApi, type Incident, type Property } from '../api/client'
import Modal from '../components/Modal'

const STATUS_LABEL: Record<string, string> = { open: 'Abierta', in_progress: 'En curso', resolved: 'Resuelta' }
const STATUS_BADGE: Record<string, string> = { open: 'badge-red', in_progress: 'badge-yellow', resolved: 'badge-green' }

function IncidentForm({ initial, properties, onSave, onCancel }: {
  initial?: Partial<Incident>
  properties: Property[]
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    property_id: initial?.property_id ?? (properties[0]?.id ?? 0),
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    incident_date: initial?.incident_date ?? new Date().toISOString().slice(0, 10),
    status: initial?.status ?? 'open',
    resolution_notes: initial?.resolution_notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try { await onSave({ ...form, property_id: Number(form.property_id) }) } finally { setSaving(false) }
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
        <label className="label">Título *</label>
        <input className="input" value={form.title} onChange={e => set('title', e.target.value)} required />
      </div>
      <div>
        <label className="label">Descripción *</label>
        <textarea className="input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Fecha *</label>
          <input className="input" type="date" value={form.incident_date} onChange={e => set('incident_date', e.target.value)} required />
        </div>
        <div>
          <label className="label">Estado</label>
          <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="open">Abierta</option>
            <option value="in_progress">En curso</option>
            <option value="resolved">Resuelta</option>
          </select>
        </div>
      </div>
      {(form.status === 'resolved' || initial?.resolution_notes) && (
        <div>
          <label className="label">Notas de resolución</label>
          <textarea className="input" rows={2} value={form.resolution_notes} onChange={e => set('resolution_notes', e.target.value)} />
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Incident | null>(null)
  const [filterProp, setFilterProp] = useState('')

  const load = () => Promise.all([
    incidentsApi.list(filterProp ? Number(filterProp) : undefined),
    propertiesApi.list()
  ]).then(([i, p]) => { setIncidents(i); setProperties(p) })
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [filterProp])

  const handleCreate = async (data: any) => { await incidentsApi.create(data); setShowForm(false); load() }
  const handleUpdate = async (data: any) => { if (!editing) return; await incidentsApi.update(editing.id, data); setEditing(null); load() }
  const handleDelete = async (id: number) => { if (!confirm('¿Eliminar esta incidencia?')) return; await incidentsApi.delete(id); load() }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidencias</h1>
          <p className="text-gray-500 text-sm mt-1">
            {incidents.filter(i => i.status !== 'resolved').length} abiertas · {incidents.length} total
          </p>
        </div>
        <div className="flex gap-3">
          <select className="input w-auto" value={filterProp} onChange={e => setFilterProp(e.target.value)}>
            <option value="">Todas las propiedades</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-primary" onClick={() => setShowForm(true)} disabled={properties.length === 0}>
            <Plus className="w-4 h-4" /> Nueva incidencia
          </button>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Cargando...</div> : incidents.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay incidencias registradas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map(i => (
            <div key={i.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className={STATUS_BADGE[i.status]}>{STATUS_LABEL[i.status]}</span>
                    <span className="text-xs text-gray-400">{i.incident_date}</span>
                    {i.expense_count > 0 && (
                      <span className="text-xs text-gray-400">{i.expense_count} gasto{i.expense_count !== 1 ? 's' : ''} asociado{i.expense_count !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900">{i.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{i.property_name}</p>
                  <p className="text-sm text-gray-600 mt-2">{i.description}</p>
                  {i.resolution_notes && (
                    <p className="text-sm text-green-700 mt-2 bg-green-50 px-3 py-2 rounded-lg">
                      <strong>Resolución:</strong> {i.resolution_notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 ml-4">
                  <button className="p-1.5 text-gray-400 hover:text-blue-600" onClick={() => setEditing(i)}><Pencil className="w-4 h-4" /></button>
                  <button className="p-1.5 text-gray-400 hover:text-red-500" onClick={() => handleDelete(i.id)}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title="Nueva incidencia" onClose={() => setShowForm(false)} size="lg">
          <IncidentForm properties={properties} onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Editar incidencia" onClose={() => setEditing(null)} size="lg">
          <IncidentForm initial={editing} properties={properties} onSave={handleUpdate} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}
