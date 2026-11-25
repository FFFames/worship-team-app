import { flushSync } from 'react-dom'
import type { SlideTransition } from '../types/slideDesign'
import { bounceBreaks, bounceOut, slideTransitionEasing } from './slideTransitionEasing'
import { cubeFrames, hexTileFrames, irisMaskFrames, pageFlipFrames, transitionPercent, wipeMaskFrames,
  type SlideTransitionMask, type SlideTransitionSize } from './slideTransitionGeometry'

const compass = ['ซ้าย', 'ขวา', 'ลง', 'ขึ้น', 'ซ้ายลง', 'ซ้ายขึ้น', 'ขวาลง', 'ขวาขึ้น']
const borderSoftness = { key: 'Value-BorderSoftness', label: 'ความนุ่มของขอบ' }
export const slideTransitionEffects: readonly {
  uid: string; effect: string; label: string; directions?: string[]; fades?: true; fixedRamp?: true
  percentages?: { key: string; label: string; fallback: number }[]
}[] = [
  { uid: 'sdDXBlend', effect: 'blend', label: 'Blend' },
  { uid: 'sdDXCover', effect: 'cover', label: 'Cover', directions: compass, fades: true },
  { uid: 'sdDXReveal', effect: 'reveal', label: 'Reveal', directions: compass, fades: true },
  { uid: 'sdDXPush', effect: 'push', label: 'Push', directions: compass.slice(0, 4) },
  { uid: 'sdDXWipe', effect: 'wipe', label: 'Wipe', directions: compass, percentages: [{ ...borderSoftness, fallback: 5 }] },
  { uid: 'sdDXIris', effect: 'iris', label: 'Iris', directions: ['เปิดวงกลม', 'ปิดวงกลม'], percentages: [{ ...borderSoftness, fallback: 10 }] },
  { uid: 'sdCube', effect: 'cube', label: 'Cube', directions: compass.slice(0, 4), percentages: [
    { key: 'Value-pushDistance', label: 'ระยะถอยของภาพ', fallback: 0 },
    { key: 'Value-backgroundBrightness', label: 'ความสว่างพื้นหลัง', fallback: 10 },
  ] },
  { uid: 'sdDXDrop', effect: 'drop', label: 'Drop', fades: true, fixedRamp: true },
  { uid: 'sdHexTile', effect: 'hex-tile', label: 'Hex Tile', fixedRamp: true },
  { uid: 'sdPageFlip', effect: 'page-flip', label: 'Page Flip', directions: compass.slice(0, 2), fades: true,
    percentages: [{ key: 'Value-pageTransparency', label: 'ความโปร่งใสขณะพลิกหน้า', fallback: 50 }] },
]
const directions = [[-100, 0], [100, 0], [0, 100], [0, -100], [-100, 100], [-100, -100], [100, 100], [100, -100]]
const wipes = [
  ['inset(0 0 0 100%)', 'inset(0 0 0 0)'],
  ['inset(0 100% 0 0)', 'inset(0 0 0 0)'],
  ['inset(0 0 100% 0)', 'inset(0 0 0 0)'],
  ['inset(100% 0 0 0)', 'inset(0 0 0 0)'],
  ['polygon(100% 0%, 100% 0%, 100% 0%)', 'polygon(-100% 0%, 100% 0%, 100% 200%)'],
  ['polygon(100% 100%, 100% 100%, 100% 100%)', 'polygon(-100% 100%, 100% 100%, 100% -100%)'],
  ['polygon(0% 0%, 0% 0%, 0% 0%)', 'polygon(200% 0%, 0% 0%, 0% 200%)'],
  ['polygon(0% 100%, 0% 100%, 0% 100%)', 'polygon(200% 100%, 0% 100%, 0% -100%)'],
]

const fadeIn = [{ opacity: 0 }, { opacity: 1 }]
const fadeOut = [{ opacity: 1 }, { opacity: 0 }]
const slideFrame = 'worship-slide'

type SlideTransitionFrames = {
  duration: number; easing?: string; incoming?: Keyframe[]; outgoing?: Keyframe[]
  exitOnTop?: true; backdrop?: string; mask?: SlideTransitionMask
}

