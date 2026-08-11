import { useEffect, useState } from 'react'
import type { KapiSession } from '@kapi/spec'
import { LockKeyhole } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'

import { formatRemainingTime, isSessionLockedForParticipants } from './shared'

export function TimerPill({ session }: { session: KapiSession }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const locked = isSessionLockedForParticipants(session, now)

  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="img"
              tabIndex={0}
              aria-label="Order locked"
              className="flex size-8 shrink-0 cursor-help items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive outline-none transition-colors hover:bg-destructive/15 focus-visible:ring-2 focus-visible:ring-destructive/30"
            />
          }
        >
          <LockKeyhole className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side="bottom">Order locked</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-(--kapi-subtle) px-3 py-1.5 text-foreground">
      <span className="relative flex size-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
      </span>
      <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums">
        {formatRemainingTime(session, now)}
      </span>
    </div>
  )
}
