import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import Contracts from './pages/Contracts'
import Expenses from './pages/Expenses'
import Incidents from './pages/Incidents'
import Rents from './pages/Rents'
import Agents from './pages/Agents'
import Recurring from './pages/Recurring'
import PaymentStatus from './pages/PaymentStatus'
import BankImport from './pages/BankImport'
import Login from './pages/Login'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('pm_token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/rents" element={<Rents />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/payment-status" element={<PaymentStatus />} />
          <Route path="/bank-import" element={<BankImport />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