export const cutSlideTransition: SlideTransition = { uid: '', values: {} }

export function resolveSlideTransition(local?: SlideTransition, theme?: SlideTransition): SlideTransition | undefined {
  if (!local) return theme
  if (!theme || local.uid !== undefined) return local
  return { uid: theme.uid, values: { ...theme.values, ...local.values } }
}

export function transitionFlag(value: string | undefined) {
  return /^(1|-1|true)$/i.test(value?.trim() ?? '')
}

function dropFrames(fadeIncoming: boolean) {
  // Start with acceleration, then follow three diminishing rebounds off the bottom edge.
  const offsets = [...new Set([...Array.from({ length: 21 }, (_, i) => i / 20), ...bounceBreaks])]
    .sort((left, right) => left - right)
  return offsets.map((offset) => ({
    offset, transform: `translateY(${(bounceOut(offset) - 1) * 100}%)`, ...(fadeIncoming ? { opacity: offset } : {}),
  }))
}

export function slideTransitionFrames(transition: SlideTransition | undefined, reducedMotion = false,
  size: SlideTransitionSize = { width: 1280, height: 720 }, softMasks = true): SlideTransitionFrames | undefined {
  if (!transition?.uid || !transition.values) return undefined
  const option = slideTransitionEffects.find(({ uid }) => uid === transition.uid)
  const values = transition.values
  const duration = Number(values.Duration ?? 500)
  if (!option || !Number.isFinite(duration) || duration <= 0) return undefined
  const { effect } = option

  const requested = Number(values['Value-Direction'] ?? 0)
  const direction = Number.isInteger(requested) && requested >= 0 && requested < (option.directions?.length ?? 0) ? requested : 0
  const [x, y] = directions[direction]
  const from = { transform: `translate(${-x}%, ${-y}%)` }
  const to = { transform: `translate(${x}%, ${y}%)` }
  const target = { transform: 'translate(0%, 0%)' }
  const length = Math.min(duration, reducedMotion ? 150 : 60_000)
  const clip = (points: string[]) => points.map((clipPath) => ({ clipPath }))

  if (reducedMotion) return { duration: length, incoming: fadeIn }
  const easing = slideTransitionEasing(values.Ramp)
  const timing = { duration: length, ...(easing ? { easing } : {}) }
  if (effect === 'blend') return transitionFlag(values['Value-ThroughBlack'])
    ? { ...timing, backdrop: '#000', incoming: [{ opacity: 0 }, { offset: .5, opacity: 0 }, { opacity: 1 }],
      outgoing: [{ opacity: 1 }, { offset: .5, opacity: 0 }, { opacity: 0 }] }
    : { ...timing, incoming: fadeIn }
  const inFade = transitionFlag(values['Value-FadeIn'])
  const outFade = transitionFlag(values['Value-FadeOut'])
  if (effect === 'drop') return {
    ...timing,
    incoming: easing ? [{ transform: 'translateY(-100%)', opacity: inFade ? 0 : 1 }, { transform: 'translateY(0%)', opacity: 1 }]
      : dropFrames(inFade),
    outgoing: outFade ? fadeOut : undefined,
  }
  if (effect === 'cube') {
    const brightness = Math.round(transitionPercent(values['Value-backgroundBrightness'], 10) * 255)
    return { ...timing, ...cubeFrames(direction, size, transitionPercent(values['Value-pushDistance'], 0)),
      backdrop: `rgb(${brightness} ${brightness} ${brightness})` }
  }
  if (effect === 'hex-tile') return { ...timing, incoming: hexTileFrames(size) }
  if (effect === 'page-flip') return { ...timing, exitOnTop: true, incoming: inFade ? fadeIn : undefined,
    outgoing: pageFlipFrames(direction, size, transitionPercent(values['Value-pageTransparency'], 50), outFade) }
  if (effect === 'wipe') {
    const softness = transitionPercent(values[borderSoftness.key], 5)
    return softness && softMasks ? { ...timing, ...wipeMaskFrames(x, y, size, softness) }
      : { ...timing, incoming: clip(wipes[direction]) }
  }
  if (effect === 'iris') {
    const softness = transitionPercent(values[borderSoftness.key], 10)
    const inward = direction === 1
    if (softness && softMasks) return { ...timing, ...irisMaskFrames(softness, inward) }
    const iris = ['ellipse(0% 0% at center)', 'ellipse(70.711% 70.711% at center)']
    return inward ? { ...timing, outgoing: clip(iris.reverse()), exitOnTop: true } : { ...timing, incoming: clip(iris) }
  }
  if (effect === 'push') return { ...timing, incoming: [from, target], outgoing: [target, to] }
  if (effect === 'reveal') return {
    ...timing, exitOnTop: true,
    incoming: inFade ? fadeIn : undefined,
    outgoing: [{ ...target, opacity: 1 }, { ...to, opacity: outFade ? 0 : 1 }],
  }
  return {
    ...timing,
    incoming: [{ ...from, opacity: inFade ? 0 : 1 }, { ...target, opacity: 1 }],
    outgoing: outFade ? fadeOut : undefined,
  }
}

