/** Reads the transition declared by PowerPoint and its compatibility fallback. */

import type { DesignSoundtrack, SlideTransition } from '../../types/slideDesign'
import { libraryMediaMime } from '../mediaLibrary'

const standard = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const strict = 'http://purl.oclc.org/ooxml/presentationml/main'
const p14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main'
const compatibility = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
const directions = ['l', 'r', 'd', 'u', 'ld', 'lu', 'rd', 'ru']
const motion = new Map([['push', 'sdDXPush'], ['wipe', 'sdDXWipe'], ['cover', 'sdDXCover'], ['pull', 'sdDXReveal']])
const speeds = new Map([['fast', 500], ['med', 1000], ['slow', 2000]])

export const unsupportedPowerPointTransition = 'เอฟเฟ็กต์เปลี่ยนสไลด์ PowerPoint ยังไม่รองรับ'
export const fallbackPowerPointTransition = 'ใช้เอฟเฟ็กต์เปลี่ยนสไลด์สำรองจาก PowerPoint'
export const unsupportedPowerPointTransitionSound = 'ยังเล่นเสียงที่ผูกกับเอฟเฟ็กต์เปลี่ยนสไลด์ PowerPoint ไม่ได้'
export const unavailablePowerPointTransitionSound = 'ไม่พบไฟล์เสียงเปลี่ยนสไลด์ PowerPoint หรือรูปแบบเสียงนี้ยังไม่รองรับ'

function presentationElement(element: Element) {
  return element.namespaceURI === standard || element.namespaceURI === strict
}

function findTransition(container: Element) {
  return [...container.children].find((element) => presentationElement(element) && element.localName === 'transition')
}

function transitionOptions(slide: Element) {
  const direct = findTransition(slide)
  if (direct) return [direct]
  for (const block of slide.children) {
    if (block.namespaceURI !== compatibility || block.localName !== 'AlternateContent') continue
    const options = [...block.children].flatMap((branch) => {
      if (branch.namespaceURI !== compatibility || !['Choice', 'Fallback'].includes(branch.localName)) return []
      const transition = findTransition(branch)
      return transition ? [transition] : []
    })
    if (options.length) return options
  }
  return []
}

function milliseconds(raw: string | null, max: number) {
  if (!raw || !/^\d+$/.test(raw)) return undefined
  const value = Number(raw)
  return Number.isSafeInteger(value) && value <= max ? value : undefined
}

function enabled(element: Element, name: string) {
  return ['1', 'true'].includes(element.getAttribute(name) ?? '')
}

function readEffect(effect: Element, duration: number): SlideTransition | undefined {
  const values: SlideTransition['values'] = { Duration: String(duration) }
  const throughBlack = enabled(effect, 'thruBlk')
  const name = effect.localName
  const plain = presentationElement(effect)
  if (plain && name === 'cut') return throughBlack ? undefined : { uid: '', values: {} }
  if (plain && name === 'fade') return duration === 0 ? { uid: '', values: {} }
    : { uid: 'sdDXBlend', values: { ...values, ...(throughBlack ? { 'Value-ThroughBlack': '1' } : {}) } }
  if (plain && name === 'circle') return duration === 0 ? { uid: '', values: {} }
    : { uid: 'sdDXIris', values: { ...values, 'Value-Direction': '0', 'Value-BorderSoftness': '0' } }

  const cube = effect.namespaceURI === p14 && name === 'prism' && !enabled(effect, 'isContent') && !enabled(effect, 'isInverted')
  const uid = cube ? 'sdCube' : plain ? motion.get(name) : undefined
  if (!uid) return undefined
  const direction = directions.indexOf(effect.getAttribute('dir') ?? 'l')
  if (direction < 0 || ((cube || name === 'push' || name === 'wipe') && direction > 3)) return undefined
  if (duration === 0) return { uid: '', values: {} }
  return { uid, values: { ...values, 'Value-Direction': String(direction), ...(name === 'wipe' ? { 'Value-BorderSoftness': '0' } : {}) } }
}

type TransitionSoundLinks = { relationships?: Record<string, string>; problems?: ReadonlyMap<string, string>; unresolved?: Set<string> }

function readSound(options: Element[], warnings: Set<string>,
  { relationships = {}, problems, unresolved }: TransitionSoundLinks): DesignSoundtrack | 'stop' | undefined {
  const action = options.flatMap((option) => [...option.children])
    .find((element) => presentationElement(element) && element.localName === 'sndAc')
  const command = action && [...action.children].find(presentationElement)
  if (command?.localName === 'endSnd') return 'stop'
  if (!action) return undefined
  const sound = command?.localName === 'stSnd'
    ? [...command.children].find((element) => presentationElement(element) && element.localName === 'snd') : undefined
  const relatedIds = ['embed', 'link'].map((name) => [...sound?.attributes ?? []]
    .find((attribute) => attribute.localName === name && /\/relationships$/.test(attribute.namespaceURI ?? ''))?.value)
  const sourcePath = relatedIds
    .map((id) => id && Object.prototype.hasOwnProperty.call(relationships, id) ? relationships[id] : undefined)
    .find((path) => path && libraryMediaMime(path)?.startsWith('audio/'))
  if (!sourcePath) {
    const problem = relatedIds.map((id) => id && problems?.get(id)).find(Boolean)
    if (problem && unresolved) unresolved.add(problem)
    else warnings.add(unavailablePowerPointTransitionSound)
    return undefined
  }
  const filename = sourcePath.split('/').pop() ?? sourcePath
  return { kind: 'audio', role: 'foreground', filename, sourcePath, repeat: Boolean(command && enabled(command, 'loop')),
    powerPointTransitionSound: true }
}

export function readPowerPointTransition(slide: Element, warnings: Set<string>, links: TransitionSoundLinks = {}) {
  const options = transitionOptions(slide)
  const primary = options[0]
  if (!primary) return {}
  const advanceMs = milliseconds(primary.getAttribute('advTm'), 2_147_483_647)
  const primaryDuration = milliseconds(primary.getAttributeNS(p14, 'dur'), 60_000)
  const soundAction = readSound(options, warnings, links)
  const result = { ...(advanceMs ? { advanceMs } : {}), ...(soundAction ? { soundAction } : {}) }
  let declared = false
  for (const option of options) {
    const effect = [...option.children].find((element) => !presentationElement(element) || element.localName !== 'sndAc')
    if (!effect) continue
    declared = true
    const duration = milliseconds(option.getAttributeNS(p14, 'dur'), 60_000) ?? primaryDuration ?? speeds.get(option.getAttribute('spd') ?? '') ?? 500
    const transition = readEffect(effect, duration)
    if (!transition) continue
    if (option !== primary) warnings.add(fallbackPowerPointTransition)
    return { ...result, transition }
  }
  if (declared) warnings.add(unsupportedPowerPointTransition)
  return result
}
