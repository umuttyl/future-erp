import type { PropsWithChildren } from 'react'
import { Moon, Sparkles, Sun } from 'lucide-react'

import { useTheme } from '../../context/ThemeContext'

const fieldCore =
  'w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition ' +
  'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/60 ' +
  'dark:border-slate-600/80 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-500 ' +
  'dark:focus:border-purple-400/40 dark:focus:ring-purple-500/50'

export const authInputClass = 'mt-1.5 ' + fieldCore

/** `<select>` — `fieldCore` + ok alanı; sarmalayıcıya `relative mt-1.5` ve sağda Chevron ikonu ekleyin. */
export const authSelectFieldClass = fieldCore + ' cursor-pointer appearance-none pr-10'

export const authPrimaryButtonClass =
  'w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/20 ' +
  'transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 ' +
  'focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 ' +
  'dark:focus:ring-offset-slate-900'

export const authLinkClass =
  'font-medium text-indigo-600 underline-offset-2 hover:text-indigo-500 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300'

type AuthSplitLayoutProps = PropsWithChildren<{
  cardTitle: string
  cardDescription?: string
  /** Daha geniş kayıt formu için */
  cardWide?: boolean
}>

export function AuthSplitLayout({ children, cardTitle, cardDescription, cardWide }: AuthSplitLayoutProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row dark:bg-slate-950">
      {/* Brand / hero */}
      <div className="relative flex min-h-[38vh] flex-col justify-between overflow-hidden px-8 py-10 lg:min-h-screen lg:w-[46%] lg:max-w-xl lg:shrink-0 lg:px-10 lg:py-12">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-700 via-indigo-800 to-slate-950"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-purple-500/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl"
          aria-hidden
        />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-amber-200" aria-hidden />
            Future ERP AI
          </div>
          <h1 className="mt-6 max-w-md text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Geleceğin ERP sistemine hoş geldiniz
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-indigo-100/90">
            Satış, stok, finans ve yapay zekâ içgörülerini tek yerden yönetin. Güvenli çok kiracılı mimari ile işletmenizi
            büyütün.
          </p>
        </div>

        <p className="relative z-10 mt-8 text-xs text-white/50 lg:mt-0">
          © {new Date().getFullYear()} Future ERP · Türkiye için tasarlandı
        </p>
      </div>

      {/* Form column */}
      <div className="relative flex flex-1 flex-col justify-center px-4 py-10 sm:px-8 lg:px-12 lg:py-16">
        <div className="absolute right-4 top-4 sm:right-8 lg:right-12 lg:top-8">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label={theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>

        <div
          className={
            'mx-auto w-full rounded-2xl border bg-white/95 p-8 shadow-xl shadow-slate-200/50 backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/95 dark:shadow-black/40 ' +
            (cardWide ? 'max-w-lg' : 'max-w-md')
          }
        >
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{cardTitle}</h2>
          {cardDescription ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{cardDescription}</p>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  )
}
