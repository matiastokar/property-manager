import { useEffect, useState, useRef } from 'react'
import {
  Upload, FileText, CheckCircle2, XCircle, AlertCircle, ChevronRight,
  Trash2, RefreshCw, ArrowRight, TrendingUp, TrendingDown
} from 'lucide-react'
import api from '../api/client'
import { propertiesApi, type Property } from '../api/client'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Categories split by income / fixed-expense / variable-expense
const INCOME_CATEGORIES = [
  { value: 'rent',  label: 'Alquiler' },
  { value: 'other', label: 'Otro' },
]
const FIXED_EXPENSE_CATEGORIES = [
  { value: 'mortgage',  label: 'Hipoteca' },
  { value: 'hoa',       label: 'Comunidad' },
  { value: 'insurance', label: 'Seguro' },
  { value: 'cleaning',  label: 'Limpieza' },
  { value: 'internet',  label: 'Internet' },
  { value: 'other',     label: 'Otro' },
]
const VARIABLE_EXPENSE_CATEGORIES = [
  { value: 'electricity', label: 'Electricidad' },
  { value: 'gas',         label: 'Gas' },
  { value: 'water',       label: 'Agua' },
  { value: 'tax',         label: 'Tributos / Impuestos' },
  { value: 'incident',    label: 'Incidencia' },
  { value: 'repair',      label: 'Reparación' },
  { value: 'improvement', label: 'Mejora' },
  { value: 'other',       label: 'Otro' },
]

const CATEGORY_LABEL: Record<string, string> = {
  rent: 'Alquiler',
  mortgage: 'Hipoteca', hoa: 'Comunidad', insurance: 'Seguro',
  cleaning: 'Limpieza', internet: 'Internet',
  electricity: 'Electricidad', gas: 'Gas', water: 'Agua',
  tax: 'Tributos / Impuestos',
  incident: 'Incidencia', repair: 'Reparación', improvement: 'Mejora',
  other: 'Otro',
}

// Returns the right category list based on the effective type + sub-type
function categoryOptions(type: string | null, subType?: string | null) {
  if (type === 'income') return INCOME_CATEGORIES
  if (type === 'expense') {
    // If the current category is a fixed one, show fixed list; otherwise variable
    const fixed = FIXED_EXPENSE_CATEGORIES.map(c => c.value)
    if (subType && fixed.includes(subType)) return FIXED_EXPENSE_CATEGORIES
    return VARIABLE_EXPENSE_CATEGORIES   // default for expenses: variable list
  }
  // Unknown — show everything
  return [...INCOME_CATEGORIES, ...FIXED_EXPENSE_CATEGORIES, ...VARIABLE_EXPENSE_CATEGORIES]
}

interface BankImport {
  id: number
  filename: string
  period_month: number
  period_year: number
  currency: string
  status: string
  created_at: string
  total_rows: number
  confirmed_rows: number
}

interface BankRow {
  id: number
  bank_import_id: number
  transaction_date: string | null
  description: string
  amount: number
  currency: string
  suggested_property_id: number | null
  suggested_property_name: string | null
  confirmed_property_id: number | null
  confirmed_property_name: string | null
  suggested_type: string | null
  confirmed_type: string | null
  suggested_category: string | null
  confirmed_category: string | null
  status: string
  created_expense_id: number | null
  created_payment_id: number | null
}

