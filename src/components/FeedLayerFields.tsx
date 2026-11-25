import { useId } from 'react'
import type { LiveFeed } from '../types/liveFeed'
import type { DesignLayer } from '../types/slideDesign'
import { positionedFeedLayer } from '../utils/livePresentation'

const fields = { x: 'ซ้าย', y: 'บน', width: 'กว้าง', height: 'สูง' } as const
const labelClass = 'flex min-w-0 flex-col gap-1 text-sm'

export function FeedLayerFields({ layers, feeds, onChange }: {
  layers: DesignLayer[]; feeds: LiveFeed[]; onChange: (layers: DesignLayer[]) => void
}) {
  const fieldId = useId()

  function move(position: number, offset: number) {
    const next = [...layers]
    const [layer] = next.splice(position, 1)
    next.splice(position + offset, 0, layer)
    onChange(next)
  }

  return <>
    {layers.map((layer, position) => layer.kind === 'camera' && <details key={layer.id} open
      className="min-w-0 rounded-lg border border-[var(--border-subtle)] p-3!">
      <summary className="cursor-pointer text-sm font-medium wrap-anywhere">กรอบสัญญาณสด · {layer.asset.filename}</summary>
      <div className="mt-2! grid grid-cols-2 gap-2">
        {(Object.keys(fields) as (keyof typeof fields)[]).map((key) => <label key={key} className={labelClass}>
          {fields[key]} (%)
          <input type="number" step="0.1" className="input-field min-w-0" value={Number((100 * layer.frame[key]).toFixed(2))}
            onChange={(event) => {
              const value = event.target.valueAsNumber
              if (!Number.isFinite(value)) return
              onChange(layers.map((item) => item === layer ? { ...layer, frame: { ...layer.frame, [key]: value / 100 } } : item))
            }} />
        </label>)}
      </div>
      <div className="mt-2! flex flex-wrap gap-2">
        <button type="button" className="chip-btn" disabled={position === 0} onClick={() => move(position, -1)}>ส่งไปด้านหลัง</button>
        <button type="button" className="chip-btn" disabled={position === layers.length - 1} onClick={() => move(position, 1)}>นำมาด้านหน้า</button>
        <button type="button" className="btn-ghost" onClick={() => onChange(layers.filter((item) => item !== layer))}>ลบกรอบสัญญาณสด</button>
      </div>
    </details>)}
    {feeds.length > 0 && <div className={labelClass}>
      <label htmlFor={fieldId}>เพิ่มกรอบสัญญาณสด</label>
      <select className="input-field min-w-0" id={fieldId} value="" onChange={(event) => {
        const feed = feeds.find((candidate) => candidate.id === event.target.value)
        if (feed) onChange([...layers, positionedFeedLayer(feed)])
      }}>
        <option value="">เลือกสัญญาณจากคลัง</option>
        {feeds.map((feed) => <option key={feed.id} value={feed.id}>{feed.name}</option>)}
      </select>
    </div>}
  </>
}
