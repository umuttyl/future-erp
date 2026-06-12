import { AlertTriangle, Bot, Building2, ChevronDown, ChevronUp, Lock, RefreshCw, Send, TrendingUp, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ForecastChart, type ForecastPoint } from '../components/ai/ForecastChart'
import { InsightBanner, InsightCardSection } from '../components/ai/InsightCards'
import { StockAlertList } from '../components/ai/StockAlertList'
import { PageLayout } from '../components/ui/PageLayout'
import {
  inputFieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  api,
  formatCurrency,
  formatNumber,
  getApiErrorMessage,
  fetchExperts,
  type AiInsights,
  type DailySalesPoint,
  type ExpertInfo,
  type ExpertQueryOut,
  type ForecastResult,
  type NlpQueryResponse,
  type StockAlert,
} from '../lib/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function iso(d: string) {
  return new Date(d).toISOString().slice(0, 10)
}

function aiIsoToday() { return new Date().toISOString().slice(0, 10) }
function aiIsoDaysAgo(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10)
}
type TrendPeriod = '7d' | '30d' | '3m' | '12m'
type TrendPoint = { label: string; revenue: number; orders: number }
function aiWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return `W${Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)}`
}
function aiAggregateWeekly(daily: DailySalesPoint[]): TrendPoint[] {
  const map = new Map<string, { revenue: number; orders: number }>()
  for (const d of daily) {
    const key = aiWeekLabel(new Date(d.date))
    const prev = map.get(key) ?? { revenue: 0, orders: 0 }
    map.set(key, { revenue: prev.revenue + d.revenue, orders: prev.orders + d.quantity })
  }
  return Array.from(map.entries()).map(([label, v]) => ({ label, ...v }))
}

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  const lk = key.toLowerCase()
  if (
    lk.includes('ciro') || lk.includes('tutar') || lk.includes('amount') ||
    lk.includes('revenue') || lk.includes('price') || lk.includes('cost')
  ) {
    const n = Number(value)
    if (Number.isFinite(n)) return formatCurrency(n)
  }
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return String(value)
}

// ---------------------------------------------------------------------------
// Widget wrapper — collapsible, localStorage-persisted
// ---------------------------------------------------------------------------

const WIDGET_STORAGE_KEY = 'ai_widget_collapsed'

function useWidgetCollapsed(id: string, defaultCollapsed = false) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(WIDGET_STORAGE_KEY)
      const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
      return map[id] ?? defaultCollapsed
    } catch { return defaultCollapsed }
  })

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try {
        const raw = localStorage.getItem(WIDGET_STORAGE_KEY)
        const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
        localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify({ ...map, [id]: next }))
      } catch { /* ignore */ }
      return next
    })
  }

  return { collapsed, toggle }
}

