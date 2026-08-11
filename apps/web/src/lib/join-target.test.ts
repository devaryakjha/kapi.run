import { describe, expect, it } from 'bun:test'

import {
  buildParticipantJoinPath,
  parseParticipantJoinTarget,
} from './join-target.ts'

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

  it('reads pasted session details', () => {
    expect(parseParticipantJoinTarget('abc secret', '')).toEqual({
      sessionId: 'abc',
      key: 'secret',
    })
  })

  it('rejects malformed tokens', () => {
    expect(
      parseParticipantJoinTarget(
        'https://app.kapi.run/join?i=../admin#key=secret',
        '',
      ),
    ).toBeNull()
  })
})

describe('buildParticipantJoinPath', () => {
  it('builds an invite path', () => {
    expect(buildParticipantJoinPath({ inviteId: 'invite1' })).toBe(
      '/join/?i=invite1',
    )
  })

  it('keeps the session key in the hash', () => {
    expect(buildParticipantJoinPath({ sessionId: 'abc', key: 'secret' })).toBe(
      '/join/?session=abc#key=secret',
    )
  })
})
