import type { CartLine, KapiSession, MenuItem } from '@kapi/spec'

import {
  applyParticipantSubmission,
  draftCartFromParticipantItems,
  type DraftCart,
} from './session.ts'

export function hasParticipantSubmission(
  session: KapiSession,
  participantId: string,
) {
  return session.participants.some(
    ({ id, status }) => id === participantId && status === 'submitted',
  )
}

export function participantSubmissionItems(
  submitted: DraftCart,
  draft: DraftCart,
) {
  return [...Object.values(submitted), ...Object.values(draft)]
}

export function reconcileParticipantCartRefresh({
  current,
  incoming,
  dirty,
  editBaseRevision,
  incomingRevision,
}: {
  current: DraftCart
  incoming: DraftCart
  dirty: boolean
  editBaseRevision: string | null
  incomingRevision: string | null
}) {
  return dirty
    ? { submitted: current, editBaseRevision }
    : { submitted: incoming, editBaseRevision: incomingRevision }
}

export function participantCartExpectedRevision(
  dirty: boolean,
  editBaseRevision: string | null,
  latestRevision: string | null,
) {
  return dirty ? editBaseRevision : latestRevision
}

export function participantCartLinesForDisplay(
  source: DraftCart,
  menu: MenuItem[],
  sessionItems: CartLine[],
  participantId: string,
) {
  return Object.values(source).flatMap((line) => {
    const current = menu.find((candidate) => candidate.id === line.menuItemId)
    if (current) return [{ item: current, line }]
    const submitted = sessionItems.find(
      (candidate) =>
        candidate.id === line.id && candidate.participantId === participantId,
    )
    return submitted
      ? [{ item: { name: submitted.name, price: submitted.price }, line }]
      : []
  })
}

export function applyParticipantCartUpdate(
  session: KapiSession,
  menu: Parameters<typeof applyParticipantSubmission>[0]['menu'],
  participantId: string,
  participantName: string,
  submitted: DraftCart,
  draft: DraftCart,
) {
  const updated = applyParticipantSubmission({
    latest: session,
    menu,
    participantId,
    participantName,
    draftItems: participantSubmissionItems(submitted, draft),
  })
  return {
    session: updated,
    submitted: draftCartFromParticipantItems(updated.items, participantId),
    draft: {} satisfies DraftCart,
  }
}
