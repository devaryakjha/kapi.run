import { describe, expect, it } from 'vitest'

import {
  buildOrganizerMenuPath,
  buildOrganizerReviewPath,
  buildParticipantJoinPath,
  parseParticipantJoinTarget,
} from './join-target'

describe('parseParticipantJoinTarget', () => {
  it('reads a short invite link', () => {
    expect(
      parseParticipantJoinTarget('https://app.kapi.run/join?i=invite1', ''),
    ).toEqual({ inviteId: 'invite1' })
  })

  it('reads a pasted invite code', () => {
    expect(parseParticipantJoinTarget('invite1', '')).toEqual({
      inviteId: 'invite1',
    })
  })

  it('reads session details from an invite link', () => {
    expect(
      parseParticipantJoinTarget(
        'https://app.kapi.run/menu?session=abc#key=secret',
        '',
      ),
    ).toEqual({ sessionId: 'abc', key: 'secret' })
  })

  it('reads pasted session id and key', () => {
    expect(parseParticipantJoinTarget('abc secret', '')).toEqual({
      sessionId: 'abc',
      key: 'secret',
    })
  })

  it('strips organizer mode from pasted invite links', () => {
    expect(
      parseParticipantJoinTarget(
        'https://app.kapi.run/review?i=invite1&owner=1#ownerKey=secret',
        '',
      ),
    ).toEqual({ inviteId: 'invite1' })
  })

  it('rejects malformed URL target tokens', () => {
    expect(
      parseParticipantJoinTarget(
        'https://app.kapi.run/join?i=../admin#key=secret',
        '',
      ),
    ).toBeNull()
  })

  it('rejects empty session info', () => {
    expect(parseParticipantJoinTarget('', '')).toBeNull()
  })
})

describe('buildParticipantJoinPath', () => {
  it('builds an invite join path', () => {
    expect(buildParticipantJoinPath({ inviteId: 'invite1' })).toBe(
      '/join?i=invite1',
    )
  })

  it('builds a session join path with the key in the hash', () => {
    expect(buildParticipantJoinPath({ sessionId: 'abc', key: 'secret' })).toBe(
      '/join?session=abc#key=secret',
    )
  })
})

describe('organizer mode paths', () => {
  it('builds a short organizer review path from an invite id', () => {
    expect(
      buildOrganizerReviewPath({
        inviteId: 'invite1',
        sessionId: 'abc',
        key: 'session-secret',
        ownerKey: 'owner-secret',
      }),
    ).toBe('/review?i=invite1&owner=1')
  })

  it('builds a short organizer menu path from an invite id', () => {
    expect(buildOrganizerMenuPath({ inviteId: 'invite1' })).toBe(
      '/menu?i=invite1&owner=1',
    )
  })

  it('builds an organizer review path with session and owner keys', () => {
    expect(
      buildOrganizerReviewPath({
        sessionId: 'abc',
        key: 'session-secret',
        ownerKey: 'owner-secret',
      }),
    ).toBe(
      '/review?session=abc&owner=1#key=session-secret&ownerKey=owner-secret',
    )
  })

  it('builds an organizer menu path with session and owner keys', () => {
    expect(
      buildOrganizerMenuPath({
        sessionId: 'abc',
        key: 'session-secret',
        ownerKey: 'owner-secret',
      }),
    ).toBe('/menu?session=abc&owner=1#key=session-secret&ownerKey=owner-secret')
  })
})
