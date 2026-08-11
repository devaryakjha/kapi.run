import './styles/base.css'
import './styles/home.css'

import {
  buildParticipantJoinPath,
  parseParticipantJoinTarget,
} from './lib/join-target.ts'

const form = document.querySelector<HTMLFormElement>('.join-form')
const input = document.querySelector<HTMLInputElement>('#session-info')
const error = document.querySelector<HTMLElement>('.join-form__error')

if (!form || !input || !error) {
  throw new Error('The home page form is incomplete.')
}

input.addEventListener('input', () => {
  error.hidden = true
  error.textContent = ''
})

form.addEventListener('submit', (event) => {
  event.preventDefault()

  const target = parseParticipantJoinTarget(input.value, '')
  if (!target) {
    error.textContent =
      'Enter a valid invite link, or paste the session id and key.'
    error.hidden = false
    return
  }

  window.location.assign(buildParticipantJoinPath(target))
})
