import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { getActiveLocale } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { NotificationBell } from "./NotificationBell";

// ---------------------------------------------------------------------------
// Mini interactive calendar with localStorage event pins
// ---------------------------------------------------------------------------

function getShortDays(locale: string): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" }).slice(0, 2)
  )
}
function calNotesKey(userId?: number, tenantId?: number | null): string {
  return `erp_cal_notes_${userId ?? 0}_${tenantId ?? 0}`
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function MiniCalendar({ onClose, userId, tenantId }: { onClose: () => void; userId?: number; tenantId?: number | null }) {
  const { t } = useTranslation()
  const locale = "en-GB"
  const today = new Date()
  const storageKey = calNotesKey(userId, tenantId)
  const [viewing, setViewing] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string,string> } catch { return {} }
  })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState("")

  const firstDay = new Date(viewing.year, viewing.month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(viewing.year, viewing.month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const isToday = (d: number) =>
    d === today.getDate() &&
    viewing.month === today.getMonth() &&
    viewing.year === today.getFullYear()

  function prevMonth() {
    setViewing(v => { const d = new Date(v.year, v.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })
  }
  function nextMonth() {
    setViewing(v => { const d = new Date(v.year, v.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })
  }

  function selectDay(d: number) {
    const key = dateKey(viewing.year, viewing.month, d)
    if (selectedKey === key) { setSelectedKey(null); return }
    setSelectedKey(key)
    setNoteInput(notes[key] ?? "")
  }

  function saveNote() {
    if (!selectedKey) return
    const updated = { ...notes }
    if (noteInput.trim()) {
      updated[selectedKey] = noteInput.trim()
    } else {
      delete updated[selectedKey]
    }
    setNotes(updated)
    try { localStorage.setItem(storageKey, JSON.stringify(updated)) } catch { /* */ }
    setSelectedKey(null)
  }

  function deleteNote(key: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    const updated = { ...notes }
    delete updated[key]
    setNotes(updated)
    try { localStorage.setItem(storageKey, JSON.stringify(updated)) } catch { /* */ }
    if (selectedKey === key) setSelectedKey(null)
  }

  const upcomingNotes = Object.entries(notes)
    .filter(([k]) => {
      const diff = (new Date(k + "T00:00:00").getTime() - today.setHours(0,0,0,0)) / 86400000
      return diff >= 0 && diff <= 30
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 5)

  return (
    <div
      className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-ui-border bg-ui-surface shadow-xl animate-scale-in dark:border-white/[0.08]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Month nav */}
      <div className="flex items-center justify-between border-b border-ui-border-sub px-4 py-3 dark:border-white/[0.06]">
        <button type="button" aria-label={t("calendar.prevMonth")} onClick={prevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-ui-text">
          {new Date(viewing.year, viewing.month, 1).toLocaleDateString(locale, { month: "long", year: "numeric" })}
        </span>
        <button type="button" aria-label={t("calendar.nextMonth")} onClick={nextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="p-3">
        <div className="mb-1 grid grid-cols-7 text-center">
          {getShortDays(locale).map((d, i) => (
            <div key={i} className="py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ui-muted">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />
            const key = dateKey(viewing.year, viewing.month, day)
            const hasNote = !!notes[key]
            const todayDay = isToday(day)
            const isSelected = selectedKey === key
            const isWeekend = (i % 7) >= 5

            return (
              <button
                key={key}
                type="button"
                onClick={() => selectDay(day)}
                title={hasNote ? notes[key] : undefined}
                className={`relative flex flex-col items-center rounded-lg py-0.5 transition
                  ${isSelected ? "bg-ui-accent/8 dark:bg-ui-accent/10" : "hover:bg-ui-surface-2"}`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium
                  ${todayDay
                    ? "bg-ui-accent text-white shadow-sm"
                    : isSelected
                    ? "text-ui-accent"
                    : isWeekend
                    ? "text-ui-muted"
                    : "text-ui-text"
                  }`}>
                  {day}
                </span>
                {hasNote && (
                  <span className={`mt-0.5 h-1 w-1 rounded-full ${todayDay ? "bg-white/80" : "bg-ui-accent/70"}`} />
                )}
                {!hasNote && <span className="mt-0.5 h-1 w-1" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Note editor */}
      {selectedKey && (
        <div className="border-t border-ui-border-sub bg-ui-surface-2 px-4 py-3 dark:border-white/[0.06]">
          <p className="mb-2 text-[11px] font-semibold text-ui-accent">
            {new Date(selectedKey + "T00:00:00").toLocaleDateString(locale, {
              weekday: "long", day: "numeric", month: "long",
            })}
          </p>
          <textarea
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveNote() }}
            placeholder={t("calendar.notePlaceholder")}
            rows={2}
            className="w-full resize-none rounded-lg border border-ui-border bg-ui-surface px-2.5 py-2 text-xs text-ui-text outline-none focus:border-ui-accent/50 focus:ring-1 focus:ring-ui-accent/20 placeholder:text-ui-muted"
            autoFocus
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setSelectedKey(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text">
              {t("common.cancel")}
            </button>
            {notes[selectedKey] && (
              <button type="button" onClick={() => deleteNote(selectedKey)}
                className="rounded-lg px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                {t("common.delete")}
              </button>
            )}
            <button type="button" onClick={saveNote}
              className="rounded-lg bg-ui-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
              {t("common.save")}
            </button>
          </div>
        </div>
      )}

      {/* Upcoming notes */}
      {upcomingNotes.length > 0 && !selectedKey && (
        <div className="border-t border-ui-border-sub px-4 py-3 dark:border-white/[0.06]">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ui-muted">
            {t("calendar.upcomingNotes")}
          </p>
          <div className="space-y-1.5">
            {upcomingNotes.map(([k, text]) => (
              <div key={k} className="group flex items-start gap-2 text-xs">
                <span className="mt-0.5 shrink-0 rounded-md bg-ui-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-ui-accent">
                  {new Date(k + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short" })}
                </span>
                <span className="flex-1 truncate text-ui-muted">{text}</span>
                <button
                  type="button"
                  onClick={(e) => deleteNote(k, e)}
                  className="invisible shrink-0 text-ui-muted hover:text-rose-500 group-hover:visible"
                  aria-label="Delete note"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-ui-border-sub px-4 py-2.5 dark:border-white/[0.06]">
        <button
          type="button"
          onClick={() => { setViewing({ year: today.getFullYear(), month: today.getMonth() }); onClose() }}
          className="w-full rounded-lg py-1.5 text-center text-xs font-medium text-ui-accent hover:bg-ui-accent/8 dark:hover:bg-ui-accent/10"
        >
          {t("calendar.today")} — {new Date().toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

export function AppTopbar({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()

  const [menuOpen, setMenuOpen] = useState(false)
  const [calOpen, setCalOpen] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement>(null)
  const calWrapRef  = useRef<HTMLDivElement>(null)

  const displayName = user?.full_name?.trim() || user?.email || "—"
  const roleLabel = user?.role === "manager"
    ? t("roleLabel.manager")
    : user?.role === "admin"
    ? t("roleLabel.admin")
    : t("roleLabel.employee")

  const dateLabel = useMemo(() => {
    return new Date().toLocaleDateString(getActiveLocale(), { weekday: "short", day: "numeric", month: "short" })
  }, [])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (calWrapRef.current  && !calWrapRef.current.contains(e.target as Node))  setCalOpen(false)
    }
    document.addEventListener("mousedown", onDocMouseDown)
    return () => document.removeEventListener("mousedown", onDocMouseDown)
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-ui-border-sub bg-ui-surface/90 px-4 shadow-topbar backdrop-blur-md dark:border-white/[0.06] md:px-8">
      {/* Cmd+K search trigger */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex min-w-0 max-w-xs flex-1 items-center gap-2 rounded-full border border-ui-border bg-ui-surface-2 px-3 py-2 text-sm text-ui-muted transition-all duration-200 hover:border-ui-accent/40 hover:bg-ui-surface hover:text-ui-text"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden truncate sm:inline">{t("topbar.searchPlaceholder")}</span>
        <span className="ml-auto hidden shrink-0 items-center gap-0.5 sm:flex">
          <kbd className="rounded border border-ui-border px-1.5 py-0.5 font-mono text-[10px] text-ui-muted">⌘K</kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">

        {/* Date chip → mini calendar popup */}
        <div ref={calWrapRef} className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setCalOpen((v) => !v)}
            title={t("topbar.openCalendar")}
            className={`inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-medium transition
              ${calOpen
                ? "border-ui-accent/50 bg-ui-accent/8 text-ui-accent dark:bg-ui-accent/12"
                : "border-ui-border bg-ui-surface-2 text-ui-muted hover:border-ui-accent/30 hover:text-ui-text"
              }`}
          >
            {dateLabel}
          </button>
          {calOpen && <MiniCalendar onClose={() => setCalOpen(false)} userId={user?.id} tenantId={user?.tenant_id} />}
        </div>

        <NotificationBell />

        {/* User dropdown */}
        <div ref={menuWrapRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-2xl border border-ui-border bg-ui-surface-2 py-1.5 pl-1.5 pr-2 transition-all duration-200 hover:bg-ui-surface hover:border-ui-border dark:border-white/[0.08] dark:hover:border-white/[0.14]"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-ui-accent to-indigo-700 text-xs font-bold text-white">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-ui-surface bg-emerald-500" />
            </div>
            <div className="hidden min-w-0 text-left sm:block">
              <div className="truncate text-sm font-semibold text-ui-text">{displayName}</div>
              <div className="text-[11px] text-ui-muted">{roleLabel}</div>
            </div>
            <ChevronDown className={`hidden h-4 w-4 text-ui-muted transition sm:block ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-ui-border bg-ui-surface py-1 shadow-xl animate-scale-in dark:border-white/[0.08]"
            >
              {user?.role === 'admin' ? (
                <button type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ui-text transition hover:bg-ui-surface-2"
                  onClick={() => { setMenuOpen(false); navigate("/settings") }}>
                  <Settings className="h-4 w-4 text-ui-muted" />
                  {t("topbar.platformSettings")}
                </button>
              ) : (
                <button type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ui-text transition hover:bg-ui-surface-2"
                  onClick={() => { setMenuOpen(false); navigate("/settings") }}>
                  <Settings className="h-4 w-4 text-ui-muted" />
                  {(user?.role === 'manager' || user?.role_kind === 'owner') ? t("nav.settings") : "My Account"}
                </button>
              )}
              <button type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ui-text transition hover:bg-ui-surface-2"
                onClick={() => { toggleTheme(); setMenuOpen(false) }}>
                {theme === "dark"
                  ? <Sun className="h-4 w-4 text-ui-muted" />
                  : <Moon className="h-4 w-4 text-ui-muted" />
                }
                {theme === "dark" ? t("topbar.lightTheme") : t("topbar.darkTheme")}
              </button>
              <div className="my-1 border-t border-ui-border-sub dark:border-white/[0.06]" />
              <button type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/30 dark:text-rose-400"
                onClick={() => { setMenuOpen(false); void logout() }}>
                <LogOut className="h-4 w-4" />
                {t("topbar.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
