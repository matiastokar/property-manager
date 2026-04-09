import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Building2, MapPin } from 'lucide-react'
import { propertiesApi, type Property } from '../api/client'
import Modal from '../components/Modal'

const PROPERTY_TYPES = ['Apartamento', 'Casa', 'Local comercial', 'Oficina', 'Garaje', 'Otro']

function PropertyForm({ initial, onSave, onCancel }: {
  initial?: Partial<Property>
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    address: initial?.address ?? '',
    city: initial?.city ?? '',
    country: initial?.country ?? '',
    type: initial?.type ?? 'Apartamento',
    description: initial?.description ?? '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nombre *</label>
        <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
      </div>
      <div>
        <label className="label">Dirección *</label>
        <input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Ciudad *</label>
          <input className="input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} required />
        </div>
        <div>
          <label className="label">País *</label>
          <input className="input" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} required />
        </div>
      </div>
      <div>
        <label className="label">Tipo *</label>
        <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
          {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Descripción</label>
        <textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

export default function Properties() {
  const [props, setProps] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Property | null>(null)

  const load = () => propertiesApi.list().then(setProps).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleCreate = async (data: any) => {
    await propertiesApi.create(data)
    setShowForm(false)
    load()
  }

  const handleUpdate = async (data: any) => {
    if (!editing) return
    await propertiesApi.update(editing.id, data)
    setEditing(null)
    load()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta propiedad? Se eliminarán todos los datos relacionados.')) return
    await propertiesApi.delete(id)
    load()
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Propiedades</h1>
          <p className="text-gray-500 text-sm mt-1">{props.length} propiedad{props.length !== 1 ? 'es' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> Nueva propiedad
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-center py-12">Cargando...</div>
      ) : props.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay propiedades. Crea la primera.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {props.map(p => (
            <div key={p.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{p.name}</h3>
                    <span className="text-xs text-gray-400">{p.type}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors" onClick={() => setEditing(p)}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
                <MapPin className="w-3.5 h-3.5" />
                {p.address}, {p.city}, {p.country}
              </div>
              {p.description && <p className="text-xs text-gray-400 mb-3 line-clamp-2">{p.description}</p>}
              <div className="pt-3 border-t border-gray-100">
                {p.has_active_contract ? (
                  <div>
                    <span className="badge-green mb-1">Alquilada</span>
                    <p className="text-xs text-gray-500 mt-1">{p.tenant_name} · {p.monthly_rent?.toLocaleString('es-ES')} {p.rent_currency}/mes</p>
                  </div>
                ) : (
                  <span className="badge-gray">Sin contrato activo</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title="Nueva propiedad" onClose={() => setShowForm(false)}>
          <PropertyForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Editar propiedad" onClose={() => setEditing(null)}>
          <PropertyForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  )
}
