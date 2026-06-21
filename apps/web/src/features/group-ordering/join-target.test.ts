import { describe, expect, it } from 'vitest'

import { parseParticipantTarget } from './join-target'

describe('parseParticipantTarget', () => {
  it('reads a short invite link', () => {
    expect(
      parseParticipantTarget('https://app.kapi.run/join?i=invite1', ''),
    ).toEqual({ inviteId: 'invite1' })
  })

  it('reads a pasted invite code', () => {
    expect(parseParticipantTarget('invite1', '')).toEqual({
      inviteId: 'invite1',
    })
  })

  it('reads session details from an invite link', () => {
    expect(
      parseParticipantTarget(
        'https://app.kapi.run/menu?session=abc#key=secret',
        '',
      ),
    ).toEqual({ sessionId: 'abc', key: 'secret' })
  })

  it('reads pasted session id and key', () => {
    expect(parseParticipantTarget('abc secret', '')).toEqual({
      sessionId: 'abc',
      key: 'secret',
    })
  })

  it('rejects empty session info', () => {
    expect(parseParticipantTarget('', '')).toBeNull()
  })
})