function Widget({
  id,
  title,
  description,
  children,
  defaultCollapsed = false,
  headerRight,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
  defaultCollapsed?: boolean
  headerRight?: React.ReactNode
}) {
  const { collapsed, toggle } = useWidgetCollapsed(id, defaultCollapsed)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3 select-none"
        onClick={toggle}
      >
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
          {description && !collapsed && (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {headerRight && (
            <div onClick={e => e.stopPropagation()}>{headerRight}</div>
          )}
          {collapsed
            ? <ChevronDown className="h-4 w-4 text-slate-400" />
            : <ChevronUp className="h-4 w-4 text-slate-400" />}
        </div>
      </div>
      {!collapsed && <div className="border-t border-slate-100 dark:border-slate-800">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline Chat — right sidebar embedded panel
// ---------------------------------------------------------------------------

const INLINE_QUESTIONS_MANAGER = [
  'Top 5 products by revenue',
  'Products below stock threshold',
  'Which customer placed the most orders?',
]
const INLINE_QUESTIONS_ADMIN = [
  'Total sales by company',
  'How many active companies are there?',
  'Top 5 companies by revenue',
]

type ChatMsg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'ai'; payload: NlpQueryResponse }
  | { id: string; role: 'ai-text'; text: string }
  | { id: string; role: 'error'; text: string }

function InlineChat({ role }: { role: string }) {
  const [input, setInput]     = useState('')
  const [msgs, setMsgs]       = useState<ChatMsg[]>([])
  const [busy, setBusy]       = useState(false)
  const bottomRef             = useRef<HTMLDivElement | null>(null)
  const questions = role === 'admin' ? INLINE_QUESTIONS_ADMIN : INLINE_QUESTIONS_MANAGER

  async function ask(text?: string) {
    const q = (text ?? input).trim()
    if (!q) return
    setInput('')
    setMsgs((m) => [...m, { id: `u-${Date.now()}`, role: 'user', text: q }])
    setBusy(true)
    try {
      const { data } = await api.post<NlpQueryResponse>('/chat', { text: q }, { timeout: 90_000 })
      const hasTable = Array.isArray(data.data) && data.data.length > 0
      setMsgs((m) => [
        ...m,
        hasTable
          ? { id: `a-${Date.now()}`, role: 'ai', payload: data }
          : { id: `a-${Date.now()}`, role: 'ai-text', text: data.answer || '—' },
      ])
    } catch (e: unknown) {
      setMsgs((m) => [...m, { id: `e-${Date.now()}`, role: 'error', text: getApiErrorMessage(e, 'Request failed') }])
    } finally {
      setBusy(false)
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-violet-200 bg-white shadow-sm dark:border-violet-500/30 dark:bg-slate-900">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 rounded-t-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white">
        <Bot className="h-4 w-4" />
        <span className="text-sm font-semibold">AI Chat</span>
        <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
          {role === 'admin' ? 'Platform' : 'Company'}
        </span>
      </div>

      {/* Quick questions */}
      <div className="shrink-0 flex flex-wrap gap-1.5 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void ask(q)}
            className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/40"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3">
        {msgs.length === 0 && (
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-4">
            Choose a question above or type your own.
          </p>
        )}
        {msgs.map((m) => {
          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 px-3 py-2 text-xs leading-relaxed text-white">
                  {m.text}
                </div>
              </div>
            )
          }
          if (m.role === 'ai-text') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  {m.text}
                </div>
              </div>
            )
          }
          if (m.role === 'error') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100">
                  {m.text}
                </div>
              </div>
            )
          }
          // ai table result
          const { answer, columns, data } = m.payload
          return (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-full space-y-1.5 rounded-2xl rounded-bl-md border border-slate-200/80 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                {answer && <p className="text-xs text-slate-800 dark:text-slate-100">{answer}</p>}
                {data.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full text-[11px]">
                      <thead>
                        <tr className="bg-slate-100 text-left text-[10px] uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          {columns.map((c) => <th key={c} className="px-2 py-1.5 font-semibold">{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {data.slice(0, 10).map((row, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                            {columns.map((c) => (
                              <td key={c} className="px-2 py-1.5 text-slate-700 dark:text-slate-200">
                                {formatCell(c, (row as Record<string, unknown>)[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {data.length > 10 && (
                      <p className="px-2 py-1 text-[10px] text-slate-400">+{data.length - 10} more rows</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-500 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-500 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-500" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-slate-200/80 p-2.5 dark:border-slate-800">
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 pl-2.5 dark:border-slate-700 dark:bg-slate-800">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void ask() }}
            placeholder="Type your question…"
            className="min-w-0 flex-1 bg-transparent py-1 text-xs text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            type="button"
            disabled={!input.trim() || busy}
            onClick={() => void ask()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expert Tabs — 5 uzman sekmeli kart
// ---------------------------------------------------------------------------

function ExpertTabs() {
  const [experts, setExperts]       = useState<ExpertInfo[]>([])
  const [activeTab, setActiveTab]   = useState<string | null>(null)
  const [question, setQuestion]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState<ExpertQueryOut | null>(null)
  const [streamText, setStreamText] = useState('')
  const [statusMsg, setStatusMsg]   = useState('')
  const [elapsed, setElapsed]       = useState(0)
  const [err, setErr]               = useState<string | null>(null)
  const abortRef                    = useRef<AbortController | null>(null)
  const timerRef                    = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchExperts().then((list) => {
      setExperts(list)
      if (list.length > 0) setActiveTab(list[0].key)
    }).catch(() => {})
    return () => {
      abortRef.current?.abort()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const active = experts.find((e) => e.key === activeTab)

  function cancelQuery() {
    abortRef.current?.abort()
    if (timerRef.current) clearInterval(timerRef.current)
    setLoading(false)
    setStatusMsg('')
  }

  async function ask(text?: string) {
    const q = (text ?? question).trim()
    if (!q || !activeTab) return
    setQuestion(q)
    setLoading(true)
    setErr(null)
    setResult(null)
    setStreamText('')
    setStatusMsg('Connecting…')
    setElapsed(0)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const startMs = Date.now()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000))
    }, 1000)

    try {
      const { getAccessToken } = await import('../lib/authSession')
      const token = getAccessToken()
      const res = await fetch(`/api/ai/expert/${activeTab}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: q }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        setErr(`Request failed (${res.status})`)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let accumulated = ''
      let finalResult: ExpertQueryOut | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(part.slice(6)) as Record<string, unknown>
            if (msg.type === 'status') {
              setStatusMsg(String(msg.msg ?? ''))
            } else if (msg.type === 'token') {
              accumulated += String(msg.text ?? '')
              setStreamText(accumulated)
            } else if (msg.type === 'done') {
              finalResult = {
                expert_key: activeTab ?? '',
                expert_name: experts.find((e) => e.key === activeTab)?.name ?? '',
                expert_icon: experts.find((e) => e.key === activeTab)?.icon ?? '',
                answer: accumulated,
                sql: String(msg.sql ?? ''),
                columns: (msg.columns as string[]) ?? [],
                data: (msg.data as Record<string, unknown>[]) ?? [],
                chart_hint: (msg.chart_hint as Record<string, unknown> | null) ?? null,
              }
              setResult(finalResult)
              setStreamText('')
            } else if (msg.type === 'error') {
              setErr(String(msg.msg ?? 'Unknown error'))
            }
          } catch { /* ignore malformed chunk */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setErr(getApiErrorMessage(e, 'Query failed'))
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current)
      setLoading(false)
      setStatusMsg('')
      abortRef.current = null
    }
  }

  if (!experts.length) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {experts.map((e) => (
          <button
            key={e.key}
            type="button"
            title={e.description}
            onClick={() => { setActiveTab(e.key); setResult(null); setErr(null); setStreamText('') }}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition ${
              activeTab === e.key
                ? 'border-violet-500 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span className="text-base">{e.icon}</span>
            <span className="hidden sm:inline">{e.name}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 space-y-3">
        {active && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{active.description}</p>
        )}

        {/* Input row */}
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !loading) void ask() }}
            placeholder={active ? `Ask ${active.name}…` : 'Type your question…'}
            disabled={loading}
            className={inputFieldClass + ' flex-1 text-sm disabled:opacity-60'}
          />
          {loading ? (
            <button
              type="button"
              onClick={cancelQuery}
              className="shrink-0 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-300"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void ask()}
              disabled={question.trim().length < 3}
              className={primaryButtonClass + ' shrink-0 disabled:opacity-50'}
            >
              Ask
            </button>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-500/30 dark:bg-violet-950/30">
            <span className="flex gap-[3px]">
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 dark:bg-violet-400" />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:0.15s] dark:bg-violet-400" />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:0.3s] dark:bg-violet-400" />
            </span>
            <span className="text-sm text-violet-700 dark:text-violet-300">{statusMsg}</span>
            <span className="ml-auto text-xs tabular-nums text-violet-500 dark:text-violet-400">{elapsed}s</span>
          </div>
        )}

        {/* Streaming text (appears token by token) */}
        {streamText && (
          <div className="whitespace-pre-wrap rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-800 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-slate-100">
            {streamText}
            <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-sky-500 align-text-bottom" />
          </div>
        )}

        {err && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100">
            {err}
          </div>
        )}

        {result && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">{result.expert_icon}</span>
              <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">{result.expert_name}</span>
            </div>
            <div className="whitespace-pre-wrap rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-800 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-slate-100">
              {result.answer}
            </div>
            {result.data.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="max-h-[280px] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="sticky top-0 bg-slate-100 text-left text-[11px] font-semibold uppercase text-slate-600 dark:bg-slate-900/95 dark:text-slate-400">
                        {result.columns.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.map((row, i) => (
                        <tr key={i} className="border-t border-slate-100 dark:border-white/5">
                          {result.columns.map((c) => (
                            <td key={c} className="px-3 py-2 text-slate-800 dark:text-slate-200">
                              {formatCell(c, row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <details className="text-[11px] text-slate-500 dark:text-slate-400">
              <summary className="cursor-pointer select-none font-medium text-slate-700 dark:text-slate-300">SQL</summary>
              <pre className="mt-1.5 max-h-32 overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-2 text-[11px] dark:border-white/10 dark:bg-slate-950 dark:text-slate-300">
                {result.sql || '(chat response)'}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Employee view — minimal
// ---------------------------------------------------------------------------

function EmployeeAiView({ alerts }: { alerts: StockAlert[] }) {
  return (
    <>
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/40">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Limited AI Access</p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            With your employee account, you can query stock and sales data.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><StockAlertList alerts={alerts} /></div>
        <InlineChat role="employee" />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Strategy Board — full newspaper layout (admin + manager)
// ---------------------------------------------------------------------------

function StrategyBoard({
  role,
  insights,
  insightsLoading,
  insightsError,
  onReloadInsights,
  chartData,
  latestProphet,
  forecastBusy,
  onRunProphet,
  alerts,
  isDark,
  gridStroke,
  axisStroke,
}: {
  role: string
  insights: AiInsights | null
  insightsLoading: boolean
  insightsError: string | null
  onReloadInsights: () => void
  chartData: ForecastPoint[]
  latestProphet: ForecastResult | undefined
  forecastBusy: boolean
  onRunProphet: () => void
  alerts: StockAlert[]
  isDark: boolean
  gridStroke: string
  axisStroke: string
}) {
  const { t } = useTranslation()

  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('3m')
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)

  useEffect(() => {
    if (trendPeriod === '12m') {
      setTrendPoints(
        (insights?.context.monthly_revenue ?? []).map(m => ({
          label: m.month, revenue: m.revenue, orders: m.orders,
        })),
      )
      return
    }
    let cancelled = false
    const days = trendPeriod === '7d' ? 7 : trendPeriod === '30d' ? 30 : 90
    setTrendLoading(true)
    void api
      .get<DailySalesPoint[]>('/sales/analytics/daily', {
        params: { start_date: aiIsoDaysAgo(days), end_date: aiIsoToday() },
      })
      .then(r => {
        if (cancelled) return
        setTrendPoints(
          trendPeriod === '3m'
            ? aiAggregateWeekly(r.data)
            : r.data.map(d => ({ label: d.date.slice(5), revenue: d.revenue, orders: d.quantity })),
        )
      })
      .catch(() => { if (!cancelled) setTrendPoints([]) })
      .finally(() => { if (!cancelled) setTrendLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendPeriod])

  useEffect(() => {
    if (trendPeriod === '12m' && insights?.context.monthly_revenue?.length) {
      setTrendPoints(
        insights.context.monthly_revenue.map(m => ({
          label: m.month, revenue: m.revenue, orders: m.orders,
        })),
      )
    }
  }, [insights, trendPeriod])

  return (
    <div className="space-y-4">
      {/* ── MANŞET: AI Headline (full width) ── */}
      <div className={`flex items-center gap-3 rounded-2xl border p-3.5 ${
        role === 'admin'
          ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/30'
          : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/30'
      }`}>
        {role === 'admin'
          ? <Zap className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          : <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${role === 'admin' ? 'text-red-900 dark:text-red-100' : 'text-emerald-900 dark:text-emerald-100'}`}>
            {role === 'admin' ? t('ai.platformTitle') : t('ai.boardTitle')}
          </p>
          <p className={`text-xs mt-0.5 ${role === 'admin' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
            {role === 'admin' ? t('ai.platformSubtitle') : t('ai.boardSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={onReloadInsights}
          disabled={insightsLoading}
          className={secondaryButtonClass + ' shrink-0 disabled:opacity-50 flex items-center gap-1.5'}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${insightsLoading ? 'animate-spin' : ''}`} />
          {insightsLoading ? t('common.loading') : t('ai.refresh')}
        </button>
      </div>

      <InsightBanner loading={insightsLoading} error={insightsError} insights={insights} />

      {/* ── Insight cards — full width ── */}
      <Widget id="insights" title={t('ai.insights')} description="">
        <div className="p-3">
          <InsightCardSection loading={insightsLoading} highlights={insights?.highlights ?? []} />
        </div>
      </Widget>

      {/* ── Forecast (3/5) + Stock Alerts (2/5) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Widget id="forecast" title={t('ai.demandForecast')}>
            <div className="p-1">
              <ForecastChart
                data={chartData}
                lastTrainedAt={latestProphet?.created_at}
                busy={forecastBusy}
                isDark={isDark}
                onRefresh={onRunProphet}
              />
            </div>
          </Widget>
        </div>
        <div className="lg:col-span-2">
          <Widget id="stock-alerts" title={t('ai.stockAlerts')} description="">
            <div className="p-3">
              <StockAlertList alerts={alerts} />
            </div>
          </Widget>
        </div>
      </div>

      {/* ── Revenue Trend — full width ── */}
      <Widget
        id="monthly-trend"
        title="Revenue Trend"
        description=""
        defaultCollapsed={false}
        headerRight={
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-slate-800/50">
            {(['7d', '30d', '3m', '12m'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-label={p.toUpperCase()}
                onClick={() => setTrendPeriod(p)}
                className={`rounded-lg px-2.5 py-0.5 text-[11px] font-semibold transition ${
                  trendPeriod === p
                    ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-300'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        }
      >
        <div className="h-[260px] px-2 pb-3">
          {trendLoading || trendPoints.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              {trendLoading || insightsLoading ? 'Loading…' : 'No data'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendPoints} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="aiRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke={axisStroke} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="left"
                  stroke={axisStroke}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => new Intl.NumberFormat('en-GB', { notation: 'compact' }).format(Number(v))}
                />
                <YAxis yAxisId="right" orientation="right" stroke={axisStroke} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: isDark ? '#0f172a' : '#ffffff',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    borderRadius: 10,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
                  }}
                  labelStyle={{ color: isDark ? '#e2e8f0' : '#0f172a', fontWeight: 600 }}
                  formatter={(value: unknown, name: unknown) =>
                    name === 'Revenue'
                      ? [formatCurrency(Number(value)), 'Revenue']
                      : [formatNumber(Number(value)), 'Orders']
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#60a5fa"
                  strokeWidth={2.5}
                  fill="url(#aiRevenueGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: '#60a5fa' }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  name="Orders"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0, fill: '#22c55e' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Widget>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Platform AI Dashboard (admin only)
// ---------------------------------------------------------------------------

type PlatformOverview = {
  total_revenue_30d: number
  total_orders_30d: number
  active_tenants: number
  total_tenants: number
  churn_risk_count: number
  churn_risk_tenants: { id: number; name: string; last_sale_date: string | null }[]
  module_adoption: Record<string, { active: number; total: number }>
}

const MODULE_LABELS: Record<string, string> = {
  sales: 'Sales', stock: 'Inventory', hr: 'HR', finance: 'Finance',
  orders: 'Orders', suppliers: 'Suppliers', cashbook: 'Cashbook',
}

function PlatformAiDashboard() {
  const [overview,   setOverview]   = useState<PlatformOverview | null>(null)
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null)
  const [ovLoading,  setOvLoading]  = useState(true)
  const [aiLoading,  setAiLoading]  = useState(true)
  const [ovError,    setOvError]    = useState<string | null>(null)

  function loadOverview() {
    setOvLoading(true)
    api.get<PlatformOverview>('/admin/platform-overview')
      .then((r) => { setOverview(r.data); setOvError(null) })
      .catch(() => setOvError('Failed to load platform overview'))
      .finally(() => setOvLoading(false))
  }

  function loadAi(force = false) {
    setAiLoading(true)
    api.get<AiInsights>('/admin/ai-overview', {
      timeout: 90_000,
      params: force ? { force: true } : undefined,
    })
      .then((r) => setAiInsights(r.data))
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }

  useEffect(() => { loadOverview(); loadAi() }, [])

  const adoptionEntries = overview
    ? Object.entries(overview.module_adoption).sort((a, b) => b[1].active - a[1].active)
    : []

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      {/* Left: Platform dashboard */}
      <div className="xl:col-span-2 space-y-5">

        {/* Aggregate KPI cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: 'Revenue (30d)',
              value: overview ? `$${(overview.total_revenue_30d / 1000).toFixed(1)}k` : '—',
              icon: TrendingUp,
              color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
            },
            {
              label: 'Orders (30d)',
              value: overview ? String(overview.total_orders_30d) : '—',
              icon: Zap,
              color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20',
            },
            {
              label: 'Active Companies',
              value: overview ? String(overview.active_tenants) : '—',
              icon: Building2,
              color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20',
            },
            {
              label: 'Churn Risk',
              value: overview ? String(overview.churn_risk_count) : '—',
              icon: AlertTriangle,
              color: overview?.churn_risk_count
                ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/20'
                : 'text-slate-500 bg-slate-50 dark:bg-slate-800/40',
            },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {ovLoading ? <span className="inline-block h-4 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /> : s.value}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {ovError && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{ovError}</p>
        )}

        {/* Module adoption */}
        {overview && adoptionEntries.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <p className="mb-4 text-sm font-semibold text-slate-800 dark:text-white">Module Adoption</p>
            <div className="space-y-3">
              {adoptionEntries.map(([key, val]) => {
                const pct = val.total > 0 ? Math.round((val.active / val.total) * 100) : 0
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{MODULE_LABELS[key] ?? key}</span>
                      <span className="text-slate-400">{val.active}/{val.total} companies · {pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-2 rounded-full bg-violet-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Churn risk */}
        {overview && overview.churn_risk_count > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-500/30 dark:bg-rose-950/20">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                Churn Risk — {overview.churn_risk_count} {overview.churn_risk_count === 1 ? 'company' : 'companies'} with no sales in 30 days
              </p>
            </div>
            <div className="space-y-1.5">
              {overview.churn_risk_tenants.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 dark:bg-rose-900/20">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-sm font-medium text-rose-900 dark:text-rose-100">{t.name}</span>
                  </div>
                  <span className="text-xs text-rose-500 dark:text-rose-400">
                    {t.last_sale_date ? `Last sale: ${t.last_sale_date}` : 'No sales recorded'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platform AI insights */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800 dark:text-white">Platform AI Analysis</p>
            <button
              type="button"
              onClick={() => loadAi(true)}
              disabled={aiLoading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          {aiLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : aiInsights ? (
            <>
              {aiInsights.headline && (
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400 italic">{aiInsights.headline}</p>
              )}
              <InsightCardSection loading={false} highlights={aiInsights.highlights ?? []} />
            </>
          ) : (
            <p className="text-sm text-slate-400">AI analysis unavailable.</p>
          )}
        </div>
      </div>

      {/* Right: AI Chat */}
      <div className="h-[600px]">
        <InlineChat role="admin" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
export function AiAnalysisPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark    = theme === 'dark'
  const gridStroke = isDark ? '#334155' : '#cbd5e1'
  const axisStroke = isDark ? '#94a3b8' : '#64748b'
  const role = user?.role ?? 'employee'

  const [insights,        setInsights]        = useState<AiInsights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [insightsError,   setInsightsError]   = useState<string | null>(null)
  const [alerts,          setAlerts]          = useState<StockAlert[]>([])
  const [daily,           setDaily]           = useState<DailySalesPoint[]>([])
  const [forecasts,       setForecasts]       = useState<ForecastResult[]>([])
  const [forecastBusy,    setForecastBusy]    = useState(false)

  async function loadInsights(forceRefresh = false) {
    try {
      setInsightsLoading(true)
      setInsightsError(null)
      const { data } = await api.get<AiInsights>('/ai/insights', {
        timeout: 90_000,
        params: forceRefresh ? { force: true } : undefined,
      })
      setInsights(data)
    } catch (e: unknown) {
      setInsightsError(getApiErrorMessage(e, 'Failed to load AI summary'))
    } finally {
      setInsightsLoading(false)
    }
  }

  async function loadSupporting() {
    try {
      const [a, d, f] = await Promise.all([
        api.get<StockAlert[]>('/ai/stock-alerts'),
        api.get<DailySalesPoint[]>('/sales/analytics/daily'),
        api.get<ForecastResult[]>('/forecast/results'),
      ])
      setAlerts(a.data)
      setDaily(d.data)
      setForecasts(f.data)
    } catch { /* noop */ }
  }

  useEffect(() => {
    if (role === 'employee') {
      api.get<StockAlert[]>('/ai/stock-alerts').then((r) => setAlerts(r.data)).catch(() => {})
      setInsightsLoading(false)
      return
    }
    void loadInsights()
    void loadSupporting()
  }, [role])

  const latestProphet = useMemo(() => {
    const p = forecasts.filter((x) => x.model_name === 'prophet')
    return p.length ? p[0] : forecasts[0]
  }, [forecasts])

  const chartData = useMemo<ForecastPoint[]>(() => {
    const map = new Map<string, ForecastPoint>()
    for (const p of daily) {
      const key = iso(p.date)
      map.set(key, { date: key, actualQty: p.quantity })
    }
    const fDaily = latestProphet?.result_payload?.daily ?? []
    for (const p of fDaily as Record<string, unknown>[]) {
      const key = iso(String(p.date))
      const cur = map.get(key) ?? { date: key }
      cur.forecastQty = typeof p.quantity === 'number' ? p.quantity : typeof p.value === 'number' ? p.value : undefined
      cur.lower = typeof p.yhat_lower === 'number' ? p.yhat_lower : undefined
      cur.upper = typeof p.yhat_upper === 'number' ? p.yhat_upper : undefined
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [daily, latestProphet])

  async function runProphet() {
    setForecastBusy(true)
    try {
      await api.post('/forecast/prophet/run', { horizon_days: 30 })
      await loadSupporting()
    } catch (e: unknown) {
      alert(getApiErrorMessage(e, 'Failed to run forecast'))
    } finally {
      setForecastBusy(false)
    }
  }

  const pageTitle =
    role === 'admin'   ? t('ai.platformTitle') :
    role === 'manager' ? t('ai.boardTitle')  :
    t('nav.ai')

  const pageSubtitle =
    role === 'admin'   ? t('ai.platformSubtitle') :
    role === 'manager' ? t('ai.boardSubtitle') :
    t('dashboard.employeeSubtitle')

  return (
    <PageLayout title={pageTitle} subtitle={pageSubtitle}>
      {role === 'admin' ? (
        <PlatformAiDashboard />
      ) : role === 'employee' ? (
        <EmployeeAiView alerts={alerts} />
      ) : (
        <StrategyBoard
          role={role}
          insights={insights}
          insightsLoading={insightsLoading}
          insightsError={insightsError}
          onReloadInsights={() => void loadInsights(true)}
          chartData={chartData}
          latestProphet={latestProphet}
          forecastBusy={forecastBusy}
          onRunProphet={() => void runProphet()}
          alerts={alerts}
          isDark={isDark}
          gridStroke={gridStroke}
          axisStroke={axisStroke}
        />
      )}
    </PageLayout>
  )
}
