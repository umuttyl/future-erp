/** Verilen obje dizisini CSV dosyası olarak indirir. */
export function downloadCsv<T extends Record<string, unknown>>(rows: T[], filename: string): void {
  if (rows.length === 0) return
  const cols = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
