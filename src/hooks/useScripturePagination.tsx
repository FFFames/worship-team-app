/** Measures new Scripture pages against the same text frames used by the live output. */

import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { LayeredSlide } from '../components/LayeredSlide'
import type { PlaylistCue } from '../types/database'
import type { LocatedVerse, ScriptureEdition } from '../types/scripture'
import { chooseDefaultTheme, type OutputDefaultThemes } from '../utils/defaultThemes'
import type { ScriptureOutputSettings } from '../utils/outputSettings'
import { paginateScriptureCue } from '../utils/scripture'
import { scriptureFlowDesign, scriptureOutputDesign, scriptureOutputLayout, scriptureReference } from '../utils/scriptureOutput'

export type ScripturePaginationRequest = {
  edition: ScriptureEdition
  verses: LocatedVerse[]
  settings: ScriptureOutputSettings
  themes: OutputDefaultThemes
  breakOnVerse: boolean
  minFontRatio: number
}

function measurePages({ edition, verses, settings, themes, breakOnVerse, minFontRatio }: ScripturePaginationRequest) {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, { position: 'fixed', left: '-1500px', top: '0', width: '1280px', height: '720px', visibility: 'hidden' })
  document.body.append(host)
  const root = createRoot(host)
  try {
    return paginateScriptureCue(edition, verses, breakOnVerse, (cue, last) => {
      const slide = cue.slides[0]
      const reference = scriptureReference(cue, slide.label, 0)!
      const layout = scriptureOutputLayout({ ...reference, last }, settings)
      if (!layout.showText) return true
      const theme = chooseDefaultTheme(themes, 'live', 'scripture', slide.label)
      const design = scriptureOutputDesign(scriptureFlowDesign(slide.lines.join('\n'), theme), layout)
      const textOnly = { ...design, layers: design.layers.filter((layer) => layer.kind === 'text' && layer.slot === 'content') }
      flushSync(() => root.render(<LayeredSlide design={textOnly} measureText />))
      return [...host.querySelectorAll<HTMLElement>('[data-measure-text="content"]')].every((frame) => {
        const text = frame.firstElementChild as HTMLElement
        const box = getComputedStyle(frame)
        const screenHeight = frame.parentElement?.getBoundingClientRect().height ?? 720
        const baseSize = parseFloat(box.fontSize)
        const font = settings.fonts?.text
        const nominal = font?.fontRatio === undefined ? baseSize * (font?.sizeScale ?? 1) : font.fontRatio * screenHeight
        const scale = Math.min(1, minFontRatio * screenHeight / nominal)
        text.style.fontSize = `${baseSize * scale}px`
        text.style.setProperty('--text-fit-scale', String(scale))
        const height = frame.clientHeight - parseFloat(box.paddingTop) - parseFloat(box.paddingBottom)
        return text.getBoundingClientRect().height <= height + .5 && text.scrollWidth <= text.clientWidth + 1
      })
    })
  } finally {
    root.unmount()
    host.remove()
  }
}

export function useScripturePagination(request: ScripturePaginationRequest | null) {
  const [result, setResult] = useState<{ request: ScripturePaginationRequest; cue?: PlaylistCue | null; error?: string }>()
  useEffect(() => {
    if (!request) return
    let active = true
    void document.fonts.ready.then(() => {
      if (!active) return
      try {
        setResult({ request, cue: measurePages(request) })
      } catch {
        setResult({ request, error: 'แบ่งสไลด์อัตโนมัติไม่สำเร็จ ลองเลือกวิธีแบ่งแบบอื่น' })
      }
    })
    return () => { active = false }
  }, [request])
  return result?.request === request ? result : undefined
}
