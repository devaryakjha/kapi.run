import { describe, expect, it } from 'vitest'

import { parseParticipantTarget } from './join-target'

describe('parseParticipantTarget', () => {
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

  it('rejects a session id without a key', () => {
    expect(parseParticipantTarget('abc', '')).toBeNull()
  })
})
