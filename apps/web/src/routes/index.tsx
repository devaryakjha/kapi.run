import { useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowRight, LinkIcon, Plus } from 'lucide-react'

import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  buildParticipantJoinPath,
  parseParticipantTarget,
} from '#/features/group-ordering/join-target'

export const Route = createFileRoute('/')({
  component: Home,
})

function startSession() {
  window.location.href = '/new'
}

function Home() {
  const [sessionOrLink, setSessionOrLink] = useState('')
  const [error, setError] = useState<string | null>(null)

  function joinSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = parseParticipantTarget(sessionOrLink, '')
    if (!target) {
      setError('Enter a valid invite link, or paste the session id and key.')
      return
    }

    window.location.href = buildParticipantJoinPath(target)
  }

  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <nav className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <span className="text-base font-bold tracking-tight text-primary">
          kapi.run
        </span>
        <Badge
          variant="secondary"
          className="rounded-full text-[10px] font-semibold uppercase tracking-wider"
        >
          Ops
        </Badge>
      </nav>

      <div className="flex flex-1 items-center px-6 py-12">
        <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="flex flex-col justify-center">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              Start or join a group order.
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Organisers connect Swiggy and create the session. Participants
              join with the invite link and add their own items.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-background p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Plus className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Organiser</h2>
                  <p className="text-[13px] leading-5 text-muted-foreground">
                    Create a session, pick the address, restaurant, and cutoff.
                  </p>
                </div>
              </div>
              <Button
                onClick={startSession}
                className="h-10 w-full rounded-xl text-sm font-semibold"
              >
                New session
                <ArrowRight className="size-3.5" data-icon="inline-end" />
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-background p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                  <LinkIcon className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Participant</h2>
                  <p className="text-[13px] leading-5 text-muted-foreground">
                    Join with an invite link, code, or session details.
                  </p>
                </div>
              </div>

              <form onSubmit={joinSession} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Session info
                  </label>
                  <input
                    value={sessionOrLink}
                    onChange={(e) => {
                      setSessionOrLink(e.target.value)
                      setError(null)
                    }}
                    placeholder="Paste invite link, code, or session id and key"
                    className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none ring-primary/30 transition-shadow placeholder:text-muted-foreground focus:ring-2"
                  />
                </div>
                {error ? (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">
                      {error}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <Button
                  type="submit"
                  className="h-10 w-full rounded-xl text-sm font-semibold"
                >
                  Join session
                  <ArrowRight className="size-3.5" data-icon="inline-end" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
