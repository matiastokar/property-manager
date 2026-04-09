import { useState } from 'react'
import { Bot, Play, CheckCircle, Clock, Mail, Calendar } from 'lucide-react'
import api from '../api/client'

export default function Agents() {
  const [runningPayment, setRunningPayment] = useState(false)
  const [runningSummary, setRunningSummary] = useState(false)
  const [resultPayment, setResultPayment] = useState<string | null>(null)
  const [resultSummary, setResultSummary] = useState<string | null>(null)

  const runPaymentCheck = async () => {
    setRunningPayment(true)
    setResultPayment(null)
    try {
      const res = await api.get('/agents/run-payment-check')
      setResultPayment(res.data.message)
    } catch (e: any) {
      setResultPayment(`Error: ${e.message}`)
    } finally {
      setRunningPayment(false)
    }
  }

  const runMonthlySummary = async () => {
    setRunningSummary(true)
    setResultSummary(null)
    try {
      const res = await api.get('/agents/run-monthly-summary')
      setResultSummary(res.data.message)
    } catch (e: any) {
      setResultSummary(`Error: ${e.message}`)
    } finally {
      setRunningSummary(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agentes AI</h1>
        <p className="text-gray-500 text-sm mt-1">Automatizaciones que se ejecutan el día 10 de cada mes</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment Check Agent */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-50 rounded-xl">
              <Mail className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Control de Pagos</h2>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Día 10 · 09:00 AM
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Verifica que todas las unidades alquiladas con contrato vigente tengan registrado su pago mensual.
            En caso de falta, envía un email a <strong>Ignacio Rollan</strong> consultando la fecha estimada de pago.
          </p>
          <ul className="text-sm text-gray-500 space-y-1">
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Verifica contratos activos</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Detecta pagos faltantes</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Envía email automático vía Gmail</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Redacta con Claude AI</li>
          </ul>
          {resultPayment && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
              {resultPayment}
            </div>
          )}
          <button
            className="btn-primary w-full justify-center"
            onClick={runPaymentCheck}
            disabled={runningPayment}
          >
            {runningPayment ? (
              <><Clock className="w-4 h-4 animate-spin" /> Ejecutando...</>
            ) : (
              <><Play className="w-4 h-4" /> Ejecutar ahora</>
            )}
          </button>
        </div>

        {/* Monthly Summary Agent */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-xl">
              <Bot className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Resumen Mensual</h2>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Día 10 · 10:00 AM
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Analiza todos los ingresos, egresos e incidencias del mes anterior y genera un resumen
            ejecutivo enviado por email con formato profesional.
          </p>
          <ul className="text-sm text-gray-500 space-y-1">
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Consolida ingresos y gastos</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Analiza incidencias abiertas</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Email HTML con tablas y gráficos</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Resumen ejecutivo con Claude AI</li>
          </ul>
          {resultSummary && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
              {resultSummary}
            </div>
          )}
          <button
            className="btn-primary w-full justify-center"
            onClick={runMonthlySummary}
            disabled={runningSummary}
          >
            {runningSummary ? (
              <><Clock className="w-4 h-4 animate-spin" /> Ejecutando...</>
            ) : (
              <><Play className="w-4 h-4" /> Ejecutar ahora</>
            )}
          </button>
        </div>
      </div>

      <div className="card bg-blue-50 border-blue-100">
        <h3 className="font-medium text-blue-900 mb-2">Configuración requerida</h3>
        <p className="text-sm text-blue-700 mb-3">Para que los agentes funcionen, configura las variables de entorno en el archivo <code className="bg-blue-100 px-1 rounded">.env</code>:</p>
        <div className="bg-white rounded-lg p-4 font-mono text-xs text-gray-700 space-y-1">
          <div><span className="text-gray-400"># Anthropic API</span></div>
          <div>ANTHROPIC_API_KEY=<span className="text-blue-600">sk-ant-...</span></div>
          <div className="mt-2"><span className="text-gray-400"># Gmail (usar App Password)</span></div>
          <div>GMAIL_USER=<span className="text-blue-600">tu@gmail.com</span></div>
          <div>GMAIL_APP_PASSWORD=<span className="text-blue-600">xxxx xxxx xxxx xxxx</span></div>
          <div className="mt-2"><span className="text-gray-400"># Destinatario</span></div>
          <div>RECIPIENT_EMAIL=<span className="text-blue-600">ignacio.rollan@example.com</span></div>
          <div className="mt-2"><span className="text-gray-400"># Archivo Excel (opcional)</span></div>
          <div>ACCOUNTS_FILE=<span className="text-blue-600">/ruta/al/archivo.xlsx</span></div>
        </div>
      </div>
    </div>
  )
}
