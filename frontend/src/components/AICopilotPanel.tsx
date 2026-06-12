import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Database,
  Loader2,
  Package,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import {
  api,
  fetchCustomerHealth,
  formatCurrency,
  formatNumber,
  getApiErrorMessage,
  type CustomerHealthOut,
  type NlpQueryResponse,
} from "../lib/api";
import { getAccessToken } from "../lib/authSession";

// ─── Types ───────────────────────────────────────────────────────────────────

type CopilotMode = "closed" | "mini" | "open";

type ToolStatus = {
  name: string;
  msg: string;
  status: "running" | "done" | "error";
  preview?: string;
};

type DataTable = { columns: string[]; rows: Record<string, unknown>[] };

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; kind: "text"; text: string }
  | {
      id: string;
      role: "assistant";
      kind: "streaming";
      text: string;
      tools: ToolStatus[];
      statusMsg: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "ai-response";
      text: string;
      tools: ToolStatus[];
      dataTable?: DataTable;
    }
  | { id: string; role: "assistant"; kind: "result"; payload: NlpQueryResponse }
  | { id: string; role: "assistant"; kind: "error"; text: string };

// ─── Page context ─────────────────────────────────────────────────────────────

function usePageContext() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const key = `aiCopilot.pages.${pathname}`;
  const label = t(key);
  return label === key ? t("aiCopilot.general") : label;
}

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  "/stock": [
    "Which products need reordering?",
    "Show me low-stock items",
    "What is my total inventory value?",
  ],
  "/orders": [
    "What should I order this week?",
    "Reorder recommendations based on sales",
    "Show pending supply orders",
  ],
  "/finance": [
    "What is my profit margin this month?",
    "Show cash flow status",
    "Top 5 revenue sources",
  ],
  "/sales": [
    "Top 5 products by revenue",
    "Sales trend last 30 days",
    "Which customers bought most?",
  ],
  "/sales-orders": [
    "Show customer order summary",
    "Top customers this month",
    "Pending customer orders",
  ],
  "/customers": [
    "Which customers are at churn risk?",
    "Top customers by revenue",
    "Customer health overview",
  ],
  "/dashboard": [
    "Give me a business health overview",
    "What needs my attention today?",
    "This month vs last month",
  ],
};

const DEFAULT_SUGGESTIONS = [
  "Give me a business health overview",
  "Top 5 products by revenue",
  "Cash flow status",
  "What needs my attention today?",
];

// Role-based suggestions derived from user permissions
function getRoleSuggestions(permissions: string[]): string[] {
  const has = (p: string) => permissions.includes(p);

  // Finance Staff
  if (has("finance.read") && !has("sales.write") && !has("stock.adjust")) {
    return [
      "What is our cash flow this week?",
      "Show overdue customer invoices",
      "This month's expenses by category",
      "Cash balance vs last month",
    ];
  }
  // Warehouse Staff
  if (has("stock.adjust") && !has("sales.write") && !has("finance.read")) {
    return [
      "Which products need reordering?",
      "Show critically low stock items",
      "What supply orders are pending delivery?",
      "This week's stock movements",
    ];
  }
  // Cashier / Sales Representative (has sales.write but limited finance)
  if (has("sales.write") && !has("finance.read") && !has("stock.adjust")) {
    return [
      "What are today's top selling products?",
      "Which products are running low on shelf?",
      "Top customers this month",
      "Suggest an upsell for slow-moving items",
    ];
  }
  // Fallback for managers / admins / mixed permissions
  return DEFAULT_SUGGESTIONS;
}

// ─── Intro messages ───────────────────────────────────────────────────────────

