import { useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowRight, LinkIcon, Plus } from 'lucide-react'

import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  buildParticipantJoinPath,
  parseParticipantJoinTarget,
} from '#/features/group-ordering/join-target'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const router = useRouter()
  const [sessionOrLink, setSessionOrLink] = useState('')
  const [error, setError] = useState<string | null>(null)

  function startSession() {
    router.history.push('/new')
  }

  function joinSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = parseParticipantJoinTarget(sessionOrLink, '')
    if (!target) {
      setError('Enter a valid invite link, or paste the session id and key.')
      return
    }

    router.history.push(buildParticipantJoinPath(target))
  }

  return (
    <main className="flex min-h-svh flex-col overflow-hidden bg-background text-foreground">
      <nav className="border-b border-border/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <span className="font-heading text-lg font-bold tracking-[-0.03em] text-primary">
            kapi.run
          </span>
          <span className="text-xs font-semibold text-muted-foreground">
            Built for Swiggy group orders
          </span>
        </div>
      </nav>

      <div className="flex flex-1 items-center px-4 py-8 md:px-6 md:py-12">
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-24">
          <section className="flex flex-col justify-center">
            <h1 className="max-w-xl font-heading text-5xl font-semibold leading-[0.98] tracking-[-0.045em] md:text-6xl lg:text-[4.75rem]">
              <span className="block">Pick together.</span>
              <span className="block">Pay once.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground md:text-lg">
              Share one link, collect everyone&apos;s picks, and sync the final
              cart when the group is ready.
            </p>
            <p className="mt-8 max-w-md text-sm font-medium text-foreground/70">
              Participants join in the browser. Only the organiser connects
              Swiggy.
            </p>
          </section>

          <section className="relative mx-auto w-full max-w-xl lg:mx-0">
            <div
              aria-hidden="true"
              className="absolute -left-3 top-[38%] size-6 rounded-full border border-border bg-background"
            />
            <div
              aria-hidden="true"
              className="absolute -right-3 top-[38%] size-6 rounded-full border border-border bg-background"
            />
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_70px_-36px_oklch(0.28_0.05_155_/_0.42)]">
              <div className="flex items-center justify-between bg-primary px-5 py-4 text-primary-foreground md:px-6">
                <div>
                  <p className="font-heading text-xl font-semibold leading-6">
                    Group order
                  </p>
                  <p className="text-xs leading-5 text-primary-foreground/75">
                    Create one or join one
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-xl border border-primary-foreground/20 bg-primary-foreground/10">
                  <Plus className="size-5" />
                </div>
              </div>

              <div className="p-5 md:p-6">
                <div className="flex flex-col items-stretch gap-4 pb-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold">
                      Start a new order
                    </h2>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      Choose the address, restaurant, and cutoff.
                    </p>
                  </div>
                  <Button
                    onClick={startSession}
                    className="h-10 w-full shrink-0 rounded-xl px-4 sm:w-auto"
                  >
                    Start order
                    <ArrowRight className="size-3.5" data-icon="inline-end" />
                  </Button>
                </div>

                <div className="border-t border-dashed border-border pt-5">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <LinkIcon className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">Join an order</h2>
                      <p className="text-sm leading-5 text-muted-foreground">
                        Use the invite link or code from the organiser.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={joinSession} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor="session-info"
                        className="text-xs font-semibold text-foreground"
                      >
                        Invite link or code
                      </label>
                      <input
                        id="session-info"
                        value={sessionOrLink}
                        onChange={(e) => {
                          setSessionOrLink(e.target.value)
                          setError(null)
                        }}
                        placeholder="Paste the invite link or code"
                        className="h-11 rounded-xl border border-input bg-background px-3.5 text-sm outline-none ring-primary/25 transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/55 focus:ring-3"
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
                      variant="outline"
                      className="h-10 w-full rounded-xl bg-card"
                    >
                      Join order
                      <ArrowRight className="size-3.5" data-icon="inline-end" />
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
