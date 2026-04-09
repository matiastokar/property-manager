import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Building2, FileText, Receipt, AlertTriangle,
  CreditCard, Bot
} from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/properties', label: 'Propiedades', icon: Building2 },
  { to: '/contracts', label: 'Contratos', icon: FileText },
  { to: '/rents', label: 'Pagos', icon: CreditCard },
  { to: '/expenses', label: 'Gastos', icon: Receipt },
  { to: '/incidents', label: 'Incidencias', icon: AlertTriangle },
  { to: '/agents', label: 'Agentes AI', icon: Bot },
]

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Building2 className="w-7 h-7 text-blue-600" />
            <div>
              <h1 className="font-bold text-gray-900 text-sm leading-tight">Gestor</h1>
              <p className="text-xs text-gray-500">Patrimonial</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-200">
          <p className="text-xs text-gray-400">Agentes AI: día 10 de cada mes</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
