import { useMemo, useRef, useState } from 'react'

import { useAuth } from '../context/AuthContext'
import {
  api,
  formatCurrency,
  formatNumber,
  getApiErrorMessage,
  type NlpQueryResponse,
} from '../lib/api'

type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; kind: 'text'; text: string }
  | { id: string; role: 'assistant'; kind: 'result'; payload: NlpQueryResponse }
  | { id: string; role: 'assistant'; kind: 'error'; text: string }

const INTRO_MESSAGE: ChatMessage = {
  id: 'intro',
  role: 'assistant',
  kind: 'text',
  text:
    'Merhaba! Sana doğal dilde soru sorabilirsin. Örnek:\n' +
    '• "En yüksek ciro getiren 5 ürünü listele"\n' +
    '• "Stoğu eşik seviyenin altında olan ürünler neler?"\n' +
    '• "Son 30 günde en çok satış yapan 3 müşteri"',
}

export function NlpAssistantBubble() {
  const { user, hasPermission } = useAuth()

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([INTRO_MESSAGE])
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const canSend = useMemo(() => input.trim().length >= 3 && !busy, [input, busy])

  if (!user || !hasPermission('nlp.query.execute')) {
    return null
  }

  async function send() {
    const text = input.trim()
    if (!text) return
    setInput('')
    const userId = `u-${Date.now()}`
    setMessages((m) => [...m, { id: userId, role: 'user', text }])
    setBusy(true)

    try {
      const res = await api.post<NlpQueryResponse>('/nlp/query', { text })
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: 'assistant', kind: 'result', payload: res.data },
      ])
    } catch (e: any) {
      const detail = getApiErrorMessage(e, 'İstek başarısız')
      setMessages((m) => [
        ...m,
        { id: `e-${Date.now()}`, role: 'assistant', kind: 'error', text: detail },
      ])
    } finally {
      setBusy(false)
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 flex h-[540px] w-[440px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">AI Asistan</div>
              <div className="text-[11px] text-slate-500">Doğal dilde soru sor</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-slate-900 hover:text-slate-50"
            >
              Kapat
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-auto px-4 py-4 text-sm">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {busy && (
              <div className="mr-8 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-slate-400">
                Yanıt hazırlanıyor…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-slate-800 p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSend) void send()
                }}
                placeholder="Soru yaz…"
                className="flex-1 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
              />
              <button
                disabled={!canSend}
                onClick={() => void send()}
                className="rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                Sor
              </button>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              Yanıtlar Gemini ile üretilir. SQL otomatik oluşturulur ve sadece okuma amaçlıdır.
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-950/80 text-slate-100 shadow-lg backdrop-blur hover:bg-slate-900"
        aria-label="Open NLP assistant"
        title="AI Asistan"
      >
        <span className="text-lg font-semibold">AI</span>
      </button>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="ml-8 whitespace-pre-wrap rounded-xl border border-sky-500/30 bg-sky-500/15 px-3 py-2 text-slate-100">
        {message.text}
      </div>
    )
  }

  if (message.kind === 'text') {
    return (
      <div className="mr-8 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-slate-200">
        {message.text}
      </div>
    )
  }

  if (message.kind === 'error') {
    return (
      <div className="mr-8 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-200">
        Hata: {message.text}
      </div>
    )
  }

  return <ResultBubble payload={message.payload} />
}

function ResultBubble({ payload }: { payload: NlpQueryResponse }) {
  const [showSql, setShowSql] = useState(false)
  const { answer, columns, data, sql } = payload

  return (
    <div className="mr-8 space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-slate-200">
      <div className="whitespace-pre-wrap text-slate-100">{answer}</div>

      {data.length > 0 && columns.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/50">
          <div className="max-h-[180px] overflow-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="sticky top-0 bg-slate-900/90 text-left text-[10px] uppercase tracking-wide text-slate-400">
                  {columns.map((c) => (
                    <th key={c} className="px-2 py-1.5 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 25).map((row, i) => (
                  <tr key={i} className="border-t border-slate-800/60">
                    {columns.map((c) => (
                      <td key={c} className="px-2 py-1.5 text-slate-200">
                        {formatCell(c, row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.length > 25 && (
            <div className="bg-slate-900/60 px-2 py-1 text-[10px] text-slate-500">
              İlk 25 satır gösteriliyor (toplam {data.length}).
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{data.length} satır · {columns.length} kolon</span>
        <button
          onClick={() => setShowSql((v) => !v)}
          className="rounded-md border border-slate-800 px-2 py-1 hover:bg-slate-900"
        >
          {showSql ? 'SQL gizle' : 'SQL göster'}
        </button>
      </div>
      {showSql && (
        <pre className="max-h-40 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-300">
          {sql}
        </pre>
      )}
    </div>
  )
}

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  const lk = key.toLowerCase()
  if (
    lk.includes('ciro') ||
    lk.includes('tutar') ||
    lk.includes('amount') ||
    lk.includes('revenue') ||
    lk.includes('price') ||
    lk.includes('cost')
  ) {
    const n = Number(value)
    if (Number.isFinite(n)) return formatCurrency(n)
  }
  if (typeof value === 'number') {
    return formatNumber(value)
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }
  return String(value)
}
