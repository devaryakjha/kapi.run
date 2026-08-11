import { AlertTriangle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'

export function ErrorAlert({
  message,
  className,
}: {
  message: string | null
  className?: string
}) {
  if (!message) return null
  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
