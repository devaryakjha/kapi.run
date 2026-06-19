import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
  beforeLoad: () => redirect({ to: '/new' }),
})

function Home() {
  return <main className="min-h-screen bg-background" />
}
