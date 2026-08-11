import { useEffect, useRef, useState } from 'react'
import { Check, MapPin, UserRound } from 'lucide-react'

import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { cn } from '#/lib/utils'

export function AccountMenu({
  addressDetail,
  addressLabel,
  connected,
  name,
}: {
  addressDetail: string
  addressLabel: string
  connected: boolean
  name: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const initial = name.trim().slice(0, 1).toUpperCase() || 'A'
  const address = addressDetail.startsWith(`${name}:`)
    ? addressDetail.slice(name.length + 1).trim()
    : addressDetail

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="View your account"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'rounded-full border border-primary/30 bg-background shadow-xs outline-none transition-[border-color,box-shadow,transform]',
          'hover:border-primary/60 hover:shadow-sm active:scale-[0.96]',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'aria-expanded:border-primary aria-expanded:ring-2 aria-expanded:ring-primary/20',
        )}
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Your account"
          className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-lg"
        >
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {connected ? (
                  <>
                    <Check className="size-3.5 text-primary" />
                    Swiggy connected
                  </>
                ) : (
                  <>
                    <UserRound className="size-3.5" />
                    Guest participant
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="mt-2.5 border-t border-border pt-2.5">
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-medium">{addressLabel}</p>
                {address ? (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
                    {address}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
