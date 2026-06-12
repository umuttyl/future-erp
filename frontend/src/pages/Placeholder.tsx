import { GlobalCard } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <PageLayout title={title} subtitle="This module has not been configured yet.">
      <GlobalCard>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          This page is ready as a skeleton. Content can be added in a future step.
        </p>
      </GlobalCard>
    </PageLayout>
  )
}
