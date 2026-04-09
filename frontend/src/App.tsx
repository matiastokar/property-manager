import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import Contracts from './pages/Contracts'
import Expenses from './pages/Expenses'
import Incidents from './pages/Incidents'
import Rents from './pages/Rents'
import Agents from './pages/Agents'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/rents" element={<Rents />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/agents" element={<Agents />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
