import { AppHeader } from '#/components/app-header'

export function WorkspaceLoading({
  label = 'Loading order',
}: {
  label?: string
}) {
  return (
    <main
      className="min-h-svh bg-background text-foreground"
      aria-busy="true"
      aria-label={label}
    >
      <AppHeader
        actions={<div className="h-7 w-24 animate-pulse rounded-lg bg-muted" />}
      />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
      <span className="sr-only">{label}</span>
    </main>
  )
}