function introMessage(t: TFunction, role: string | undefined, permissions: string[]): ChatMessage {
  const has = (p: string) => permissions.includes(p);

  let text: string;
  if (role === "admin") {
    text = t("aiCopilot.introAdmin");
  } else if (role === "manager") {
    text = t("aiCopilot.introManager");
  } else if (has("stock.adjust") && !has("sales.write")) {
    text = "Hi! I can help you check stock levels, find products that need reordering, and track supply orders. What would you like to know?";
  } else if (has("finance.read") && !has("sales.write")) {
    text = "Hi! I can help you with cash flow, expense summaries, overdue invoices, and financial reports. What would you like to know?";
  } else if (has("sales.write") && !has("finance.read")) {
    text = "Hi! I can help you with today's sales, top-selling products, customer insights, and stock availability. What would you like to know?";
  } else {
    text = t("aiCopilot.introManager");
  }

  return { id: "intro", role: "assistant", kind: "text", text };
}

// ─── Module recommendation helpers ────────────────────────────────────────────

const MODULE_RECOMMENDATION_REPLY = `Here are the recommended modules by business type:

🍽️ **Restaurant / Café / Bakery**
→ sales, inventory, finance, cashbook, suppliers, ai

🛒 **Retail / Market / Grocery**
→ sales, inventory, finance, cashbook, crm, suppliers, purchasing, ai

💼 **Service Business** (salon, consulting, repair, cleaning)
→ finance, crm, hr, cashbook, ai

🏭 **Manufacturing / Workshop / Factory**
→ inventory, purchasing, finance, suppliers, hr, ai

🏗️ **Construction / Contractor**
→ purchasing, finance, hr, suppliers, ai

**Tip:** Select your sector above and the default modules will be pre-selected automatically. You can fine-tune them in step 2.

Have a different business type? Describe it and I'll give a personalised recommendation!`;

function isModuleQuestion(text: string): boolean {
  return /which\s+module|what\s+module|module.*recommend|recommend.*module|module.*choose|choose.*module|module.*select|select.*module|module.*use|use.*module|set\s*up.*business|business.*setup|hangi\s*mod[üu]l|mod[üu]l.*se[çc]/i.test(text);
}

// ─── SSE fetch helper ─────────────────────────────────────────────────────────

interface SseEvent {
  type: string;
  [key: string]: unknown;
}

type HistoryEntry = { role: string; text: string };

