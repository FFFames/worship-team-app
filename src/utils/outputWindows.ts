import { readOutputSettings } from './outputSettingsStorage'
import type { OutputDisplay, OutputWindow } from './outputSettings'

export type ConnectedDisplay = EventTarget & Screen & OutputDisplay & { availLeft: number; availTop: number; isPrimary: boolean }
type ScreenDetails = EventTarget & { screens: readonly ConnectedDisplay[] }
type ScreenWindow = Window & { getScreenDetails?: () => Promise<ScreenDetails> }
export type DisplayAccess = { state: 'ready'; details: ScreenDetails } | { state: 'unsupported' | 'denied' | 'prompt' }
type PlacementWarning = 'unsupported' | 'access' | 'missing' | 'reposition'

let screenDetails: ScreenDetails | undefined
let screenPermission: PermissionStatus | undefined
const requests = new WeakMap<Window, symbol>()

function clearRevokedDisplays() {
  if (screenPermission?.state !== 'granted') screenDetails = undefined
}

async function observeScreenPermission() {
  const permission = await navigator.permissions.query({ name: 'window-management' as PermissionName })
  screenPermission?.removeEventListener('change', clearRevokedDisplays)
  screenPermission = permission
  permission.addEventListener('change', clearRevokedDisplays)
  clearRevokedDisplays()
  return permission
}

export function screenManagementSupported() {
  return typeof (window as ScreenWindow).getScreenDetails === 'function'
}

export async function loadOutputDisplays(request = false): Promise<DisplayAccess> {
  const getDetails = (window as ScreenWindow).getScreenDetails
  if (!getDetails) return { state: 'unsupported' }
  try {
    if (!request) {
      const permission = await observeScreenPermission()
      if (permission.state !== 'granted') {
        screenDetails = undefined
        return { state: permission.state }
      }
    }
    screenDetails = await getDetails.call(window)
    const details = screenDetails
    if (request) void observeScreenPermission().catch(() => {})
    else clearRevokedDisplays()
    return { state: 'ready', details }
  } catch {
    screenDetails = undefined
    return { state: request ? 'denied' : 'prompt' }
  }
}

export function outputDisplayReference({ label, left, top, width, height }: OutputDisplay): OutputDisplay {
  return { label: label.slice(0, 240), left, top, width, height }
}

export function outputDisplayKey(display: OutputDisplay) {
  return JSON.stringify(outputDisplayReference(display))
}

export function matchOutputDisplay<T extends OutputDisplay>(display: OutputDisplay | undefined, screens: readonly T[]): T | undefined {
  if (!display) return undefined
  const byLabel = screens.filter((screen) => outputDisplayReference(screen).label === display.label)
  const exact = byLabel.filter((screen) => screen.left === display.left && screen.top === display.top
    && screen.width === display.width && screen.height === display.height)
  return exact.length === 1 ? exact[0] : display.label && byLabel.length === 1 ? byLabel[0] : undefined
}

export function openOutputWindow(output: OutputWindow, path: string, name: string, onWarning?: (warning: PlacementWarning | null) => void) {
  const preferred = readOutputSettings().displays[output]
  const cached = matchOutputDisplay(preferred, screenDetails?.screens ?? [])
  const features = cached
    ? `left=${cached.availLeft},top=${cached.availTop},width=${cached.availWidth},height=${cached.availHeight}`
    : 'width=1280,height=720'
  // Open during the click or keypress. Screen permission and placement may resolve later.
  const popup = window.open(path, name, features)
  if (!popup) return null
  const request = Symbol()
  requests.set(popup, request)
  if (!preferred) return popup
  const isCurrent = () => !popup.closed && requests.get(popup) === request

  function place(screen: ConnectedDisplay) {
    if (!popup || !isCurrent()) return
    try {
      popup.moveTo(screen.availLeft, screen.availTop)
      popup.resizeTo(screen.availWidth, screen.availHeight)
      if (onWarning) {
        window.setTimeout(() => {
          if (!isCurrent()) return
          try {
            const x = popup.screenX + popup.outerWidth / 2
            const y = popup.screenY + popup.outerHeight / 2
            const onScreen = x >= screen.left && x < screen.left + screen.width && y >= screen.top && y < screen.top + screen.height
            onWarning(onScreen ? null : 'reposition')
          } catch { onWarning('reposition') }
        }, 300)
      }
    } catch { onWarning?.('reposition') }
  }

  if (cached) place(cached)
  else void loadOutputDisplays().then((access) => {
    if (!isCurrent()) return
    if (access.state !== 'ready') { onWarning?.(access.state === 'unsupported' ? 'unsupported' : 'access'); return }
    const screen = matchOutputDisplay(preferred, access.details.screens)
    if (screen) place(screen)
    else onWarning?.('missing')
  })
  return popup
}
