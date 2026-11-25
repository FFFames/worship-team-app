/** Adds or replaces a Scripture text frame through the library passage picker. */

import { useState } from 'react'
import type { DesignLayer } from '../types/slideDesign'
import { scriptureTextFrame } from '../utils/scriptureTextFrame'
import { ScripturePassageDialog } from './ScripturePassageDialog'

type TextLayer = Extract<DesignLayer, { kind: 'text' }>

export function ScriptureFrameButton({ frame, onChange, className = 'btn-secondary' }: {
  frame?: TextLayer
  onChange: (frame: TextLayer) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return <>
    <button type="button" className={className} onClick={() => setOpen(true)}>
      {frame ? 'เปลี่ยนข้อพระคัมภีร์' : 'เพิ่มข้อพระคัมภีร์'}
    </button>
    {open && <ScripturePassageDialog initial={frame?.scriptureSource} onClose={() => setOpen(false)} onSelect={(edition, verses) => {
      setOpen(false)
      const selected = scriptureTextFrame(edition, verses, frame)
      if (selected) onChange(selected)
    }} />}
  </>
}
