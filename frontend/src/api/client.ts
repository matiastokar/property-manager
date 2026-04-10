import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('pm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirect to login on 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pm_token')
      localStorage.removeItem('pm_username')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  login: async (username: string, password: string) => {
    const form = new URLSearchParams()
    form.append('username', username)
    form.append('password', password)
    const res = await axios.post('/api/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return res.data as { access_token: string; token_type: string; username: string }
  },
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/auth/change-password', data).then(r => r.data),
}

export default api

// Types
export type Currency = 'ARS' | 'EUR' | 'USD'
export type ContractStatus = 'active' | 'finished' | 'expired'
export type ExpenseType = 'fixed' | 'variable'
export type IncidentStatus = 'open' | 'in_progress' | 'resolved'

export interface Property {
  id: number
  name: string
  address: string
  city: string
  country: string
  type: string
  description?: string
  created_at: string
  has_active_contract?: boolean
  tenant_name?: string
  monthly_rent?: number
  rent_currency?: Currency
}

export interface Contract {
  id: number
  property_id: number
  property_name?: string
  tenant_name: string
  tenant_email?: string
  tenant_phone?: string
  start_date: string
  end_date: string
  monthly_rent: number
  currency: Currency
  status: ContractStatus
  finish_date?: string
  notes?: string
  created_at: string
}

export interface Expense {
  id: number
  property_id: number
  property_name?: string
  incident_id?: number
  expense_type: ExpenseType
  category: string
  amount: number
  currency: Currency
  description: string
  expense_date: string
  created_at: string
}

export interface Incident {
  id: number
  property_id: number
  property_name?: string
  title: string
  description: string
  incident_date: string
  status: IncidentStatus
  resolution_notes?: string
  created_at: string
  expense_count: number
}

export interface RentPayment {
  id: number
  contract_id: number
  tenant_name?: string
  property_name?: string
  property_id?: number
  country?: string
  amount: number
  currency: Currency
  payment_date: string
  period_month: number
  period_year: number
  payment_method?: string
  reference?: string
  has_proof: boolean
  notes?: string
  created_at: string
}

export interface DashboardSummary {
  total_properties: number
  active_contracts: number
  open_incidents: number
  monthly_income: Record<Currency, number>
  monthly_expenses: Record<Currency, number>
  current_month: number
  current_year: number
}

// API calls
export const propertiesApi = {
  list: () => api.get<Property[]>('/properties/').then(r => r.data),
  get: (id: number) => api.get<Property>(`/properties/${id}`).then(r => r.data),
  create: (data: Omit<Property, 'id' | 'created_at'>) => api.post('/properties/', data).then(r => r.data),
  update: (id: number, data: Partial<Property>) => api.put(`/properties/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/properties/${id}`).then(r => r.data),
}

export const contractsApi = {
  list: () => api.get<Contract[]>('/contracts/').then(r => r.data),
  listActive: () => api.get<Contract[]>('/contracts/active').then(r => r.data),
  get: (id: number) => api.get<Contract>(`/contracts/${id}`).then(r => r.data),
  create: (data: Omit<Contract, 'id' | 'created_at' | 'status'>) => api.post('/contracts/', data).then(r => r.data),
  update: (id: number, data: Partial<Contract>) => api.put(`/contracts/${id}`, data).then(r => r.data),
  finish: (id: number, data: { finish_date: string; notes?: string }) => api.post(`/contracts/${id}/finish`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/contracts/${id}`).then(r => r.data),
}

export const expensesApi = {
  list: (params?: { property_id?: number; expense_type?: string; period_month?: number; period_year?: number }) => api.get<Expense[]>('/expenses/', { params }).then(r => r.data),
  create: (data: Omit<Expense, 'id' | 'created_at' | 'property_name'>) => api.post('/expenses/', data).then(r => r.data),
  update: (id: number, data: Partial<Expense>) => api.put(`/expenses/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/expenses/${id}`).then(r => r.data),
}

export const incidentsApi = {
  list: (property_id?: number) => api.get<Incident[]>('/incidents/', { params: property_id ? { property_id } : {} }).then(r => r.data),
  get: (id: number) => api.get<Incident>(`/incidents/${id}`).then(r => r.data),
  create: (data: Omit<Incident, 'id' | 'created_at' | 'expense_count' | 'property_name'>) => api.post('/incidents/', data).then(r => r.data),
  update: (id: number, data: Partial<Incident>) => api.put(`/incidents/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/incidents/${id}`).then(r => r.data),
}

export interface PaymentStatus {
  contract_id: number
  tenant_name: string
  tenant_email?: string
  tenant_phone?: string
  property_id: number
  property_name: string
  country?: string
  city?: string
  expected_amount: number
  currency: Currency
  paid: boolean
  payment: RentPayment | null
}

export const rentsApi = {
  list: (params?: { contract_id?: number; period_year?: number; period_month?: number }) => api.get<RentPayment[]>('/rents/', { params }).then(r => r.data),
  getMissing: (period_year: number, period_month: number) => api.get('/rents/missing', { params: { period_year, period_month } }).then(r => r.data),
  getPaymentStatus: (period_year: number, period_month: number) => api.get<PaymentStatus[]>('/rents/payment-status', { params: { period_year, period_month } }).then(r => r.data),
  create: (data: Omit<RentPayment, 'id' | 'created_at' | 'tenant_name' | 'property_name' | 'property_id'>) => api.post('/rents/', data).then(r => r.data),
  update: (id: number, data: Partial<RentPayment>) => api.put(`/rents/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/rents/${id}`).then(r => r.data),
}

export interface RecurringExpense {
  id: number
  property_id: number
  property_name?: string
  expense_type: ExpenseType
  category: string
  amount: number
  currency: Currency
  description: string
  active: boolean
  created_at: string
}

export const recurringApi = {
  list: (property_id?: number) => api.get<RecurringExpense[]>('/recurring-expenses/', { params: property_id ? { property_id } : {} }).then(r => r.data),
  create: (data: Omit<RecurringExpense, 'id' | 'created_at' | 'property_name'>) => api.post('/recurring-expenses/', data).then(r => r.data),
  update: (id: number, data: Partial<RecurringExpense>) => api.put(`/recurring-expenses/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/recurring-expenses/${id}`).then(r => r.data),
}

export const dashboardApi = {
  getSummary: () => api.get<DashboardSummary>('/dashboard/summary').then(r => r.data),
  getOverview: (year?: number) => api.get('/dashboard/overview', { params: year ? { year } : {} }).then(r => r.data),
  getPropertyPerformance: (id: number, year?: number) => api.get(`/dashboard/property/${id}/performance`, { params: year ? { year } : {} }).then(r => r.data),
}
