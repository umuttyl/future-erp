export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
      <div className="text-lg font-semibold text-slate-100">{title}</div>
      <div className="mt-1 text-sm text-slate-400">
        Bu sayfa iskelet olarak hazır. İstersen sonraki adımda içeriğini
        dolduralım.
      </div>
    </div>
  )
}