async function* streamCopilot(
  text: string,
  context: string,
  signal: AbortSignal,
  history: HistoryEntry[],
): AsyncGenerator<SseEvent> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const impersonateId = (api.defaults.headers.common as Record<string, unknown>)[
    "X-Impersonate-Tenant-Id"
  ];
  if (impersonateId) headers["X-Impersonate-Tenant-Id"] = String(impersonateId);

  const resp = await fetch("/api/copilot/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ text, context, history }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const msg = await resp.text().catch(() => `HTTP ${resp.status}`);
    yield { type: "error", msg };
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        yield JSON.parse(line.slice(6)) as SseEvent;
      } catch {
        // ignore malformed event
      }
    }
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AICopilotPanel() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const pageContext = usePageContext();

  const [mode, setMode] = useState<CopilotMode>(() => {
    if (localStorage.getItem("erp_first_login") === "1") {
      localStorage.removeItem("erp_first_login");
      return "open";
    }
    return "closed";
  });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    introMessage(t, user?.role, user?.permissions ?? []),
  ]);
  const [busy, setBusy] = useState(false);
  const [riskList, setRiskList] = useState<CustomerHealthOut[]>([]);
  const [riskOpen, setRiskOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Send via new SSE co-pilot endpoint ────────────────────────────────────
  async function sendText(rawText: string) {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    setInput("");
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", text: trimmed }]);

    if (isModuleQuestion(trimmed)) {
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", kind: "text", text: MODULE_RECOMMENDATION_REPLY },
      ]);
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
      return;
    }

    setBusy(true);
    abortRef.current = new AbortController();
    const msgId = `a-${Date.now()}`;

    // Add streaming placeholder
    setMessages((m) => [
      ...m,
      { id: msgId, role: "assistant", kind: "streaming", text: "", tools: [], statusMsg: "Thinking…" },
    ]);
    queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));

    // Build conversation history (last 10 turns, user + completed assistant messages only)
    const history: HistoryEntry[] = messages
      .filter((m): m is (typeof m & { text: string }) => {
        if (m.role === "user") return true;
        if (m.role === "assistant" && "kind" in m) {
          return m.kind === "text" || m.kind === "ai-response";
        }
        return false;
      })
      .slice(-10)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: "text" in m ? m.text : "" }));

    try {
      for await (const event of streamCopilot(trimmed, pageContext, abortRef.current.signal, history)) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== msgId) return msg;

            switch (event.type) {
              case "status":
                if (msg.role === "assistant" && msg.kind === "streaming") {
                  return { ...msg, statusMsg: String(event.msg ?? "") };
                }
                return msg;

              case "tool_call":
                if (msg.role === "assistant" && msg.kind === "streaming") {
                  const tool: ToolStatus = {
                    name: String(event.tool ?? ""),
                    msg: String(event.msg ?? ""),
                    status: "running",
                  };
                  return { ...msg, tools: [...msg.tools, tool] };
                }
                return msg;

              case "tool_result":
                if (msg.role === "assistant" && msg.kind === "streaming") {
                  return {
                    ...msg,
                    tools: msg.tools.map((t) =>
                      t.name === event.tool
                        ? { ...t, status: "done" as const, preview: String(event.preview ?? "") }
                        : t,
                    ),
                  };
                }
                return msg;

              case "token":
                if (msg.role === "assistant" && msg.kind === "streaming") {
                  return { ...msg, text: msg.text + String(event.text ?? "") };
                }
                return msg;

              case "done": {
                if (msg.role === "assistant" && msg.kind === "streaming") {
                  const accData = event.data as Record<string, unknown> | undefined;
                  const qd = accData?.query_database as Record<string, unknown> | undefined;
                  const dataTable: DataTable | undefined =
                    Array.isArray(qd?.rows) && (qd.rows as unknown[]).length > 0
                      ? { columns: qd.columns as string[], rows: qd.rows as Record<string, unknown>[] }
                      : undefined;
                  return {
                    id: msg.id,
                    role: "assistant" as const,
                    kind: "ai-response" as const,
                    text: msg.text || "—",
                    tools: msg.tools,
                    dataTable,
                  };
                }
                return msg;
              }

              case "error":
                return {
                  id: msg.id,
                  role: "assistant",
                  kind: "error" as const,
                  text: String(event.msg ?? "Unknown error"),
                };

              default:
                return msg;
            }
          }),
        );
        queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId
              ? { id: msgId, role: "assistant", kind: "error" as const, text: getApiErrorMessage(e, t("aiCopilot.requestFailed")) }
              : msg,
          ),
        );
      }
    } finally {
      // If still streaming (e.g. network drop without done event), finalize
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === msgId && msg.role === "assistant" && msg.kind === "streaming") {
            return { id: msg.id, role: "assistant", kind: "ai-response" as const, text: msg.text || "—", tools: msg.tools };
          }
          return msg;
        }),
      );
      setBusy(false);
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  async function send() {
    await sendText(input);
  }

  // Reset chat when user changes
  useEffect(() => {
    setMessages([introMessage(t, user?.role, user?.permissions ?? [])]);
    setInput("");
    setBusy(false);
    setMode("closed");
    setRiskList([]);
  }, [user?.id]);

  // Fetch at-risk customers when panel opens
  useEffect(() => {
    if (mode !== "open" || user?.role === "admin") return;
    fetchCustomerHealth(10)
      .then((data) =>
        setRiskList(data.filter((c) => c.tier === "critical" || c.tier === "at_risk").slice(0, 10)),
      )
      .catch(() => {});
  }, [mode, user?.role]);

  const canSend = useMemo(() => input.trim().length >= 1 && !busy, [input, busy]);

  // Cmd+K → open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setMode("open");
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // External trigger (e.g. onboarding "Ask AI" button)
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ text?: string; autoSend?: boolean }>).detail;
      setMode("open");
      if (detail?.text) {
        if (detail.autoSend) {
          setTimeout(() => sendText(detail.text!), 120);
        } else {
          setInput(detail.text);
          setTimeout(() => inputRef.current?.focus(), 80);
        }
      } else {
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    }
    window.addEventListener("erp:open-copilot", onOpen);
    return () => window.removeEventListener("erp:open-copilot", onOpen);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus input when opening
  useEffect(() => {
    if (mode === "open") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  if (!user || !hasPermission("nlp.query.execute")) {
    return null;
  }

  // ── Closed mode ───────────────────────────────────────────────────────────
  if (mode === "closed") {
    return (
      <button
        type="button"
        onClick={() => setMode("open")}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-900/35 ring-2 ring-white/20 transition hover:from-indigo-500 hover:to-violet-500 dark:ring-slate-900/50"
        aria-label={t("aiCopilot.openAria")}
        title={t("aiCopilot.openTitle")}
      >
        <Sparkles className="h-6 w-6" aria-hidden />
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-400 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
          AI
        </span>
      </button>
    );
  }

  // ── Mini mode ─────────────────────────────────────────────────────────────
  if (mode === "mini") {
    return (
      <div className="fixed right-0 top-0 bottom-0 z-40 flex w-12 flex-col items-center gap-3 border-l border-slate-200/80 bg-white/95 py-4 shadow-lg backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-950/95">
        <button
          type="button"
          onClick={() => setMode("open")}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-900/25 transition hover:from-indigo-500 hover:to-violet-500"
          aria-label={t("aiCopilot.openAria")}
          title={t("aiCopilot.openShort")}
        >
          <Sparkles className="h-5 w-5" />
        </button>
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
          AI
        </div>
        <div className="mt-2 flex-1 flex items-center">
          <span className="rotate-180 text-[10px] font-medium text-slate-400 [writing-mode:vertical-rl] dark:text-slate-500">
            {pageContext}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMode("closed")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          aria-label={t("aiCopilot.closeTitle")}
          title={t("aiCopilot.closeTitle")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── Open mode ─────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-40 flex w-80 flex-col border-l border-slate-200/80 bg-white/95 shadow-2xl shadow-indigo-950/10 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-950/95"
      role="complementary"
      aria-label={t("aiCopilot.panelAria")}
    >
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <Bot className="h-4.5 w-4.5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-sm font-semibold tracking-tight">
              <Sparkles className="h-3 w-3 shrink-0 text-amber-200" aria-hidden />
              AI Co-pilot
            </div>
            <p className="truncate text-[10px] font-medium text-indigo-100/80">
              {pageContext} • Ctrl+K
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setMode("mini")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
            aria-label={t("aiCopilot.miniAria")}
            title={t("aiCopilot.minimizeTitle")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMode("closed")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
            aria-label={t("aiCopilot.closeTitle")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Role badge */}
      <div className="shrink-0 flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/50">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            user.role === "admin"
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              : user.role === "manager"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {user.role === "admin"
            ? t("aiCopilot.roleAdmin")
            : user.role === "manager"
              ? t("aiCopilot.roleManager")
              : t("aiCopilot.roleStaff")}
        </span>
        <button
          type="button"
          onClick={() => setMessages([introMessage(t, user.role, user.permissions ?? [])])}

          className="ml-auto text-[10px] text-slate-400 transition hover:text-rose-500 dark:hover:text-rose-400"
          title={t("aiCopilot.clearTitle")}
        >
          {t("aiCopilot.clear")}
        </button>
      </div>

      {/* Churn Risk List */}
      {user.role !== "admin" && riskList.length > 0 && (
        <div className="shrink-0 border-b border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setRiskOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-2 text-left"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {t("aiCopilot.churnTitle", { count: riskList.length })}
            </span>
            {riskOpen ? (
              <ChevronUp className="h-3 w-3 text-slate-400" />
            ) : (
              <ChevronDown className="h-3 w-3 text-slate-400" />
            )}
          </button>
          {riskOpen && (
            <ul className="max-h-44 overflow-y-auto px-3 pb-2">
              {riskList.map((c) => {
                const tierColor =
                  c.tier === "critical"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300";
                return (
                  <li
                    key={c.customer_id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${tierColor}`}
                    >
                      {c.score}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                      {c.customer_name}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                      {c.last_order_days == null
                        ? t("aiCopilot.noOrder")
                        : t("aiCopilot.daysAgo", { days: c.last_order_days })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {!busy && <SuggestedQuestions onSelect={(q) => void sendText(q)} />}

      {/* Input */}
      <div className="shrink-0 border-t border-slate-200/90 bg-white/95 p-3 dark:border-slate-700/80 dark:bg-slate-900/95">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/90 p-1.5 pl-3 shadow-inner dark:border-slate-600 dark:bg-slate-800/80">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && canSend) void send();
            }}
            placeholder={t("aiCopilot.inputPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void send()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/25 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t("aiCopilot.sendAria")}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-slate-400 dark:text-slate-500">
          {t("aiCopilot.disclaimer")}
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-md shadow-indigo-900/20">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.kind === "streaming") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[95%] space-y-2 rounded-2xl rounded-bl-md border border-slate-200/90 bg-white/80 px-3.5 py-3 text-sm shadow-sm dark:border-slate-600/50 dark:bg-slate-800/50">
          {/* Tool calls */}
          {message.tools.length > 0 && (
            <div className="space-y-1.5">
              {message.tools.map((tool, i) => (
                <ToolCallRow key={i} tool={tool} />
              ))}
            </div>
          )}

          {/* Status */}
          {message.text === "" && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
              <span>{message.statusMsg}</span>
            </div>
          )}

          {/* Accumulated text */}
          {message.text && (
            <div className="whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-100">
              {message.text}
              <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-indigo-500" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (message.kind === "text") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200/90 bg-white/80 px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm dark:border-slate-600/50 dark:bg-slate-800/50 dark:text-slate-100">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.kind === "ai-response") {
    return <AIResponseBubble message={message} />;
  }

  if (message.kind === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-rose-200/80 bg-rose-50/95 px-3.5 py-2.5 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/50 dark:text-rose-100">
          {t("aiCopilot.errorPrefix")}: {message.text}
        </div>
      </div>
    );
  }

  return <ResultBubble payload={message.payload} />;
}

function toolIcon(toolName: string) {
  const n = toolName.toLowerCase();
  if (n.includes("stock") || n.includes("inventory") || n.includes("reorder")) return Package;
  if (n.includes("revenue") || n.includes("sales") || n.includes("forecast") || n.includes("finance")) return TrendingUp;
  if (n.includes("customer") || n.includes("health") || n.includes("churn")) return Users;
  if (n.includes("chart") || n.includes("trend") || n.includes("analysis")) return BarChart3;
  if (n.includes("query") || n.includes("database") || n.includes("search")) return Database;
  return Zap;
}

function ToolCallRow({ tool }: { tool: ToolStatus }) {
  const Icon = toolIcon(tool.name);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 dark:border-slate-700/60 dark:bg-slate-900/50">
      {tool.status === "running" ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-indigo-500" />
      ) : tool.status === "done" ? (
        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
      ) : (
        <AlertTriangle className="h-3 w-3 shrink-0 text-rose-500" />
      )}
      <Icon className="h-3 w-3 shrink-0 text-indigo-400 dark:text-indigo-500" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600 dark:text-slate-400">
        {tool.status === "done" && tool.preview ? tool.preview : tool.msg}
      </span>
    </div>
  );
}

// ─── AI Response Bubble ───────────────────────────────────────────────────────

type AiResponseMsg = Extract<ChatMessage, { kind: "ai-response" }>;

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 leading-relaxed text-slate-800 dark:text-slate-100">
      {lines.map((line, i) => {
        if (/^#{1,3}\s/.test(line)) {
          const content = line.replace(/^#{1,3}\s/, "");
          return (
            <p key={i} className="font-semibold text-slate-900 dark:text-slate-50">
              {renderInline(content)}
            </p>
          );
        }
        if (/^[-•*]\s/.test(line)) {
          const content = line.replace(/^[-•*]\s/, "");
          return (
            <div key={i} className="flex gap-1.5">
              <span className="mt-0.5 shrink-0 text-indigo-400 dark:text-indigo-500">•</span>
              <span>{renderInline(content)}</span>
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part))
      return <strong key={i} className="font-semibold text-slate-900 dark:text-slate-50">{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part))
      return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function AIResponseBubble({ message }: { message: AiResponseMsg }) {
  const { t } = useTranslation();
  const { columns, rows } = message.dataTable ?? { columns: [], rows: [] };
  const hasTable = columns.length > 0 && rows.length > 0;

  return (
    <div className="flex justify-start">
      <div className="max-w-[98%] space-y-2.5 rounded-2xl rounded-bl-md border border-slate-200/90 bg-white/80 px-3.5 py-3 text-sm shadow-sm dark:border-slate-600/50 dark:bg-slate-800/50">
        {/* Persistent tool status rows */}
        {message.tools.length > 0 && (
          <div className="space-y-1.5 border-b border-slate-100 pb-2.5 dark:border-slate-700/60">
            {message.tools.map((tool, i) => (
              <ToolCallRow key={i} tool={tool} />
            ))}
          </div>
        )}

        {/* AI text */}
        {message.text && message.text !== "—" && (
          <SimpleMarkdown text={message.text} />
        )}

        {/* Data table */}
        {hasTable && (
          <div className="overflow-hidden rounded-xl border border-indigo-100/80 bg-slate-50/90 dark:border-indigo-500/20 dark:bg-slate-900/60">
            <div className="flex items-center gap-1.5 border-b border-slate-200/60 bg-indigo-50/60 px-2.5 py-1.5 dark:border-slate-700/50 dark:bg-indigo-950/30">
              <Database className="h-3 w-3 text-indigo-500 dark:text-indigo-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Query Results — {rows.length} row{rows.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="max-h-[220px] overflow-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="sticky top-0 bg-slate-100/95 text-left text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/95 dark:text-slate-400">
                    {columns.map((c) => (
                      <th key={c} className="px-2.5 py-1.5 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 30).map((row, i) => (
                    <tr
                      key={i}
                      className={`border-t border-slate-200/70 dark:border-slate-700/60 ${i % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-800/30"}`}
                    >
                      {columns.map((c) => (
                        <td key={c} className="px-2.5 py-1.5 text-slate-700 dark:text-slate-200">
                          {formatCell(c, row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 30 && (
              <div className="bg-slate-100/80 px-2.5 py-1 text-[10px] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                {t("aiCopilot.firstRows", { total: rows.length })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Suggested Questions ──────────────────────────────────────────────────────

function SuggestedQuestions({ onSelect }: { onSelect: (q: string) => void }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];

  // Page-specific suggestions take priority; fall back to role-based ones
  const suggestions = PAGE_SUGGESTIONS[pathname] ?? getRoleSuggestions(permissions);

  return (
    <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Quick questions
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {suggestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSelect(q)}
            className="shrink-0 rounded-full border border-indigo-200/70 bg-white px-3 py-1 text-[11px] font-medium text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultBubble({ payload }: { payload: NlpQueryResponse }) {
  const { t } = useTranslation();
  const { answer, columns, data } = payload;

  return (
    <div className="flex justify-start">
      <div className="max-w-[98%] space-y-2 rounded-2xl rounded-bl-md border border-slate-200/90 bg-white/80 px-3 py-3 text-sm text-slate-800 shadow-sm dark:border-slate-600/50 dark:bg-slate-800/50 dark:text-slate-100">
        {answer && (
          <div className="whitespace-pre-wrap text-slate-900 dark:text-slate-50">{answer}</div>
        )}
        {data.length > 0 && columns.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/90 dark:border-slate-700/60 dark:bg-slate-900/60">
            <div className="max-h-[200px] overflow-auto">
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
                    <tr key={i} className="border-t border-slate-200/70 dark:border-slate-700/60">
                      {columns.map((c) => (
                        <td key={c} className="px-2 py-1.5 text-slate-700 dark:text-slate-200">
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
                {t("aiCopilot.firstRows", { total: data.length })}
              </div>
            )}
          </div>
        )}
        {data.length > 0 && (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {t("aiCopilot.rowCount", { count: data.length })}
          </div>
        )}
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
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return String(value);
}
