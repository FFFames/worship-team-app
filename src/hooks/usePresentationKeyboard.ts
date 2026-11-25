/** Drives presentation hotkeys from the controller and its paired audience window. */

import { useEffect, useRef, useState } from 'react'
import { isKeyboardJump, keyboardActions, keyboardBinding, readKeyboardProfile,
  type KeyboardAction, type KeyboardProfile } from '../utils/presentationKeyboard'

type KeyStroke = { binding: string; repeat: boolean }
type PendingJump = { action: KeyboardAction; digits: string }

const digit = /^(?:Digit|Numpad)([0-9])$/
const repeatable = new Set<KeyboardAction>(['nextSlide', 'previousSlide', 'nextCue', 'previousCue'])
const channelName = (session: string) => `worshipteam:keyboard:${session}`

function chordFrom(event: KeyboardEvent, completingJump = false): KeyStroke | undefined {
  const target = event.target instanceof HTMLElement ? event.target : undefined
  if (event.defaultPrevented || target?.isContentEditable || target?.closest('input,textarea,select,dialog[open]')) return
  const activation = (event.code === 'Space' && !target?.closest('[data-cue-navigation]'))
    || (!completingJump && (event.code === 'Enter' || event.code === 'NumpadEnter'))
  if (activation
    && target?.closest('button,summary,a[href],[role=button]')) return
  const binding = keyboardBinding(event)
  if (binding) return { binding, repeat: event.repeat }
}

export function usePresentationKeyboard(
  session: string,
  profile: KeyboardProfile | undefined,
  run: (action: KeyboardAction, number?: number) => void,
  standard: (event: KeyboardEvent) => void,
): string | undefined {
  const current = useRef({ profile, run, standard })
  const [pending, setPending] = useState<PendingJump>()
  useEffect(() => { current.current = { profile, run, standard } }, [profile, run, standard])

  useEffect(() => {
    const channel = new BroadcastChannel(channelName(session))
    let jump: PendingJump | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    function cancel() {
      clearTimeout(timer)
      jump = undefined
      setPending(undefined)
    }
    function stage(next: PendingJump) {
      clearTimeout(timer)
      jump = next
      setPending(next)
      timer = setTimeout(cancel, 8000)
    }
    function consume(stroke: KeyStroke): boolean {
      const active = current.current.profile
      if (!active) return false
      const { binding, repeat } = stroke
      if (jump && binding === 'Escape') { cancel(); return true }
      if (jump && (binding === 'Enter' || binding === 'NumpadEnter')) {
        if (!repeat) current.current.run(jump.action, Number(jump.digits || '1'))
        cancel()
        return true
      }
      const action = active.bindings[binding]
      if (action) {
        if (repeat && !repeatable.has(action)) return true
        if (isKeyboardJump(action)) stage({ action, digits: '' })
        else { cancel(); current.current.run(action) }
        return true
      }
      const value = digit.exec(binding)?.[1]
      if (value) {
        if (!repeat) stage({ action: jump?.action ?? 'slideNumber', digits: ((jump?.digits ?? '') + value).slice(0, 4) })
        return true
      }
      if (jump) cancel()
      return false
    }
    function local(event: KeyboardEvent) {
      const stroke = chordFrom(event, Boolean(jump))
      if (!stroke) return
      if (consume(stroke)) event.preventDefault()
      else if (!current.current.profile || stroke.binding === 'Escape' || stroke.binding === 'KeyP') current.current.standard(event)
    }
    channel.onmessage = (event: MessageEvent<Partial<KeyStroke>>) => {
      const stroke = event.data
      if (typeof stroke?.binding === 'string' && typeof stroke.repeat === 'boolean') consume({ binding: stroke.binding, repeat: stroke.repeat })
    }
    window.addEventListener('keydown', local)
    window.addEventListener('pointerdown', cancel)
    return () => {
      window.removeEventListener('keydown', local)
      window.removeEventListener('pointerdown', cancel)
      clearTimeout(timer)
      channel.close()
    }
  }, [session])

  return pending && profile ? [keyboardActions[pending.action], pending.digits].filter(Boolean).join(' ') + ' · Enter' : undefined
}

export function useAudienceKeyboard(session: string | undefined) {
  useEffect(() => {
    if (!session) return
    const channel = new BroadcastChannel(channelName(session))
    let profile = readKeyboardProfile()
    function refresh() { profile = readKeyboardProfile() }
    function relay(event: KeyboardEvent) {
      if (!profile) return
      const stroke = chordFrom(event)
      if (!stroke) return
      const { binding } = stroke
      if (!profile.bindings[binding] && !digit.test(binding) && !['Enter', 'NumpadEnter', 'Escape'].includes(binding)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      channel.postMessage(stroke)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('keydown', relay, true)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('keydown', relay, true)
      channel.close()
    }
  }, [session])
}
