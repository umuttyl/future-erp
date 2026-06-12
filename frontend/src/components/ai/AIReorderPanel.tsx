import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Clock, Loader2, Package, RefreshCw, Sparkles } from "lucide-react";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchReorderRecommendations, formatNumber, postInventoryAutoDraft, type ReorderRecommendation, type ReorderRecommendationsOut } from "../../lib/api";

interface Props {
  /** Show the panel collapsed initially (default: false for <3 critical items) */
  defaultCollapsed?: boolean;
  /** Increment this key to force a refresh (e.g. after receiving a supply order) */
  refreshKey?: number;
}

export function AIReorderPanel({ defaultCollapsed, refreshKey }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<ReorderRecommendationsOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchReorderRecommendations(15);
      setData(result);
      if (result.critical_count === 0 && result.warning_count === 0) {
        setCollapsed(true);
      }
    } catch {
      setError("Could not load reorder recommendations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-violet-200/60 bg-violet-50/60 px-4 py-3 text-sm text-violet-700 dark:border-violet-500/20 dark:bg-violet-950/30 dark:text-violet-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Analyzing stock levels and sales velocity…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span>Could not load reorder recommendations. <button type="button" onClick={() => void load()} className="underline hover:no-underline">Retry</button></span>
      </div>
    );
  }

  if (!data) return null;

  if (data.total_needing_attention === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
        <Sparkles className="h-4 w-4 text-emerald-500" />
        <span className="font-medium">All stock levels are healthy</span>
        <span className="text-emerald-600 dark:text-emerald-400">— no reorders needed right now.</span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-950/20">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
            <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              AI Reorder Recommendations
            </span>
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
              {data.critical_count > 0 && (
                <span className="mr-1.5 rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                  {data.critical_count} critical
                </span>
              )}
              {data.warning_count > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  {data.warning_count} warning
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void load(); }}
            className="rounded-lg p-1 text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {collapsed
            ? <ChevronDown className="h-4 w-4 text-amber-500" />
            : <ChevronUp className="h-4 w-4 text-amber-500" />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-amber-200/60 dark:border-amber-500/20">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-amber-200/60 bg-amber-100/60 dark:border-amber-500/20 dark:bg-amber-900/20">
                  <th className="px-4 py-2 text-left font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">SKU / Product</th>
                  <th className="px-4 py-2 text-right font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Stock</th>
                  <th className="px-4 py-2 text-right font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Days Left</th>
                  <th className="px-4 py-2 text-right font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Deficit</th>
                  <th className="px-4 py-2 text-right font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Suggest Order</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.recommendations.map((r, i) => (
                  <ReorderRow key={i} item={r} onOrderCreated={load} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-amber-200/60 px-4 py-2 text-[11px] text-amber-600 dark:border-amber-500/20 dark:text-amber-400">
            <span>Based on last {data.analysis_period_days} days of sales velocity</span>
            <button
              type="button"
              onClick={() => navigate("/stock")}
              className="font-semibold hover:underline"
            >
              View all stock →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReorderRow({ item, onOrderCreated }: { item: ReorderRecommendation; onOrderCreated: () => void }) {
  const isCritical = item.urgency === "critical";
  const [ordering, setOrdering] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [orderErr, setOrderErr] = useState<string | null>(null);

  async function handleOrder() {
    setOrdering(true);
    setOrderErr(null);
    try {
      await postInventoryAutoDraft(item.product_id, { isAiOverride: true });
      setOrdered(true);
      onOrderCreated();
      setTimeout(() => setOrdered(false), 4000);
    } catch {
      setOrderErr("Failed to create order.");
    } finally {
      setOrdering(false);
    }
  }

  return (
    <tr className="border-b border-amber-100/60 hover:bg-amber-50/60 dark:border-amber-500/10 dark:hover:bg-amber-900/10">
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isCritical ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>
            {isCritical ? "!" : "↓"}
          </span>
          <div>
            <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{item.sku}</span>
            <div className="font-medium text-slate-800 dark:text-slate-200">{item.name}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-2 text-right">
        <span className={`font-semibold tabular-nums ${isCritical ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300"}`}>
          {formatNumber(item.current_stock)}
        </span>
        {item.reorder_level > 0 && (
          <span className="ml-1 text-[10px] text-slate-400">/ {formatNumber(item.reorder_level)}</span>
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
        {item.days_remaining != null ? (
          <span className={item.days_remaining < 7 ? "font-semibold text-rose-600 dark:text-rose-400" : ""}>
            {item.days_remaining.toFixed(0)}d
          </span>
        ) : <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {item.deficit > 0
          ? <span className="font-semibold text-rose-600 dark:text-rose-400">-{formatNumber(item.deficit)}</span>
          : <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-2 text-right">
        <span className="font-semibold text-violet-700 dark:text-violet-300">
          +{formatNumber(item.suggested_order_qty)}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        {orderErr && <span className="mr-1 text-[10px] text-rose-500">{orderErr}</span>}
        {item.has_pending_order ? (
          <span className="flex items-center justify-end gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            <Clock className="h-3 w-3" /> Order pending
          </span>
        ) : ordered ? (
          <span className="flex items-center justify-end gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-3 w-3" /> Draft created
          </span>
        ) : (
          <button
            type="button"
            disabled={ordering}
            onClick={() => void handleOrder()}
            className="flex items-center gap-1 rounded-lg bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-200 disabled:opacity-50 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50"
          >
            {ordering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Package className="h-3 w-3" />}
            Order
          </button>
        )}
      </td>
    </tr>
  );
}
