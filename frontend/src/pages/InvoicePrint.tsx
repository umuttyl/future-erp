import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchInvoicePrintData, type InvoicePrintData } from '../lib/api'

function fmt(value: string | number, currency: string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n)
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function InvoicePrintPage() {
  const { orderId, invoiceId } = useParams<{ orderId: string; invoiceId: string }>()
  const [data, setData] = useState<InvoicePrintData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId || !invoiceId) return
    fetchInvoicePrintData(parseInt(orderId), parseInt(invoiceId))
      .then(setData)
      .catch(() => setError('Failed to load invoice data.'))
  }, [orderId, invoiceId])

  useEffect(() => {
    if (data) {
      document.title = `Invoice ${data.invoice_no}`
    }
  }, [data])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Loading…</p>
      </div>
    )
  }

  const cur = data.currency || 'TRY'

  return (
    <>
      {/* Print action bar — hidden when printing */}
      <div className="no-print fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm print:hidden">
        <span className="text-sm font-medium text-slate-700">
          Invoice: <span className="font-bold text-slate-900">{data.invoice_no}</span>
        </span>
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Print / Save as PDF
          </button>
          <button
            onClick={() => window.close()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>

      {/* Invoice document */}
      <div className="invoice-page mx-auto min-h-screen bg-white px-12 pb-16 pt-20 print:px-8 print:pt-8" style={{ maxWidth: 860 }}>

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            {data.company_logo_url && (
              <img src={data.company_logo_url} alt="logo" className="mb-3 h-12 object-contain" />
            )}
            <h1 className="text-xl font-bold text-slate-900">{data.company_name}</h1>
            {data.company_address && (
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{data.company_address}</p>
            )}
            {data.company_phone && (
              <p className="text-sm text-slate-600">Tel: {data.company_phone}</p>
            )}
            {data.company_tax_number && (
              <p className="text-sm text-slate-600">Tax No: {data.company_tax_number}</p>
            )}
          </div>
          <div className="text-right">
            <div className="mb-1 inline-block rounded-lg bg-indigo-600 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">
              INVOICE
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{data.invoice_no}</p>
            <p className="mt-1 text-sm text-slate-500">Date: {fmtDate(data.invoice_date)}</p>
            <p className="text-sm text-slate-500">Order: {data.order_no} ({fmtDate(data.order_date)})</p>
          </div>
        </div>

        {/* Divider */}
        <div className="mb-6 border-t-2 border-indigo-600" />

        {/* Bill to */}
        <div className="mb-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">Bill To</p>
          <p className="text-base font-semibold text-slate-900">{data.customer_name || '—'}</p>
        </div>

        {/* Line items table */}
        <table className="mb-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-2 pl-2 pr-4">Product / Description</th>
              <th className="py-2 px-4 text-right">Qty</th>
              <th className="py-2 px-4 text-right">Unit Price</th>
              <th className="py-2 px-4 text-right">VAT %</th>
              <th className="py-2 px-4 text-right">VAT</th>
              <th className="py-2 pl-4 pr-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, idx) => (
              <tr key={idx} className="border-b border-slate-100">
                <td className="py-2.5 pl-2 pr-4 font-medium text-slate-800">{item.product_name}</td>
                <td className="py-2.5 px-4 text-right text-slate-700">{item.quantity}</td>
                <td className="py-2.5 px-4 text-right text-slate-700">{fmt(item.unit_price, cur)}</td>
                <td className="py-2.5 px-4 text-right text-slate-700">{parseFloat(item.tax_rate).toFixed(0)}%</td>
                <td className="py-2.5 px-4 text-right text-slate-700">{fmt(item.tax_amount, cur)}</td>
                <td className="py-2.5 pl-4 pr-2 text-right font-semibold text-slate-900">{fmt(item.line_total, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-72">
            <div className="flex justify-between border-b border-slate-200 py-1.5 text-sm text-slate-600">
              <span>Subtotal (excl. VAT)</span>
              <span>{fmt(data.subtotal, cur)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 py-1.5 text-sm text-slate-600">
              <span>Total VAT</span>
              <span>{fmt(data.tax_total, cur)}</span>
            </div>
            <div className="flex justify-between py-2.5 text-base font-bold text-slate-900">
              <span>GRAND TOTAL</span>
              <span className="text-indigo-700">{fmt(data.total_amount, cur)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {data.notes && (
          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="mb-1 font-semibold text-slate-700">Notes</p>
            <p className="whitespace-pre-line">{data.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
          This document was issued by {data.company_name}.{data.company_tax_number ? ` • Tax No: ${data.company_tax_number}` : ''}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print, button { display: none !important; }
          body { margin: 0; background: white; }
          .invoice-page { max-width: 100% !important; padding: 12mm 16mm !important; }
          @page { margin: 12mm; size: A4; }
        }
      `}</style>
    </>
  )
}
