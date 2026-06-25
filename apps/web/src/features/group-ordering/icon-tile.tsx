import type { LucideIcon } from 'lucide-react'

import { cn } from '#/lib/utils'

export function IconTile({
  icon: Icon,
  className,
}: {
  icon: LucideIcon
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex size-12 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      <Icon />
    </div>
  )
}
