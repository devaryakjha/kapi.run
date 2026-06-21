import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/join')({
  component: Join,
})

function Join() {
  useEffect(() => {
    window.location.replace(
      `/menu${window.location.search}${window.location.hash}`,
    )
  }, [])

  return <main className="min-h-svh bg-background" />
}
