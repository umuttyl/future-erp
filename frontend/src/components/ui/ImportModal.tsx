import { useRef, useState } from 'react'
import { CheckCircle2, Download, Upload, X, AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { downloadImportTemplate, importFromFile, type ImportResource, type ImportResult } from '../../lib/api'
import { primaryButtonClass } from './forms'

interface Props {
  resource: ImportResource
  title: string
  onClose: () => void
  onSuccess: () => void
}

export function ImportModal({ resource, title, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File) {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
      setError('Only .xlsx, .xls, or .csv files are accepted.')
      return
    }
    setFile(f)
    setResult(null)
    setError(null)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }

  async function onImport() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const res = await importFromFile(resource, file)
      setResult(res)
      if (res.imported > 0) onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const hasResult = result !== null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-ui-border-sub bg-ui-surface shadow-2xl dark:border-white/10"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ui-border-sub px-6 py-5">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-5 w-5 text-ui-accent" />
            <h2 className="text-base font-semibold text-ui-text">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Step 1 — Template */}
          <div className="rounded-xl border border-ui-border-sub bg-ui-surface-2 px-4 py-3">
            <p className="text-xs font-semibold text-ui-text">Step 1 — Download the template</p>
            <p className="mt-0.5 text-xs text-ui-muted">Fill in the template with your data, then upload it below.</p>
            <button
              type="button"
              onClick={() => void downloadImportTemplate(resource)}
              className="mt-2 flex items-center gap-1.5 rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-medium text-ui-text transition hover:bg-ui-surface-2"
            >
              <Download className="h-3.5 w-3.5 text-ui-accent" />
              Download Template (.xlsx)
            </button>
          </div>

          {/* Step 2 — File drop */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ui-text">Step 2 — Upload your file</p>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={[
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition',
                dragging
                  ? 'border-ui-accent bg-ui-accent/5'
                  : file
                    ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'border-ui-border hover:border-ui-accent/50 hover:bg-ui-surface-2',
              ].join(' ')}
            >
              <Upload className={`h-6 w-6 ${file ? 'text-emerald-500' : 'text-ui-muted'}`} />
              {file ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{file.name}</p>
                  <p className="text-xs text-ui-muted">{(file.size / 1024).toFixed(1)} KB — click to change</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-ui-muted">Click or drag & drop</p>
                  <p className="text-xs text-ui-muted">.xlsx, .xls, .csv</p>
                </div>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              title="Select import file"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f) }}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Result */}
          {hasResult && (
            <div className="rounded-xl border border-ui-border-sub bg-ui-surface-2 px-4 py-3 space-y-2">
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {result!.imported} imported
                </span>
                {result!.skipped > 0 && (
                  <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                    ⚠ {result!.skipped} skipped (already exist)
                  </span>
                )}
                {result!.errors.length > 0 && (
                  <span className="flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                    ✕ {result!.errors.length} errors
                  </span>
                )}
              </div>
              {result!.errors.length > 0 && (
                <ul className="max-h-32 overflow-y-auto space-y-0.5">
                  {result!.errors.map((e, i) => (
                    <li key={i} className="text-xs text-rose-600 dark:text-rose-400">
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-ui-border-sub px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-ui-border px-4 py-2 text-sm text-ui-muted hover:bg-ui-surface-2"
          >
            {hasResult ? 'Close' : 'Cancel'}
          </button>
          {!hasResult && (
            <button
              type="button"
              disabled={!file || busy}
              onClick={() => void onImport()}
              className={primaryButtonClass + ' flex items-center gap-2 px-4 py-2 text-sm'}
            >
              {busy ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  Import
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