// ── Step 1: Upload ─────────────────────────────────────────────────────────
function UploadStep({ properties, onUploaded }: {
  properties: Property[]
  onUploaded: (importId: number) => void
}) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [currency, setCurrency] = useState('EUR')
  const [propertyId, setPropertyId] = useState<string>('')   // '' = auto-suggest per row
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
    else setError('Archivo no válido')
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true); setError('')
    const form = new FormData()
    form.append('file', file)
    form.append('period_month', String(month))
    form.append('period_year', String(year))
    form.append('currency', currency)
    if (propertyId) form.append('property_id', propertyId)
    try {
      const res = await api.post('/bank-imports/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      onUploaded(res.data.id)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Error al procesar el archivo')
    } finally { setLoading(false) }
  }

  const selectedProp = properties.find(p => String(p.id) === propertyId)

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Period & currency */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-800">1. Seleccioná el período</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Mes</label>
            <select className="input" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Año</label>
            <select className="input" value={year} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Moneda</label>
            <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </div>
        </div>
      </div>

      {/* Optional property */}
      <div className="card space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">2. Propiedad <span className="text-gray-400 font-normal">(opcional)</span></h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Si el extracto corresponde a una sola propiedad, seleccionala para asignar todos los movimientos automáticamente.
            </p>
          </div>
        </div>
        <select
          className="input"
          value={propertyId}
          onChange={e => setPropertyId(e.target.value)}
        >
          <option value="">— Sugerir propiedad por descripción (automático) —</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {selectedProp && (
          <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
            Todos los movimientos se asignarán a <strong>{selectedProp.name}</strong>. Podés cambiarlos individualmente en el paso siguiente.
          </p>
        )}
      </div>

      {/* Drop zone */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-800">3. Subí el extracto bancario</h2>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
            ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
        >
          <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          {file ? (
            <div>
              <p className="font-medium text-gray-800">{file.name}</p>
              <p className="text-sm text-gray-400 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-600 font-medium">Arrastrá el archivo acá o hacé clic</p>
              <p className="text-sm text-gray-400 mt-1">PDF, CSV o Excel</p>
            </div>
          )}
          <input ref={inputRef} type="file" accept=".pdf,.csv,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button className="btn-primary w-full" disabled={!file || loading} onClick={handleUpload}>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Procesando...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <ArrowRight className="w-4 h-4" /> Procesar extracto
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Review rows ────────────────────────────────────────────────────
function ReviewStep({ importId, properties, onDone }: {
  importId: number
  properties: Property[]
  onDone: () => void
}) {
  const [rows, setRows] = useState<BankRow[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ created_expenses: number; created_payments: number } | null>(null)

  const load = () => api.get(`/bank-imports/${importId}/rows`)
    .then(r => setRows(r.data))
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [importId])

  const updateRow = async (rowId: number, patch: Partial<BankRow>) => {
    const res = await api.put(`/bank-imports/${importId}/rows/${rowId}`, patch)
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...res.data } : r))
  }

  const toggleStatus = (row: BankRow) => {
    const next = row.status === 'pending' ? 'confirmed'
               : row.status === 'confirmed' ? 'ignored'
               : 'pending'
    updateRow(row.id, { status: next })
  }

  const confirmAll = async () => {
    // Auto-confirm all pending rows that have a property
    const toConfirm = rows.filter(r =>
      r.status === 'pending' && (r.confirmed_property_id || r.suggested_property_id)
    )
    await Promise.all(toConfirm.map(r => updateRow(r.id, { status: 'confirmed' })))
  }

  const handleImport = async () => {
    setConfirming(true)
    try {
      const res = await api.post(`/bank-imports/${importId}/confirm`)
      setResult(res.data)
      load()
    } finally { setConfirming(false) }
  }

  const confirmed = rows.filter(r => r.status === 'confirmed').length
  const ignored   = rows.filter(r => r.status === 'ignored').length
  const pending   = rows.filter(r => r.status === 'pending').length
  const alreadyImported = rows.filter(r => r.created_expense_id || r.created_payment_id).length

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex gap-4 flex-wrap items-center">
        <div className="flex gap-3">
          <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
            ✓ {confirmed} confirmados
          </span>
          <span className="text-sm font-medium text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
            — {ignored} ignorados
          </span>
          <span className="text-sm font-medium text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
            ? {pending} pendientes
          </span>
        </div>
        <div className="flex gap-2 ml-auto">
          <button className="btn-secondary text-xs py-1.5" onClick={confirmAll}>
            Confirmar con sugerencia
          </button>
          {!result && (
            <button className="btn-primary text-xs py-1.5" disabled={confirmed === 0 || confirming}
              onClick={handleImport}>
              {confirming ? 'Importando...' : `Importar ${confirmed} movimientos`}
            </button>
          )}
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-emerald-800">¡Importación completada!</p>
            <p className="text-sm text-emerald-600 mt-0.5">
              {result.created_payments} pagos de alquiler · {result.created_expenses} gastos creados
            </p>
          </div>
          <button className="btn-secondary text-sm" onClick={onDone}>Ver historial</button>
        </div>
      )}

      {/* Rows table */}
      {loading ? <div className="text-center py-12 text-gray-400">Cargando...</div> : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
                <th className="px-4 py-3 text-center w-10">Estado</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Importe</th>
                <th className="px-4 py-3">Propiedad</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Categoría</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => {
                const imported = !!(row.created_expense_id || row.created_payment_id)
                return (
                  <tr key={row.id} className={`
                    ${row.status === 'confirmed' ? 'bg-emerald-50/40' : ''}
                    ${row.status === 'ignored' ? 'opacity-40' : ''}
                    ${imported ? 'bg-blue-50/30' : ''}
                    hover:bg-gray-50/80 transition-colors
                  `}>
                    {/* Status toggle */}
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => !imported && toggleStatus(row)} disabled={imported}
                        title={imported ? 'Ya importado' : row.status === 'pending' ? 'Confirmar' : row.status === 'confirmed' ? 'Ignorar' : 'Pendiente'}>
                        {imported
                          ? <CheckCircle2 className="w-5 h-5 text-blue-400 mx-auto" />
                          : row.status === 'confirmed'
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                            : row.status === 'ignored'
                              ? <XCircle className="w-5 h-5 text-gray-300 mx-auto" />
                              : <AlertCircle className="w-5 h-5 text-amber-400 mx-auto" />}
                      </button>
                    </td>
                    {/* Date */}
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                      {row.transaction_date ?? <span className="text-gray-300">—</span>}
                    </td>
                    {/* Description */}
                    <td className="px-4 py-2.5 text-gray-700 max-w-[220px] truncate" title={row.description}>
                      {row.description}
                    </td>
                    {/* Amount */}
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold whitespace-nowrap">
                      {row.amount > 0
                        ? <span className="text-emerald-600 flex items-center justify-end gap-1">
                            <TrendingUp className="w-3 h-3" />
                            +{row.amount.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {row.currency}
                          </span>
                        : <span className="text-red-500 flex items-center justify-end gap-1">
                            <TrendingDown className="w-3 h-3" />
                            {row.amount.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {row.currency}
                          </span>
                      }
                    </td>
                    {/* Property selector */}
                    <td className="px-4 py-2.5">
                      <select
                        className={`text-xs rounded-lg px-2 py-1 border w-full max-w-[180px] ${
                          (row.confirmed_property_id || row.suggested_property_id)
                            ? 'border-gray-200 bg-white'
                            : 'border-orange-200 bg-orange-50'
                        }`}
                        value={row.confirmed_property_id ?? row.suggested_property_id ?? ''}
                        onChange={e => updateRow(row.id, { confirmed_property_id: e.target.value ? Number(e.target.value) : null })}
                        disabled={imported}
                      >
                        <option value="">Sin propiedad</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    {/* Type */}
                    <td className="px-4 py-2.5">
                      <select
                        className="text-xs rounded-lg px-2 py-1 border border-gray-200 bg-white"
                        value={row.confirmed_type ?? row.suggested_type ?? ''}
                        onChange={e => {
                          const newType = e.target.value
                          const defaultCat = newType === 'income' ? 'rent' : 'other'
                          updateRow(row.id, { confirmed_type: newType, confirmed_category: defaultCat })
                        }}
                        disabled={imported}
                      >
                        <option value="income">Ingreso</option>
                        <option value="expense">Egreso</option>
                      </select>
                    </td>
                    {/* Category — options depend on the effective type */}
                    <td className="px-4 py-2.5">
                      {(() => {
                        const effectiveType = row.confirmed_type ?? row.suggested_type ?? null
                        const effectiveCat  = row.confirmed_category ?? row.suggested_category ?? null
                        const options = categoryOptions(effectiveType, effectiveCat)
                        // If current category is not in the list, pick first option
                        const value = options.find(o => o.value === effectiveCat)
                          ? effectiveCat
                          : options[0]?.value ?? ''
                        return (
                          <select
                            className="text-xs rounded-lg px-2 py-1 border border-gray-200 bg-white min-w-[120px]"
                            value={value ?? ''}
                            onChange={e => updateRow(row.id, { confirmed_category: e.target.value })}
                            disabled={imported}
                          >
                            {/* Group fixed vs variable for expenses */}
                            {effectiveType === 'expense' ? (
                              <>
                                <optgroup label="Variables">
                                  {VARIABLE_EXPENSE_CATEGORIES.map(c =>
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                  )}
                                </optgroup>
                                <optgroup label="Fijos">
                                  {FIXED_EXPENSE_CATEGORIES.map(c =>
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                  )}
                                </optgroup>
                              </>
                            ) : (
                              options.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                            )}
                          </select>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── History list ───────────────────────────────────────────────────────────
function HistoryList({ imports, onSelect, onDelete }: {
  imports: BankImport[]
  onSelect: (id: number) => void
  onDelete: (id: number) => void
}) {
  if (imports.length === 0) return (
    <div className="card text-center py-12 text-gray-400">
      <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p>No hay extractos importados aún.</p>
    </div>
  )
  return (
    <div className="card overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium text-left">
            <th className="px-5 py-3">Archivo</th>
            <th className="px-5 py-3">Período</th>
            <th className="px-5 py-3">Moneda</th>
            <th className="px-5 py-3 text-center">Movimientos</th>
            <th className="px-5 py-3 text-center">Estado</th>
            <th className="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {imports.map(i => (
            <tr key={i.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onSelect(i.id)}>
              <td className="px-5 py-3 font-medium text-gray-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />{i.filename}
              </td>
              <td className="px-5 py-3 text-gray-600">{MONTH_NAMES[i.period_month - 1]} {i.period_year}</td>
              <td className="px-5 py-3 text-gray-500">{i.currency}</td>
              <td className="px-5 py-3 text-center text-gray-600">
                {i.confirmed_rows}/{i.total_rows}
              </td>
              <td className="px-5 py-3 text-center">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  i.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {i.status === 'completed' ? 'Completado' : 'Pendiente'}
                </span>
              </td>
              <td className="px-5 py-3">
                <div className="flex gap-2 justify-end">
                  <button className="p-1.5 text-gray-400 hover:text-blue-600" title="Revisar"
                    onClick={e => { e.stopPropagation(); onSelect(i.id) }}>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 text-gray-400 hover:text-red-500" title="Eliminar"
                    onClick={e => { e.stopPropagation(); onDelete(i.id) }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function BankImportPage() {
  const [view, setView] = useState<'history' | 'upload' | 'review'>('history')
  const [imports, setImports] = useState<BankImport[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [activeImportId, setActiveImportId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => Promise.all([
    api.get('/bank-imports/').then(r => setImports(r.data)),
    propertiesApi.list().then(setProperties),
  ]).finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este extracto? No se eliminarán los gastos/pagos ya importados.')) return
    await api.delete(`/bank-imports/${id}`)
    load()
  }

  const handleUploaded = (importId: number) => {
    setActiveImportId(importId)
    setView('review')
    load()
  }

  const handleSelect = (importId: number) => {
    setActiveImportId(importId)
    setView('review')
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Extractos Bancarios</h1>
          <p className="text-gray-500 text-sm mt-1">
            Importá el extracto del banco y asociá cada movimiento a una propiedad
          </p>
        </div>
        <div className="flex gap-2">
          {view !== 'history' && (
            <button className="btn-secondary" onClick={() => setView('history')}>
              ← Historial
            </button>
          )}
          {view === 'history' && (
            <button className="btn-primary" onClick={() => setView('upload')}>
              <Upload className="w-4 h-4" /> Importar extracto
            </button>
          )}
        </div>
      </div>

      {/* Step indicator */}
      {view !== 'history' && (
        <div className="flex items-center gap-2 text-sm">
          <span className={`px-3 py-1 rounded-full font-medium ${view === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
            1. Subir archivo
          </span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className={`px-3 py-1 rounded-full font-medium ${view === 'review' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
            2. Revisar y confirmar
          </span>
        </div>
      )}

      {/* Content */}
      {loading && view === 'history' ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : view === 'history' ? (
        <HistoryList imports={imports} onSelect={handleSelect} onDelete={handleDelete} />
      ) : view === 'upload' ? (
        <UploadStep properties={properties} onUploaded={handleUploaded} />
      ) : activeImportId ? (
        <ReviewStep
          importId={activeImportId}
          properties={properties}
          onDone={() => { setView('history'); load() }}
        />
      ) : null}
    </div>
  )
}
