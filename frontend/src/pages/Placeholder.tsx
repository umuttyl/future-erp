import { GlobalCard } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <PageLayout title={title} subtitle="Bu modül henüz yapılandırılmadı.">
      <GlobalCard>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Bu sayfa iskelet olarak hazır. İstersen sonraki adımda içeriğini dolduralım.
        </p>
      </GlobalCard>
    </PageLayout>
  )
}