/** Snapshots the visual output only. A newer cue or blackout cancels the current effect. */
export function createSlideTransitionPlayer() {
  const root = document.documentElement
  let active: Pick<ViewTransition, 'skipTransition'> | undefined
  let animations: Animation[] = []
  let showing = false
  let masked = false
  let version = 0

  function skip() {
    for (const animation of animations) animation.cancel()
    animations = []
    active?.skipTransition()
  }

  function clearAppearance() {
    delete root.dataset.presentationExitOnTop
    delete root.dataset.presentationTransitionMask
    root.style.removeProperty('--presentation-transition-backdrop')
    root.style.removeProperty('--presentation-mask-band')
    root.style.removeProperty('--presentation-mask-angle')
  }

  function cancel() {
    version++
    skip()
    active = undefined
    clearAppearance()
  }

  return {
    show(update: () => void, transition?: SlideTransition) {
      cancel()
      const animate = Boolean(transition?.uid && showing && !masked && !document.hidden && typeof document.startViewTransition === 'function')
      const frames = animate ? slideTransitionFrames(transition,
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
          || (transition?.uid === 'sdHexTile' && !CSS.supports('clip-path', 'path("M 0 0 L 1 0 L 1 1 Z")')), {
          width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight),
        }, typeof CSS.registerProperty === 'function' && CSS.supports('mask-image', 'linear-gradient(black, transparent)')) : undefined
      showing = true
      if (!frames) {
        update()
        return
      }

      const generation = version
      if (frames.exitOnTop) root.dataset.presentationExitOnTop = 'true'
      if (frames.backdrop) root.style.setProperty('--presentation-transition-backdrop', frames.backdrop)
      if (frames.mask) {
        root.dataset.presentationTransitionMask = frames.mask.kind
        root.style.setProperty('--presentation-mask-band', `${frames.mask.band}%`)
        if (frames.mask.angle !== undefined) root.style.setProperty('--presentation-mask-angle', `${frames.mask.angle}deg`)
      }
      const running = document.startViewTransition(() => {
        if (generation === version) flushSync(update)
      })
      active = running
      void running.ready.then(() => {
        if (active !== running) return
        try {
          const easing = frames.easing && CSS.supports('animation-timing-function', frames.easing) ? frames.easing : 'linear'
          const options: KeyframeAnimationOptions = { duration: frames.duration, easing }
          if (frames.incoming) animations.push(root.animate(frames.incoming, { ...options, pseudoElement: `::view-transition-new(${slideFrame})` }))
          if (frames.outgoing) animations.push(root.animate(frames.outgoing, { ...options, pseudoElement: `::view-transition-old(${slideFrame})` }))
        } catch {
          skip()
        }
      }, () => {})
      const finish = () => {
        if (active !== running) return
        active = undefined
        animations = []
        clearAppearance()
      }
      void running.finished.then(finish, finish)
    },
    setMasked(value: boolean) {
      masked = value
      // Let a pending cue finish updating behind a blackout so it can be revealed later.
      if (value) skip()
    },
    reset() {
      cancel()
      showing = false
    },
  }
}
