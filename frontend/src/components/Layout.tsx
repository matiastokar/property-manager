import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, FileText, Receipt, AlertTriangle,
  CreditCard, Bot, LogOut, User, CalendarClock, ClipboardCheck, Landmark
} from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/properties', label: 'Propiedades', icon: Building2 },
  { to: '/contracts', label: 'Contratos', icon: FileText },
  { to: '/payment-status', label: 'Estado de Pagos', icon: ClipboardCheck },
  { to: '/rents', label: 'Pagos', icon: CreditCard },
  { to: '/expenses', label: 'Gastos', icon: Receipt },
  { to: '/recurring', label: 'Gastos Fijos', icon: CalendarClock },
  { to: '/bank-import', label: 'Extractos', icon: Landmark },
  { to: '/incidents', label: 'Incidencias', icon: AlertTriangle },
  { to: '/agents', label: 'Agentes AI', icon: Bot },
]

export default function Layout() {
  const navigate = useNavigate()
  const username = localStorage.getItem('pm_username') ?? 'admin'

  const handleLogout = () => {
    localStorage.removeItem('pm_token')
    localStorage.removeItem('pm_username')
    navigate('/login', { replace: true })
  }

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
        <div className="px-4 py-3 border-t border-gray-200 space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <User className="w-3.5 h-3.5" />
            <span className="font-medium">{username}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full text-xs text-gray-400 hover:text-red-500 transition-colors py-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
