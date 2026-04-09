import { useEffect, useState, useMemo } from 'react'
import { Building2, FileText, AlertTriangle, TrendingUp, TrendingDown, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { dashboardApi, type Currency } from '../api/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts'

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const CURRENCY_COLORS: Record<string, string> = { EUR: '#3b82f6', USD: '#10b981', ARS: '#f59e0b' }

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

function formatAmounts(amounts: Record<string, number>) {
  if (!amounts || Object.keys(amounts).length === 0) return '0'
  return Object.entries(amounts).map(([cur, val]) => `${val.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${cur}`).join(' | ')
}

function calcBenefit(income: Record<string, number>, expenses: Record<string, number>) {
  const currencies = new Set([...Object.keys(income), ...Object.keys(expenses)])
  const result: Record<string, number> = {}
  currencies.forEach(cur => {
    result[cur] = (income[cur] ?? 0) - (expenses[cur] ?? 0)
  })
  return result
}

function BenefitCell({ income, expenses }: { income: Record<string, number>; expenses: Record<string, number> }) {
  const benefit = calcBenefit(income ?? {}, expenses ?? {})
  const entries = Object.entries(benefit).filter(([, v]) => v !== 0)
  if (entries.length === 0) return <span className="text-gray-300">—</span>
  return (
    <div className="flex flex-col items-end gap-0.5">
      {entries.map(([cur, val]) => (
        <span key={cur} className={`font-semibold ${val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {val >= 0 ? '+' : ''}{val.toLocaleString('es-ES', { maximumFractionDigits: 0 })} {cur}
        </span>
      ))}
    </div>
  )
}

type SortKey = 'property_name' | 'city' | 'monthly_rent' | 'annual_income' | 'annual_expenses' | 'benefit' | 'open_incidents'
type SortDir = 'asc' | 'desc'

function getPrimaryCurrencyValue(amounts: Record<string, number>): number {
  if (!amounts) return 0
  return (amounts['USD'] ?? 0) + (amounts['EUR'] ?? 0) * 1.1 + (amounts['ARS'] ?? 0) * 0.001
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="inline w-3 h-3 ml-1 text-gray-300" />
  return sortDir === 'asc'
    ? <ChevronUp className="inline w-3 h-3 ml-1 text-blue-500" />
    : <ChevronDown className="inline w-3 h-3 ml-1 text-blue-500" />
}

export default function Dashboard() {
  const [summary, setSummary] = useState<any>(null)
  const [overview, setOverview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('property_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    Promise.all([dashboardApi.getSummary(), dashboardApi.getOverview()])
      .then(([s, o]) => { setSummary(s); setOverview(o) })
      .finally(() => setLoading(false))
  }, [])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedProperties = useMemo(() => {
    if (!overview?.properties) return []
    return [...overview.properties].sort((a, b) => {
      let av: any, bv: any
      if (sortKey === 'benefit') {
        av = getPrimaryCurrencyValue(calcBenefit(a.annual_income ?? {}, a.annual_expenses ?? {}))
        bv = getPrimaryCurrencyValue(calcBenefit(b.annual_income ?? {}, b.annual_expenses ?? {}))
      } else if (sortKey === 'annual_income') {
        av = getPrimaryCurrencyValue(a.annual_income ?? {})
        bv = getPrimaryCurrencyValue(b.annual_income ?? {})
      } else if (sortKey === 'annual_expenses') {
        av = getPrimaryCurrencyValue(a.annual_expenses ?? {})
        bv = getPrimaryCurrencyValue(b.annual_expenses ?? {})
      } else if (sortKey === 'monthly_rent') {
        av = a.monthly_rent ?? 0; bv = b.monthly_rent ?? 0
      } else if (sortKey === 'open_incidents') {
        av = a.open_incidents ?? 0; bv = b.open_incidents ?? 0
      } else {
        av = (a[sortKey] ?? '').toLowerCase(); bv = (b[sortKey] ?? '').toLowerCase()
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [overview, sortKey, sortDir])

  // Prepare country chart data
  const countryChartData = useMemo(() => {
    if (!overview?.properties) return []
    const byCountry: Record<string, { income: Record<string, number>; expenses: Record<string, number> }> = {}
    for (const p of overview.properties) {
      const country = p.country || 'Sin país'
      if (!byCountry[country]) byCountry[country] = { income: {}, expenses: {} }
      for (const [cur, val] of Object.entries(p.annual_income ?? {})) {
        byCountry[country].income[cur] = (byCountry[country].income[cur] ?? 0) + (val as number)
      }
      for (const [cur, val] of Object.entries(p.annual_expenses ?? {})) {
        byCountry[country].expenses[cur] = (byCountry[country].expenses[cur] ?? 0) + (val as number)
      }
    }
    return Object.entries(byCountry).map(([country, data]) => {
      const row: Record<string, any> = { name: country }
      for (const [cur, val] of Object.entries(data.income)) row[`Ingreso ${cur}`] = Math.round(val)
      for (const [cur, val] of Object.entries(data.expenses)) row[`Gasto ${cur}`] = Math.round(val)
      return row
    })
  }, [overview])

  const countryBarKeys = useMemo(() =>
    Array.from(new Set(countryChartData.flatMap(d => Object.keys(d).filter(k => k !== 'name'))))
  , [countryChartData])

  const countryBarColor: Record<string, string> = {
    'Ingreso EUR': '#6366f1', 'Ingreso USD': '#10b981', 'Ingreso ARS': '#06b6d4',
    'Gasto EUR':   '#f97316', 'Gasto USD':   '#ef4444', 'Gasto ARS':   '#f59e0b',
  }

  // Rentabilidad YTD por propiedad
  const rentabilidadData = useMemo(() => {
    if (!overview?.properties) return []
    return overview.properties
      .map((p: any) => {
        const benefit = calcBenefit(p.annual_income ?? {}, p.annual_expenses ?? {})
        // Build label with all currencies that have a value
        const label = Object.entries(benefit)
          .filter(([, v]) => v !== 0)
          .map(([cur, v]) => `${(v as number) >= 0 ? '+' : ''}${Math.round(v as number).toLocaleString('es-ES')} ${cur}`)
          .join(' / ')
        return {
          name: p.property_name.length > 16 ? p.property_name.slice(0, 16) + '…' : p.property_name,
          fullName: p.property_name,
          benefit: Math.round(getPrimaryCurrencyValue(benefit)),
          label,
          currencies: benefit,
        }
      })
      .sort((a: any, b: any) => b.benefit - a.benefit)
  }, [overview])

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400">Cargando...</div>

  const monthLabel = summary ? MONTH_NAMES[(summary.current_month ?? 1) - 1] : ''

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">{monthLabel} {summary?.current_year} — Resumen patrimonial</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Propiedades" value={summary?.total_properties ?? 0} icon={Building2} color="bg-blue-600" />
        <StatCard label="Contratos activos" value={summary?.active_contracts ?? 0} icon={FileText} color="bg-green-600" />
        <StatCard label="Incidencias abiertas" value={summary?.open_incidents ?? 0} icon={AlertTriangle} color="bg-orange-500" />
        <div className="card">
          <p className="text-sm text-gray-500 mb-1">Ingresos {monthLabel}</p>
          <p className="text-lg font-bold text-green-600">{formatAmounts(summary?.monthly_income ?? {})}</p>
          <p className="text-sm text-gray-500 mt-2 mb-1">Gastos {monthLabel}</p>
          <p className="text-lg font-bold text-red-500">{formatAmounts(summary?.monthly_expenses ?? {})}</p>
          <div className="border-t border-gray-100 mt-3 pt-3">
            <p className="text-sm text-gray-500 mb-1">Beneficio {monthLabel}</p>
            {(() => {
              const income = summary?.monthly_income ?? {}
              const expenses = summary?.monthly_expenses ?? {}
              const currencies = Array.from(new Set([...Object.keys(income), ...Object.keys(expenses)]))
              return currencies.map(cur => {
                const val = (income[cur] ?? 0) - (expenses[cur] ?? 0)
                return (
                  <p key={cur} className={`text-lg font-bold ${val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {val >= 0 ? '+' : ''}{val.toLocaleString('es-ES', { maximumFractionDigits: 0 })} {cur}
                  </p>
                )
              })
            })()}
          </div>
        </div>
      </div>

      {/* Properties performance table */}
      {overview?.properties?.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Rendimiento por Propiedad ({overview.year})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  {([
                    ['property_name', 'Propiedad', ''],
                    ['city', 'Ubicación', ''],
                    ['tenant_name', 'Inquilino', ''],
                    ['monthly_rent', 'Renta/mes', 'text-right'],
                    ['annual_income', 'Ingresos anuales', 'text-right'],
                    ['annual_expenses', 'Gastos anuales', 'text-right'],
                    ['benefit', 'Beneficio YTD', 'text-right'],
                    ['open_incidents', 'Incidencias', 'text-center'],
                  ] as [SortKey, string, string][]).map(([key, label, align]) => (
                    <th key={key} className={`pb-3 font-medium cursor-pointer select-none hover:text-gray-800 ${align}`}
                      onClick={() => handleSort(key)}>
                      {label}<SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedProperties.map((p: any) => (
                  <tr key={p.property_id} className="hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-900">{p.property_name}</td>
                    <td className="py-3 text-gray-500">{p.city}, {p.country}</td>
                    <td className="py-3 text-gray-600">{p.tenant_name ?? <span className="text-gray-300">Sin contrato</span>}</td>
                    <td className="py-3 text-right">
                      {p.monthly_rent ? `${p.monthly_rent.toLocaleString('es-ES')} ${p.rent_currency}` : '—'}
                    </td>
                    <td className="py-3 text-right text-green-700 font-medium">
                      {formatAmounts(p.annual_income)}
                    </td>
                    <td className="py-3 text-right text-red-600 font-medium">
                      {formatAmounts(p.annual_expenses)}
                    </td>
                    <td className="py-3 text-right">
                      <BenefitCell income={p.annual_income} expenses={p.annual_expenses} />
                    </td>
                    <td className="py-3 text-center">
                      {p.open_incidents > 0
                        ? <span className="badge-yellow">{p.open_incidents}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Country chart */}
      {countryChartData.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Ingresos vs Gastos por País</h2>
          <p className="text-xs text-gray-400 mb-4">Acumulado {overview?.year} · por moneda local</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={countryChartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip formatter={(value: number, name: string) => [value.toLocaleString('es-ES'), name]} />
              <Legend />
              {countryBarKeys.map(key => (
                <Bar key={key} dataKey={key} fill={countryBarColor[key] ?? '#94a3b8'} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Rentabilidad YTD */}
      {rentabilidadData.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Rentabilidad YTD por Propiedad</h2>
          <p className="text-xs text-gray-400 mb-4">Beneficio acumulado {overview?.year} · ordenado mayor a menor · eje en valor equivalente USD</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rentabilidadData} margin={{ top: 20, right: 20, left: 10, bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                      <p className="font-semibold text-gray-800 mb-1">{d.fullName}</p>
                      {Object.entries(d.currencies as Record<string, number>).map(([cur, val]) => (
                        <p key={cur} className={val >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                          {val >= 0 ? '+' : ''}{Math.round(val).toLocaleString('es-ES')} {cur}
                        </p>
                      ))}
                    </div>
                  )
                }}
              />
              <Bar dataKey="benefit" radius={[4, 4, 0, 0]}
                label={{ position: 'top', fontSize: 9, formatter: (_v: number, _n: string, props: any) => props?.payload?.label ?? '' }}>
                {rentabilidadData.map((entry: any, index: number) => (
                  <Cell key={index} fill={entry.benefit >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {overview?.properties?.length === 0 && (
        <div className="card text-center py-12 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aún no hay propiedades registradas.</p>
          <p className="text-sm mt-1">Comienza agregando una propiedad desde el menú lateral.</p>
        </div>
      )}
    </div>
  )
}
