import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { type BriefingItem, fetchMorningBriefing } from "../../lib/api";

const STORAGE_KEY = "morning_briefing_dismissed";

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === getTodayKey();
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, getTodayKey());
  } catch { /* */ }
}

const PRIORITY_STYLE: Record<BriefingItem["priority"], { dot: string; item: string }> = {
  high:   { dot: "bg-rose-500",    item: "border-l-rose-400" },
  medium: { dot: "bg-amber-400",   item: "border-l-amber-400" },
  low:    { dot: "bg-emerald-400", item: "border-l-emerald-400" },
};

function BriefingRow({ item }: { item: BriefingItem }) {
  const s = PRIORITY_STYLE[item.priority];
  return (
    <div className={`flex items-start gap-3 border-l-2 pl-3 py-1 ${s.item}`}>
      <span className="mt-0.5 text-base leading-none">{item.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ui-text">{item.title}</p>
        <p className="mt-0.5 text-xs text-ui-muted">{item.body}</p>
      </div>
      {item.action_label && item.action_url && (
        <Link
          to={item.action_url}
          className="shrink-0 self-center rounded-lg bg-ui-surface-2 px-2.5 py-1 text-xs font-medium text-ui-text transition hover:bg-ui-accent/8 hover:text-ui-accent"
        >
          {item.action_label} →
        </Link>
      )}
    </div>
  );
}

export function MorningBriefing() {
  const { t } = useTranslation();
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissedState] = useState(isDismissed);

  useEffect(() => {
    if (dismissed) return;
    fetchMorningBriefing()
      .then((r) => setItems(r.items))
      .catch(() => { /* silently skip */ })
      .finally(() => setLoading(false));
  }, [dismissed]);

  if (dismissed) return null;

  const hour = new Date().getHours();
  const greeting  = hour < 12 ? t("briefing.morning")      : hour < 18 ? t("briefing.midday")      : t("briefing.evening");
  const cardTitle = hour < 12 ? t("briefing.morningTitle") : hour < 18 ? t("briefing.middayTitle") : t("briefing.eveningTitle");
  const cardIcon  = hour < 12 ? "🌅" : hour < 18 ? "☀️" : "🌙";

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50 to-indigo-50/60 shadow-sm dark:border-violet-500/20 dark:from-violet-950/20 dark:to-indigo-950/20">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{cardIcon}</span>
          <div>
            <p className="text-sm font-bold text-violet-900 dark:text-violet-100">{greeting} — {cardTitle}</p>
            <p className="text-[11px] text-violet-600/70 dark:text-violet-400/70 capitalize">{todayLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-lg p-1.5 text-violet-500 transition hover:bg-violet-100/70 dark:text-violet-400 dark:hover:bg-violet-900/30"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => { setDismissed(); setDismissedState(true); }}
            className="rounded-lg p-1.5 text-violet-400 transition hover:bg-violet-100/70 hover:text-violet-700 dark:hover:bg-violet-900/30"
            title="Dismiss for today"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="border-t border-violet-200/50 px-5 py-3 dark:border-violet-500/15">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-violet-100/50 dark:bg-violet-900/20" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-ui-muted">Failed to load briefing.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item, i) => (
                <BriefingRow key={i} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
