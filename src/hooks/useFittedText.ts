/** Fits a text block to its frame as content, fonts, or available space change. */

import { useLayoutEffect, type CSSProperties, type RefObject } from 'react'
import type { DesignTextRun } from '../types/slideDesign'

export function useFittedText(
  frameRef: RefObject<HTMLElement | null>, textRef: RefObject<HTMLElement | null>,
  { enabled = true, text, style, runs, fitWidth = false, samples }: {
    enabled?: boolean; text: string; style: CSSProperties; runs?: DesignTextRun[]; fitWidth?: boolean; samples?: string[]
  },
) {
  const { fontSize, fontFamily, fontWeight, fontStyle } = style
  const hasOutputSizing = runs?.some(({ style }) => style?.output?.fontRatio !== undefined) ?? false
  const hasOutputStyle = runs?.some(({ style }) => style?.output) ?? false
  useLayoutEffect(() => {
    const frame = frameRef.current
    const body = textRef.current
    if (!enabled || !frame || !body || !text) return
    let active = true
    function fit() {
      if (!active || !frame || !body || !frame.clientHeight) return
      const computed = getComputedStyle(frame)
      const available = frame.clientHeight - parseFloat(computed.paddingTop) - parseFloat(computed.paddingBottom)
      let high = parseFloat(computed.fontSize)
      if (!Number.isFinite(high) || high <= 0 || available <= 0) return
      const originalSize = high
      function setSize(element: HTMLElement, size: number) {
        element.style.fontSize = `${size}px`
        // Output-height units do not shrink with the inherited font size.
        if (hasOutputStyle) element.style.setProperty('--text-fit-scale', String(size / originalSize))
      }
      const probe = samples && samples.length > 1 ? body.cloneNode(false) as HTMLElement : undefined
      if (probe) {
        probe.setAttribute('aria-hidden', 'true')
        Object.assign(probe.style, { position: 'absolute', inset: '0 auto auto -10000px', visibility: 'hidden', width: `${body.clientWidth}px` })
        frame.appendChild(probe)
      }
      const fitsArea = (element: HTMLElement) =>
        element.getBoundingClientRect().height <= available && (!fitWidth || element.scrollWidth <= element.clientWidth + 1)
      function fits(size: number) {
        if (!body) return false
        setSize(body, size)
        if (!fitsArea(body)) return false
        if (!probe || !samples) return true
        setSize(probe, size)
        return samples.every((sample) => {
          probe.textContent = sample
          return fitsArea(probe)
        })
      }
      try {
        if (fits(high)) return
        let low = Math.min(hasOutputSizing ? 0.25 : 4, high)
        if (low > .25 && !fits(low)) low = .25
        for (let step = 0; step < 9 && high - low > 0.25; step++) {
          const size = (low + high) / 2
          if (fits(size)) low = size
          else high = size
        }
        setSize(body, low)
      } finally {
        probe?.remove()
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(frame)
    void document.fonts?.ready.then(fit)
    return () => {
      active = false
      observer.disconnect()
      body.style.removeProperty('font-size')
      body.style.removeProperty('--text-fit-scale')
    }
  }, [enabled, text, runs, fontSize, fontFamily, fontWeight, fontStyle, frameRef, textRef, fitWidth, samples, hasOutputSizing, hasOutputStyle])
}
