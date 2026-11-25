import { useEffect, useState } from 'react'
import { nurseryNoticeVisible, type NurseryDisplay } from '../utils/nurseryAlerts'
import { safeFont, textEffectStyle } from './StyledTextRuns'

export function NurseryAlertBanner({ display }: { display: NurseryDisplay }) {
  const { notices, style } = display
  const [checkedAt, setCheckedAt] = useState(Date.now)
  const visible = notices.filter((notice) => nurseryNoticeVisible(notice, Math.max(checkedAt, Date.now())))
  useEffect(() => {
    const now = Date.now()
    const deadline = Math.min(...notices.flatMap(({ expiresAt }) => expiresAt !== null && expiresAt > now ? [expiresAt] : []))
    if (!Number.isFinite(deadline)) return
    const timer = window.setTimeout(() => setCheckedAt(Date.now()), Math.max(0, deadline - Date.now()))
    return () => window.clearTimeout(timer)
  }, [notices, checkedAt])

  if (!visible.length) return null
  const background = style.backgroundColor + Math.round(style.opacity * 255 / 100).toString(16).padStart(2, '0')
  const fontSize = style.fontRatio === undefined ? `min(${style.fontSize}px, 8dvw)` : `min(${style.fontRatio * 100}dvh, 25dvw)`
  return (
    <div aria-live="polite" data-nursery-position={style.position}
      className={`flex max-h-[40%] max-w-full flex-wrap gap-2 overflow-hidden ${style.position.endsWith('right') ? 'justify-end' : 'justify-start'}`}>
      {visible.map(({ code }) => <span key={code} className="max-w-full wrap-anywhere rounded-md px-3! py-1! font-semibold tabular-nums"
        style={{ backgroundColor: background, fontSize,
          ...textEffectStyle(style.effects, { color: style.textColor }),
          fontFamily: style.fontFamily ? `${safeFont(style.fontFamily)}, sans-serif` : undefined,
          fontWeight: style.bold === undefined ? undefined : style.bold ? 700 : 400,
          fontStyle: style.italic === undefined ? undefined : style.italic ? 'italic' : 'normal' }}>{code}</span>)}
    </div>
  )
}
