export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
      {message}
    </p>
  )
}
