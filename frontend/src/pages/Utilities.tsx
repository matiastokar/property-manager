import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import {
  Zap, Flame, Droplets, AlertTriangle,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  X, ExternalLink,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Expense {
  id: number
  property_id: number
  property_name: string
  expense_type: string
  category: string
  amount: number
  currency: string
  description: string
  expense_date: string
}

interface UtilityStats {
  current: number | null
  previous: number | null
  pct_change: number | null
  alert: boolean
  expenses: Expense[]       // current month raw records
}

interface ComparisonRow {
  property_id: number
  property_name: string
  utilities: Record<UtilityKey, UtilityStats>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UTILITY_META = {
  electricity: { label: 'Electricidad', icon: Zap,      color: '#f59e0b' },
  gas:         { label: 'Gas',          icon: Flame,    color: '#ef4444' },
  water:       { label: 'Agua',         icon: Droplets, color: '#3b82f6' },
} as const

type UtilityKey = keyof typeof UTILITY_META

const UTILITY_KEYS = Object.keys(UTILITY_META) as UtilityKey[]

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function prevPeriod(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

function sumByPropCategory(expenses: Expense[]): Record<number, Record<string, number>> {
  const map: Record<number, Record<string, number>> = {}
  for (const e of expenses) {
    if (!map[e.property_id]) map[e.property_id] = {}
    map[e.property_id][e.category] = (map[e.property_id][e.category] ?? 0) + e.amount
  }
  return map
}

function expensesByPropCategory(expenses: Expense[]): Record<number, Record<string, Expense[]>> {
  const map: Record<number, Record<string, Expense[]>> = {}
  for (const e of expenses) {
    if (!map[e.property_id]) map[e.property_id] = {}
    if (!map[e.property_id][e.category]) map[e.property_id][e.category] = []
    map[e.property_id][e.category].push(e)
  }
  return map
}

// ── PctBadge ──────────────────────────────────────────────────────────────────

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-gray-300">—</span>
  const abs  = Math.abs(pct)
  const up   = pct > 0
  const warn = pct > 10
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full
      ${warn ? 'bg-red-100 text-red-700' : up ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>
      {up   ? <TrendingUp   className="w-3 h-3" />
            : pct < 0 ? <TrendingDown className="w-3 h-3" />
            : <Minus className="w-3 h-3" />}
      {abs.toFixed(1)}%
    </span>
  )
}

// ── Trend Chart Modal ─────────────────────────────────────────────────────────

function TrendModal({ propId, propName, onClose }: {
  propId: number; propName: string; onClose: () => void
}) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch last 12 months
    const now   = new Date()
    const calls = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      return { year: d.getFullYear(), month: d.getMonth() + 1, label: MONTHS[d.getMonth()].slice(0,3)+' '+d.getFullYear() }
    })
    Promise.all(
      calls.map(({ year, month }) =>
        api.get('/expenses/', {
          params: { property_id: propId, expense_type: 'variable', period_year: year, period_month: month },
        }).then(r => ({ year, month, expenses: r.data as Expense[] }))
      )
    ).then(results => {
      const chartData = results.map(({ year, month, expenses }, i) => {
        const row: any = { label: calls[i].label }
        for (const key of UTILITY_KEYS) {
          row[key] = expenses
            .filter(e => e.category === key)
            .reduce((s, e) => s + e.amount, 0) || null
        }
        return row
      })
      setData(chartData)
    }).finally(() => setLoading(false))
  }, [propId])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-800">Evolución últimos 12 meses — {propName}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">Cargando…</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `€${v}`} />
              <Tooltip formatter={(v: number) => `€${v?.toFixed(2)}`} />
              <Legend />
              {UTILITY_KEYS.map(key => (
                <Line key={key} type="monotone" dataKey={key}
                  name={UTILITY_META[key].label}
                  stroke={UTILITY_META[key].color}
                  strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Utilities() {
  const now     = new Date()
  const navigate = useNavigate()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [currentExpenses,  setCurrentExpenses]  = useState<Expense[]>([])
  const [previousExpenses, setPreviousExpenses] = useState<Expense[]>([])
  const [allProperties,    setAllProperties]    = useState<{ id: number; name: string }[]>([])
  const [loading,          setLoading]          = useState(true)
  const [trendProp,        setTrendProp]        = useState<{ id: number; name: string } | null>(null)
  const [expanded,         setExpanded]         = useState<Set<number>>(new Set())

  const prev = useMemo(() => prevPeriod(year, month), [year, month])

  const UTILITY_CATS = UTILITY_KEYS.join(',')

  const load = async () => {
    setLoading(true)
    try {
      const [cur, prv, props] = await Promise.all([
        // Only fetch variable expenses in utility categories
        Promise.all(
          UTILITY_KEYS.map(cat =>
            api.get('/expenses/', { params: { expense_type: 'variable', category: cat, period_year: year, period_month: month } })
              .then(r => r.data as Expense[])
          )
        ).then(r => r.flat()),
        Promise.all(
          UTILITY_KEYS.map(cat =>
            api.get('/expenses/', { params: { expense_type: 'variable', category: cat, period_year: prev.year, period_month: prev.month } })
              .then(r => r.data as Expense[])
          )
        ).then(r => r.flat()),
        api.get('/properties/').then(r => r.data),
      ])
      setCurrentExpenses(cur)
      setPreviousExpenses(prv)
      setAllProperties(props)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year, month])

  // Build comparison rows
  const comparison = useMemo((): ComparisonRow[] => {
    const curSums  = sumByPropCategory(currentExpenses)
    const prevSums = sumByPropCategory(previousExpenses)
    const curExp   = expensesByPropCategory(currentExpenses)

    const propIds = new Set([
      ...Object.keys(curSums).map(Number),
      ...Object.keys(prevSums).map(Number),
    ])

    const propNameMap = Object.fromEntries(allProperties.map(p => [p.id, p.name]))

    return [...propIds].sort((a,b) => a-b).map(propId => {
      const utilities = {} as Record<UtilityKey, UtilityStats>
      for (const key of UTILITY_KEYS) {
        const current  = curSums[propId]?.[key]  ?? null
        const previous = prevSums[propId]?.[key] ?? null
        const pct_change = (current !== null && previous !== null && previous !== 0)
          ? Math.round((current - previous) / previous * 1000) / 10
          : null
        utilities[key] = {
          current, previous,
          pct_change,
          alert: pct_change !== null && pct_change > 10,
          expenses: curExp[propId]?.[key] ?? [],
        }
      }
      return { property_id: propId, property_name: propNameMap[propId] ?? `Prop ${propId}`, utilities }
    })
  }, [currentExpenses, previousExpenses, allProperties])

  const alertCount = useMemo(() =>
    comparison.reduce((n, row) => n + UTILITY_KEYS.filter(k => row.utilities[k].alert).length, 0),
  [comparison])

  const totals = useMemo(() => {
    const t: Record<UtilityKey, number> = { electricity: 0, gas: 0, water: 0 }
    for (const e of currentExpenses) {
      if (e.category in t) t[e.category as UtilityKey] += e.amount
    }
    return t
  }, [currentExpenses])

  // Properties with active contracts but no utility expense this month
  const propsWithoutReadings = useMemo(() => {
    const withData = new Set(currentExpenses.map(e => e.property_id))
    return allProperties.filter(p => !withData.has(p.id))
  }, [allProperties, currentExpenses])

  const toggleExpand = (id: number) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suministros</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gastos variables de electricidad, gas y agua por propiedad
          </p>
        </div>
        <button
          onClick={() => navigate('/expenses')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <ExternalLink className="w-4 h-4" /> Cargar gasto
        </button>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-3 mb-6">
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={year} onChange={e => setYear(Number(e.target.value))}>
          {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-sm text-gray-400">
          vs {MONTHS[prev.month - 1]} {prev.year}
        </span>
      </div>

      {/* Alert banner */}
      {alertCount > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            {alertCount} servicio{alertCount !== 1 ? 's' : ''} con aumento superior al 10% respecto al mes anterior
          </p>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {UTILITY_KEYS.map(key => {
          const { label, icon: Icon, color } = UTILITY_META[key]
          return (
            <div key={key} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color }} />
                <span className="text-xs text-gray-500 font-medium">{label}</span>
              </div>
              <p className="text-xl font-bold text-gray-800">€{totals[key].toFixed(2)}</p>
              <p className="text-xs text-gray-400">{MONTHS[month-1]} {year}</p>
            </div>
          )
        })}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <span className="text-xs text-gray-500 font-medium block mb-1">Total</span>
          <p className="text-xl font-bold text-gray-800">
            €{Object.values(totals).reduce((s,v) => s+v, 0).toFixed(2)}
          </p>
          <p className="text-xs text-gray-400">{currentExpenses.length} registros</p>
        </div>
      </div>

      {/* Missing notice */}
      {!loading && propsWithoutReadings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            <span className="font-medium">Sin suministros registrados este mes: </span>
            {propsWithoutReadings.map(p => p.name).join(', ')}
          </p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Cargando…</div>
      ) : comparison.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay gastos de suministros registrados para este mes.</p>
          <p className="text-xs text-gray-400 mt-1">
            Cargalos desde <button className="text-blue-500 hover:underline" onClick={() => navigate('/expenses')}>Gastos</button> seleccionando categoría Electricidad, Gas o Agua.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {comparison.map(row => {
            const isExpanded = expanded.has(row.property_id)
            const hasAlert   = UTILITY_KEYS.some(k => row.utilities[k].alert)
            const hasData    = UTILITY_KEYS.some(k => row.utilities[k].current !== null)

            return (
              <div key={row.property_id}
                className={`bg-white border rounded-xl overflow-hidden transition-colors
                  ${hasAlert ? 'border-red-200' : 'border-gray-200'}`}>

                {/* Row header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {hasAlert && <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />}

                  <p className="font-medium text-gray-800 text-sm flex-1 truncate">
                    {row.property_name}
                  </p>

                  {/* Utility summary pills */}
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {UTILITY_KEYS.map(key => {
                      const { icon: Icon, color } = UTILITY_META[key]
                      const s = row.utilities[key]
                      if (s.current === null) return (
                        <span key={key} className="flex items-center gap-1 text-xs text-gray-200">
                          <Icon className="w-3.5 h-3.5" /> —
                        </span>
                      )
                      return (
                        <div key={key} className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5" style={{ color }} />
                          <span className="text-sm font-semibold text-gray-700">
                            €{s.current.toFixed(2)}
                          </span>
                          <PctBadge pct={s.pct_change} />
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={() => setTrendProp({ id: row.property_id, name: row.property_name })}
                      className="text-xs text-blue-500 hover:underline hidden sm:block whitespace-nowrap"
                    >Evolución</button>
                    <button onClick={() => toggleExpand(row.property_id)}
                      className="p-1 text-gray-400 hover:text-gray-600">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
                    {/* Per-utility cards */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {UTILITY_KEYS.map(key => {
                        const { label, icon: Icon, color } = UTILITY_META[key]
                        const s = row.utilities[key]
                        return (
                          <div key={key}
                            className={`rounded-lg p-3 border ${s.alert
                              ? 'bg-red-50 border-red-100'
                              : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Icon className="w-4 h-4" style={{ color }} />
                              <span className="text-xs font-medium text-gray-600">{label}</span>
                              {s.alert && <AlertTriangle className="w-3 h-3 text-red-500" />}
                            </div>
                            <div className="flex items-end justify-between">
                              <div>
                                <p className="text-lg font-bold text-gray-800">
                                  {s.current != null ? `€${s.current.toFixed(2)}` : '—'}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {MONTHS[prev.month-1]}: {s.previous != null ? `€${s.previous.toFixed(2)}` : '—'}
                                </p>
                              </div>
                              <PctBadge pct={s.pct_change} />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Individual expense records */}
                    <p className="text-xs font-medium text-gray-500 mb-2">Registros del mes</p>
                    {row.utilities.electricity.expenses.length === 0 &&
                     row.utilities.gas.expenses.length === 0 &&
                     row.utilities.water.expenses.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Sin registros este mes.</p>
                    ) : (
                      <div className="space-y-1">
                        {UTILITY_KEYS.flatMap(key =>
                          row.utilities[key].expenses.map(e => {
                            const { icon: Icon, color, label } = UTILITY_META[key]
                            return (
                              <div key={e.id}
                                className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2">
                                <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                                <span className="text-xs text-gray-500 w-24 flex-shrink-0">{label}</span>
                                <span className="text-sm font-medium text-gray-700">€{e.amount.toFixed(2)}</span>
                                <span className="text-xs text-gray-400 flex-1 truncate">{e.description}</span>
                                <span className="text-xs text-gray-300 flex-shrink-0">{e.expense_date}</span>
                                <button
                                  onClick={() => navigate('/expenses')}
                                  className="text-xs text-blue-400 hover:underline flex-shrink-0">
                                  Ver
                                </button>
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Trend modal */}
      {trendProp && (
        <TrendModal
          propId={trendProp.id}
          propName={trendProp.name}
          onClose={() => setTrendProp(null)}
        />
      )}
    </div>
  )
}
