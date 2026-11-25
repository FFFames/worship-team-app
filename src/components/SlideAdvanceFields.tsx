import { useId } from 'react'
import type { SlidePlaybackSettings } from '../types/slideDesign'
import type { PlaybackSlide } from '../utils/slidePlayback'

const field = 'flex min-w-0 flex-col gap-1 text-sm'

export function SlideAdvanceFields({ value, onChange }: { value: PlaybackSlide; onChange: (patch: PlaybackSlide) => void }) {
  const modeLabel = useId()
  const playback = value.playback
  const mode = playback?.mode ?? (value.advanceMs !== undefined ? 'timer' : 'manual')
  const delay = playback?.delayMs ?? value.advanceMs
  const afterMedia = mode === 'media'

  function setMode(next: NonNullable<SlidePlaybackSettings['mode']>) {
    const timing = next === 'timer' ? delay || 5000 : undefined
    onChange({ advanceMs: timing, playback: { ...playback, mode: next, delayMs: next === 'media' ? 0 : undefined } })
  }

  return (
    <fieldset className="grid min-w-0 gap-2">
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <label className={field}><span id={modeLabel}>วิธีเลื่อนสไลด์</span>
          <select aria-labelledby={modeLabel} className="input-field min-w-0" value={mode}
            onChange={(event) => setMode(event.target.value as NonNullable<SlidePlaybackSettings['mode']>)}>
            <option value="manual">เลื่อนเอง</option>
            <option value="timer">ตามเวลา</option>
            <option value="media">หลังเสียงหรือวิดีโอเล่นจบ</option>
          </select>
        </label>
        <label className={field}>{afterMedia ? 'เวลารอหลังสื่อจบ (วินาที)' : 'เวลาเลื่อนอัตโนมัติ (วินาที)'}
          <input className="input-field min-w-0" type="number" min={afterMedia ? 0 : 0.001} max="2147483.647" step="0.001"
            value={mode === 'manual' || delay === undefined ? '' : delay / 1000}
            onChange={(event) => {
              const input = event.target.valueAsNumber
              const ms = Number.isFinite(input) ? Math.round(input * 1000) : undefined
              if (afterMedia) onChange({ advanceMs: undefined, playback: { ...playback, delayMs: ms ?? 0 } })
              else onChange({ advanceMs: ms, playback: playback && { ...playback, mode: ms === undefined ? 'manual' : 'timer', delayMs: undefined } })
            }} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(playback?.loop)} onChange={(event) => onChange({ playback: { ...playback, loop: event.target.checked } })} />
        เล่นสื่อวนซ้ำบนสไลด์นี้
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(playback?.restart)} onChange={(event) => onChange({ playback: { ...playback, restart: event.target.checked } })} />
        เริ่มสื่อใหม่เมื่อเปิดสไลด์นี้
      </label>
    </fieldset>
  )
}
