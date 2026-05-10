import { useEffect } from 'react'
import { X } from 'lucide-react'

type HelpModalProps = {
  open: boolean
  onClose: () => void
}

export function HelpModal({ open, onClose }: HelpModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900 p-6 text-slate-100 shadow-2xl ring-1 ring-white/10">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Kapat"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 id="help-modal-title" className="pr-10 text-lg font-semibold tracking-tight text-white">
          Yardım
        </h2>
        <p className="mt-1 text-sm text-slate-400">Future ERP AI — hızlı referans</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-300">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-300/90">Sürüm</div>
            <p className="mt-1">Future ERP AI Sürüm 1.0</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-300/90">Kısayollar</div>
            <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
              <li>Sol menüden modüllere geçiş</li>
              <li>Üst arama ile hızlı erişim (geliştiriliyor)</li>
              <li>Sağ alttaki AI asistan ile doğal dil sorguları</li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-300/90">Destek</div>
            <p className="mt-1">
              Destek ekibi:{' '}
              <a
                href="mailto:support@futureerp.dev"
                className="font-medium text-indigo-400 underline-offset-2 hover:text-indigo-300 hover:underline"
              >
                support@futureerp.dev
              </a>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-8 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Tamam
        </button>
      </div>
    </div>
  )
}
