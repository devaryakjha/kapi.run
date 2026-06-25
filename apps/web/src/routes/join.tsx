import { useEffect, useReducer } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { KapiSession } from '@kapi/spec'
import { ArrowRight, Loader2, Users } from 'lucide-react'

import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  buildOrganizerReviewPath,
  parseParticipantJoinTarget,
} from '#/features/group-ordering/join-target'
import {
  ErrorAlert,
  getOrCreateLocalParticipantId,
  hasOrganizerCapability,
  loadEncryptedSessionRecord,
  localParticipantNameKey,
  resolveSessionLinkParts,
} from '#/features/group-ordering/shared'
import type { SessionLinkParts } from '#/features/group-ordering/shared'

export const Route = createFileRoute('/join')({
  component: Join,
})

type JoinState = {
  error: string | null
  key: string
  name: string
  pending: boolean
  session: KapiSession | null
}

function initialJoinState(): JoinState {
  return {
    error: null,
    key: '',
    name: '',
    pending: true,
    session: null,
  }
}

function patchJoinState(state: JoinState, patch: Partial<JoinState>) {
  return { ...state, ...patch }
}

function Join() {
  const [state, setState] = useReducer(
    patchJoinState,
    undefined,
    initialJoinState,
  )

  useEffect(() => {
    async function loadSession() {
      const target = parseTargetFromLocation()
      if (!target) {
        setState({ error: 'Invite link is invalid.', pending: false })
        return
      }

      const parts = await resolveSessionLinkParts(target)
      if (!parts.sessionId || !parts.key) {
        setState({ error: 'Invite link is invalid.', pending: false })
        return
      }

      const loaded = await loadEncryptedSessionRecord(
        parts.sessionId,
        parts.key,
      )
      if (
        parts.organizerSecret &&
        (await hasOrganizerCapability(loaded.session, parts.organizerSecret))
      ) {
        window.location.replace(
          buildOrganizerReviewPath({
            inviteId: parts.inviteId ?? undefined,
            sessionId: parts.sessionId,
            key: parts.key,
            ownerKey: parts.organizerSecret,
          }),
        )
        return
      }
      getOrCreateLocalParticipantId(parts.sessionId)
      setState({
        key: parts.key,
        name:
          localStorage.getItem(localParticipantNameKey(parts.sessionId)) ?? '',
        pending: false,
        session: loaded.session,
      })
    }

    loadSession().catch((caught: Error) =>
      setState({ error: caught.message, pending: false }),
    )
  }, [])

  function joinOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!state.session || !state.key) return
    const name = state.name.trim()
    if (!name) {
      setState({ error: 'Enter your name to join this order.' })
      return
    }
    localStorage.setItem(localParticipantNameKey(state.session.id), name)
    const url = new URL('/menu', window.location.origin)
    url.searchParams.set('session', state.session.id)
    url.hash = new URLSearchParams({ key: state.key }).toString()
    window.location.href = `${url.pathname}${url.search}${url.hash}`
  }

  return (
    <main className="flex min-h-svh bg-background px-6 py-10 text-foreground">
      <div className="m-auto w-full max-w-md rounded-2xl border border-border bg-background p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Users className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Join this order</p>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
              {state.session
                ? `${state.session.restaurant.name} · ${state.session.cutoffTime} cutoff`
                : 'Confirm your name before adding items.'}
            </p>
          </div>
        </div>

        {state.pending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading order
          </div>
        ) : (
          <form onSubmit={joinOrder} className="space-y-3">
            {state.session ? (
              <Alert>
                <AlertDescription className="text-xs">
                  Your name is shown with the items you submit.
                </AlertDescription>
              </Alert>
            ) : null}
            <ErrorAlert message={state.error} />
            <div className="space-y-1.5">
              <label
                htmlFor="join-name"
                className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
              >
                Your name
              </label>
              <Input
                id="join-name"
                value={state.name}
                onChange={(event) =>
                  setState({ name: event.target.value, error: null })
                }
                placeholder="Shown in the group cart"
                disabled={!state.session}
              />
            </div>
            <Button
              type="submit"
              disabled={!state.session}
              className="h-10 w-full rounded-xl text-sm font-semibold"
            >
              Join order
              <ArrowRight className="size-3.5" data-icon="inline-end" />
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}

function parseTargetFromLocation(): SessionLinkParts | null {
  const search = new URLSearchParams(window.location.search)
  const rawTarget = search.get('target')
  const target = rawTarget
    ? parseParticipantJoinTarget(rawTarget, '')
    : parseParticipantJoinTarget(window.location.href, '')
  if (!target) return null
  return {
    inviteId: target.inviteId ?? null,
    key: target.key ?? null,
    organizerSecret: null,
    owner: false,
    sessionId: target.sessionId ?? null,
  }
}
