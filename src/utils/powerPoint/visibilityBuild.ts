/** Reads immediate visibility and media commands from a PowerPoint main click sequence. */

import type { PowerPointBuild } from '../../types/slideDesign'
import { maxPowerPointBuildChanges, maxPowerPointBuildSteps } from './buildNavigation'

export type PowerPointClickGroup = { changes: PowerPointBuild[number]; mediaShapeIds: string[] }
function child(parent: Element | undefined, name: string) {
  return parent && Array.from(parent.children).find((element) => element.localName === name)
}

function descendants(parent: Element, name: string) {
  return Array.from(parent.getElementsByTagNameNS('*', name))
}

function immediate(effect: Element, group: Element) {
  for (let node: Element | null = effect; node && node !== group; node = node.parentElement) {
    if (node.localName !== 'cTn') continue
    if (['repeatCount', 'repeatDur', 'autoRev'].some((key) => node.hasAttribute(key))) return false
    const conditions = child(node, 'stCondLst')
    if (conditions && [...conditions.children].some((condition) => condition.getAttribute('delay') !== '0' || condition.hasAttribute('evt'))) return false
  }
  return true
}

export function isPowerPointPlayCommand(command?: string | null) {
  return /^(?:play|playFrom\(0(?:\.0+)?\))$/.test(command ?? '')
}

export function readPowerPointVisibilityBuild(timing: Element, targets: ReadonlyMap<string, readonly string[]>) {
  const root = child(child(child(timing, 'tnLst'), 'par'), 'cTn')
  const rootNodes = child(root, 'childTnLst')
  const main = rootNodes && [...rootNodes.children].find((node) => node.localName === 'seq'
    && child(node, 'cTn')?.getAttribute('nodeType') === 'mainSeq')
  const groups = child(child(main, 'cTn'), 'childTnLst')
  if (!groups?.children.length || groups.children.length > maxPowerPointBuildSteps) return { incomplete: true }

  let incomplete = [...rootNodes?.children ?? []].some((node) => node !== main
    && !['video', 'audio'].includes(node.localName)
    && !(child(node, 'cTn')?.getAttribute('nodeType') === 'interactiveSeq'
      && descendants(node, 'cTn').filter((time) => time.hasAttribute('presetClass'))
        .every((effect) => effect.getAttribute('presetClass') === 'mediacall')))
  const excluded = new Set<string>()
  const seenMedia = new Set<string>()
  const timeline: PowerPointClickGroup[] = []
  let changeCount = 0
  for (const group of groups.children) {
    const time = child(group, 'cTn')
    const effects = time ? descendants(time, 'cTn').filter((node) => node.hasAttribute('presetClass')) : []
    const gate = child(time, 'stCondLst')
    const condition = child(gate, 'cond')
    const clickGroup = gate?.children.length === 1 && condition?.getAttribute('delay') === 'indefinite'
      && !condition.hasAttribute('evt') && effects.filter((effect) => effect.getAttribute('nodeType') === 'clickEffect').length === 1
    if (!clickGroup) incomplete = true
    const changes: PowerPointBuild[number] = []
    const mediaShapeIds: string[] = []
    for (const effect of effects) {
      const kind = effect.getAttribute('presetClass')
      const trigger = effect.getAttribute('nodeType')
      const onClick = clickGroup && (trigger === 'clickEffect' || trigger === 'withEffect') && time && immediate(effect, time)
      if (kind === 'mediacall') {
        if (!onClick) {
          if (clickGroup) incomplete = true
          continue
        }
        const commands = [...child(effect, 'childTnLst')?.children ?? []].filter((node) => node.localName === 'cmd')
        if (!commands.length) incomplete = true
        for (const command of commands) {
          const shape = child(child(child(command, 'cBhvr'), 'tgtEl'), 'spTgt')
          const id = shape?.getAttribute('spid')
          if (!id || shape?.children.length || seenMedia.has(id) || !isPowerPointPlayCommand(command.getAttribute('cmd'))) {
            incomplete = true
            continue
          }
          seenMedia.add(id)
          mediaShapeIds.push(id)
        }
        continue
      }
      const visible = kind === 'entr'
      const shapeIds = descendants(effect, 'spTgt').map((element) => element.getAttribute('spid') ?? '')
      const setters = Array.from(child(effect, 'childTnLst')?.children ?? []).filter((node) => node.localName === 'set')
      const supported = (visible || kind === 'exit') && onClick
      if (!supported) {
        incomplete = true
        if (visible || kind === 'exit') for (const id of shapeIds) for (const layer of targets.get(id) ?? []) excluded.add(layer)
        continue
      }
      const applied = new Set<string>()
      for (const setter of setters) {
        const behavior = child(setter, 'cBhvr')
        const shape = child(child(behavior, 'tgtEl'), 'spTgt')
        if (!shape || shape.children.length) continue
        const id = shape.getAttribute('spid') ?? ''
        const layers = targets.get(id)
        const value = child(child(setter, 'to'), 'strVal')?.getAttribute('val')
        const attribute = child(child(behavior, 'attrNameLst'), 'attrName')?.textContent
        if (!layers?.length || attribute !== 'style.visibility' || value !== (visible ? 'visible' : 'hidden')) continue
        applied.add(id)
        for (const layerId of layers) changes.push({ layerId, visible })
      }
      if (!applied.size || effect.getAttribute('presetID') !== '1') incomplete = true
      for (const id of shapeIds) if (!applied.has(id)) {
        incomplete = true
        for (const layer of targets.get(id) ?? []) excluded.add(layer)
      }
    }
    changeCount += changes.length
    if (changeCount > maxPowerPointBuildChanges) return { incomplete: true }
    if (changes.length || mediaShapeIds.length) timeline.push({ changes, mediaShapeIds })
  }
  const supported = timeline.map(({ changes, mediaShapeIds }) => ({
    changes: changes.filter(({ layerId }) => !excluded.has(layerId)), mediaShapeIds,
  }))
  const build = supported.map(({ changes }) => changes).filter((changes) => changes.length)
  return { build: build.length ? build : undefined, timeline: supported, incomplete }
}
