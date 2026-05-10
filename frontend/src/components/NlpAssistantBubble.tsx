import { Bot, Send, Sparkles, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useAuth } from "../context/AuthContext";
import {
  api,
  formatCurrency,
  formatNumber,
  getApiErrorMessage,
  type NlpQueryResponse,
} from "../lib/api";

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; kind: "text"; text: string }
  | { id: string; role: "assistant"; kind: "result"; payload: NlpQueryResponse }
  | { id: string; role: "assistant"; kind: "error"; text: string };

const INTRO_MESSAGE: ChatMessage = {
  id: "intro",
  role: "assistant",
  kind: "text",
  text:
    "Merhaba! Sana doğal dilde soru sorabilirsin. Örnek:\n" +
    '• "En yüksek ciro getiren 5 ürünü listele"\n' +
    '• "Stoğu eşik seviyenin altında olan ürünler neler?"\n' +
    '• "Son 30 günde en çok satış yapan 3 müşteri"',
};

export function NlpAssistantBubble() {
  const { user, hasPermission } = useAuth();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([INTRO_MESSAGE]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(
    () => input.trim().length >= 1 && !busy,
    [input, busy],
  );

  if (!user || !hasPermission("nlp.query.execute")) {
    return null;
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const userId = `u-${Date.now()}`;
    setMessages((m) => [...m, { id: userId, role: "user", text }]);
    setBusy(true);

    try {
      const res = await api.post<NlpQueryResponse>(
        "/chat",
        { text },
        { timeout: 120_000 },
      );
      const p = res.data;
      const hasTable =
        Array.isArray(p.data) &&
        p.data.length > 0 &&
        Array.isArray(p.columns) &&
        p.columns.length > 0;
      setMessages((m) => [
        ...m,
        hasTable
          ? {
              id: `a-${Date.now()}`,
              role: "assistant",
              kind: "result",
              payload: p,
            }
          : {
              id: `a-${Date.now()}`,
              role: "assistant",
              kind: "text",
              text: p.answer || "—",
            },
      ]);
    } catch (e: unknown) {
      const detail = getApiErrorMessage(e, "İstek başarısız");
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          kind: "error",
          text: detail,
        },
      ]);
    } finally {
      setBusy(false);
      queueMicrotask(() =>
        bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
      );
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          className="mb-1 flex h-[min(540px,calc(100vh-8rem))] w-[min(440px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-2xl shadow-indigo-950/15 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/90 dark:shadow-black/50"
          role="dialog"
          aria-label="AI Asistan"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 px-4 py-3.5 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <Bot className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                  <Sparkles
                    className="h-3.5 w-3.5 shrink-0 text-amber-200"
                    aria-hidden
                  />
                  AI Asistan
                </div>
                <p className="truncate text-[11px] font-medium text-indigo-100/90">
                  Doğal dilde soru sor
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/90 transition hover:bg-white/15 hover:text-white"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50/80 px-4 py-4 dark:bg-slate-950/40">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {busy ? <TypingIndicator /> : null}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 border-t border-slate-200/90 bg-white/95 p-3 dark:border-slate-700/80 dark:bg-slate-900/95">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/90 p-1.5 pl-3 shadow-inner dark:border-slate-600 dark:bg-slate-800/80">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && canSend) void send();
                }}
                placeholder="Sorunuzu yazın…"
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                disabled={!canSend}
                onClick={() => void send()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/25 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Gönder"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-500 dark:text-slate-400">
              Yanıtlar yapay zeka ile üretilir; gösterilen metin ve tablolar
              kullanıcıya yöneliktir.
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-900/35 ring-2 ring-white/20 transition hover:from-indigo-500 hover:to-violet-500 dark:ring-slate-900/50"
        aria-label={open ? "AI asistanı kapat" : "AI asistanını aç"}
        title="AI Asistan"
      >
        <Sparkles className="h-6 w-6" aria-hidden />
      </button>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div
      className="flex justify-start"
      role="status"
      aria-live="polite"
      aria-label="Asistan yazıyor"
    >
      <div className="flex max-w-[90%] items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200/90 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md dark:border-slate-600/50 dark:bg-slate-800/50">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Yazıyor
        </span>
        <span className="flex items-center gap-1" aria-hidden>
          <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:-0.2s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:-0.1s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500" />
        </span>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-md shadow-indigo-900/20">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.kind === "text") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200/90 bg-white/80 px-4 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm backdrop-blur-md dark:border-slate-600/50 dark:bg-slate-800/50 dark:text-slate-100">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.kind === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-rose-200/80 bg-rose-50/95 px-4 py-2.5 text-sm text-rose-900 backdrop-blur-md dark:border-rose-500/30 dark:bg-rose-950/50 dark:text-rose-100">
          Hata: {message.text}
        </div>
      </div>
    );
  }

  return <ResultBubble payload={message.payload} />;
}

function ResultBubble({ payload }: { payload: NlpQueryResponse }) {
  const { answer, columns, data } = payload;

  return (
    <div className="flex justify-start">
      <div className="max-w-[94%] space-y-2 rounded-2xl rounded-bl-md border border-slate-200/90 bg-white/80 px-3 py-3 text-sm text-slate-800 shadow-sm backdrop-blur-md dark:border-slate-600/50 dark:bg-slate-800/50 dark:text-slate-100">
        <div className="whitespace-pre-wrap text-slate-900 dark:text-slate-50">
          {answer}
        </div>

        {data.length > 0 && columns.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/90 dark:border-slate-700/60 dark:bg-slate-900/60">
            <div className="max-h-[180px] overflow-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="sticky top-0 bg-slate-100/95 text-left text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/95 dark:text-slate-400">
                    {columns.map((c) => (
                      <th key={c} className="px-2 py-1.5 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 25).map((row, i) => (
                    <tr
                      key={i}
                      className="border-t border-slate-200/70 dark:border-slate-700/60"
                    >
                      {columns.map((c) => (
                        <td
                          key={c}
                          className="px-2 py-1.5 text-slate-700 dark:text-slate-200"
                        >
                          {formatCell(c, row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.length > 25 && (
              <div className="bg-slate-100/80 px-2 py-1 text-[10px] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                İlk 25 satır gösteriliyor (toplam {data.length}).
              </div>
            )}
          </div>
        )}

        {data.length > 0 ? (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {data.length} veri satırı
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  const lk = key.toLowerCase();
  if (
    lk.includes("ciro") ||
    lk.includes("tutar") ||
    lk.includes("amount") ||
    lk.includes("revenue") ||
    lk.includes("price") ||
    lk.includes("cost")
  ) {
    const n = Number(value);
    if (Number.isFinite(n)) return formatCurrency(n);
  }
  if (typeof value === "number") {
    return formatNumber(value);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return String(value);
}
