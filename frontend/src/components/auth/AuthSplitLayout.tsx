import type { PropsWithChildren } from 'react'
import { BarChart3, Brain, Moon, Shield, Sparkles, Sun, TrendingUp } from 'lucide-react'

import { useTheme } from '../../context/ThemeContext'

const fieldCore =
  'w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition ' +
  'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/60 ' +
  'dark:border-slate-600/80 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-500 ' +
  'dark:focus:border-violet-400/40 dark:focus:ring-violet-500/50'

export const authInputClass = 'mt-1.5 ' + fieldCore

export const authSelectFieldClass = fieldCore + ' cursor-pointer appearance-none pr-10'

export const authPrimaryButtonClass =
  'w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/20 ' +
  'transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-2 ' +
  'focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 ' +
  'dark:focus:ring-offset-slate-800'

export const authLinkClass =
  'font-medium text-violet-600 underline-offset-2 hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300'

type AuthSplitLayoutProps = PropsWithChildren<{
  cardTitle: string
  cardDescription?: string
  cardWide?: boolean
}>

export function AuthSplitLayout({ children, cardTitle, cardDescription, cardWide }: AuthSplitLayoutProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left panel — brand / hero */}
      <div className="relative flex min-h-[44vh] flex-col overflow-hidden lg:min-h-screen lg:w-[46%] lg:max-w-[520px] lg:shrink-0">
        {/* Arka plan katmanları */}
        <div className="absolute inset-0 bg-[#09071a]" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900/70 via-indigo-950/50 to-transparent" aria-hidden />
        {/* Nokta deseni */}
        <div
          className="absolute inset-0 bg-[radial-gradient(circle,_#a78bfa_1px,_transparent_1px)] bg-[length:22px_22px] opacity-[0.06]"
          aria-hidden
        />
        {/* Işık haloları */}
        <div className="pointer-events-none absolute right-0 top-1/3 h-96 w-96 -translate-y-1/2 translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-24 bottom-1/4 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl" aria-hidden />

        <div className="relative z-10 flex flex-1 flex-col px-8 py-10 lg:px-12 lg:py-12">
          {/* Brand mark */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/40">
              <Sparkles className="h-[18px] w-[18px] text-white" strokeWidth={2} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-white">Future ERP AI</span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
                BETA
              </span>
            </div>
          </div>

          {/* Hero copy */}
          <div className="mt-12 lg:mt-16">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-violet-400">
              Yapay Zeka Destekli İşletme Yönetimi
            </p>
            <h1 className="max-w-sm text-3xl font-bold leading-tight tracking-tight text-white lg:text-[2.15rem]">
              Geleceğin ERP sistemiyle işinizi büyütün
            </h1>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              Satış, stok ve finans verilerinizi AI gücüyle analiz edin. Her sektöre özel, tam güvenli çok kiracılı mimari.
            </p>
          </div>

          {/* Feature cards */}
          <div className="mt-10 space-y-2.5 lg:mt-12">
            {[
              { icon: Brain,      title: 'AI Destekli Analiz',  desc: 'Doğal dil ile veri sorgulama ve anomali tespiti' },
              { icon: BarChart3,  title: 'Gelişmiş Raporlama',  desc: 'Gerçek zamanlı satış ve stok analitiği' },
              { icon: Shield,     title: 'Kurumsal Güvenlik',   desc: 'Çok kiracılı mimari, rol tabanlı erişim kontrolü' },
              { icon: TrendingUp, title: 'Satış Tahmini',       desc: 'AI destekli öngörüler ve akıllı sipariş önerileri' },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.05] px-4 py-3 backdrop-blur-sm"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 ring-1 ring-violet-500/25">
                  <Icon className="h-[15px] w-[15px] text-violet-300" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">{title}</p>
                  <p className="text-[11px] text-slate-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Stats strip */}
          <div className="mt-8 flex items-center gap-6 border-t border-white/[0.08] pt-6">
            {[['5+', 'Sektör'], ['8', 'ERP Modülü'], ['7/24', 'Erişim']].map(([val, lbl]) => (
              <div key={lbl}>
                <div className="text-lg font-bold text-white">{val}</div>
                <div className="text-[10px] text-slate-500">{lbl}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 px-8 pb-5 text-[11px] text-slate-700 lg:px-12">
          © {new Date().getFullYear()} Future ERP · Türkiye için tasarlandı
        </p>
      </div>

      {/* Right panel — form */}
      <div className="relative flex flex-1 flex-col justify-center bg-slate-50 px-4 py-10 dark:bg-[#100f1e] sm:px-8 lg:px-12 lg:py-16">
        {/* Theme toggle */}
        <div className="absolute right-4 top-4 sm:right-8 lg:right-12 lg:top-8">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700/80"
            aria-label={theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <div
          className={
            'mx-auto w-full rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50 ' +
            'dark:border-slate-700/50 dark:bg-slate-900 dark:shadow-black/30 ' +
            (cardWide ? 'max-w-lg' : 'max-w-md')
          }
        >
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{cardTitle}</h2>
          {cardDescription ? (
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{cardDescription}</p>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  )
}
