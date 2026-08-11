import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export function AppHeader({
  actions,
  context,
}: {
  actions?: ReactNode
  context?: ReactNode
}) {
  return (
    <header
      data-app-header
      className="sticky top-0 z-20 h-14 shrink-0 border-b border-border bg-background"
    >
      <div className="mx-auto grid h-full w-full max-w-6xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 md:px-6">
        <Link
          to="/"
          aria-label="kapi.run home"
          className="justify-self-start font-heading text-lg font-bold tracking-[-0.03em] text-primary no-underline hover:no-underline"
        >
          kapi.run
        </Link>
        <div className="min-w-0 justify-self-center">
          {context ? (
            <span className="hidden max-w-64 truncate text-sm font-medium text-muted-foreground lg:block">
              {context}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center justify-self-end gap-2">
          {actions}
        </div>
      </div>
    </header>
  )
}
