/** Edits a URL frame while keeping its saved slide position. */

import type { DesignLayer } from '../types/slideDesign'

type WebLayer = Extract<DesignLayer, { kind: 'web' }>
const positions = { x: 'ซ้าย', y: 'บน', width: 'กว้าง', height: 'สูง' } as const

export function newWebLayer(): WebLayer {
  return { kind: 'web', id: crypto.randomUUID(), url: '', role: 'foreground', frame: { x: .1, y: .1, width: .8, height: .8 } }
}

export function WebLayerEditor({ layer, onChange, onRemove }: {
  layer: WebLayer
  onChange: (layer: WebLayer) => void
  onRemove: () => void
}) {
  return (
    <details className="min-w-0 rounded-lg border border-[var(--border-subtle)] p-3!" open>
      <summary className="cursor-pointer text-sm font-medium">{layer.powerPointMedia ? 'วิดีโอออนไลน์จาก PowerPoint' : 'กรอบเว็บ'}</summary>
      <label className="mt-2! flex flex-col gap-1 text-sm">
        {layer.powerPointMedia ? 'ลิงก์ YouTube หรือ Vimeo' : 'ที่อยู่ในกรอบเว็บ'}
        <input type="url" maxLength={4096} className="input-field" value={layer.url}
          onChange={(event) => onChange({ ...layer, url: event.target.value })} />
      </label>
      <div className="mt-2! grid grid-cols-2 gap-2">
        {(Object.keys(positions) as (keyof WebLayer['frame'])[]).map((key) => (
          <label className="flex flex-col gap-1 text-sm" key={key}>{positions[key]} (%)
            <input className="input-field" type="number" step="0.1" value={Number((100 * layer.frame[key]).toFixed(2))}
              onChange={(event) => {
                const amount = event.target.valueAsNumber
                if (Number.isFinite(amount)) onChange({ ...layer, frame: { ...layer.frame, [key]: amount / 100 } })
              }} />
          </label>
        ))}
      </div>
      <div className="mt-2! flex flex-wrap items-center gap-2">
        {!layer.powerPointMedia && <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(layer.hideScrollbars)}
            onChange={(event) => onChange({ ...layer, hideScrollbars: event.target.checked })} />
          ซ่อนแถบเลื่อน
        </label>}
        <button type="button" className="btn-ghost" onClick={onRemove}>{layer.powerPointMedia ? 'ลบวิดีโอ' : 'ลบกรอบเว็บ'}</button>
      </div>
    </details>
  )
}
