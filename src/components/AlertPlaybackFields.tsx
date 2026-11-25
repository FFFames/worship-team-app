import type { AlertPlayback } from '../types/alertTemplate'

export function AlertPlaybackFields({ prefix, value, onChange, disabled, allowTokenEnd }: {
  prefix: string
  value: AlertPlayback
  onChange: (playback: AlertPlayback) => void
  disabled?: boolean
  allowTokenEnd?: boolean
}) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-2 text-xs">
      <div className="grid min-w-0 gap-1">
        <label htmlFor={`${prefix}-mode`}>รูปแบบการแสดง</label>
        <select id={`${prefix}-mode`} className="input-field min-w-0" value={value.mode}
          onChange={(event) => onChange({ ...value, mode: event.currentTarget.value as AlertPlayback['mode'] })}>
          <option value="static">คงที่</option>
          <option value="scroll">เลื่อนข้อความ</option>
          <option value="when-needed">เลื่อนเมื่อข้อความยาวเกินจอ</option>
        </select>
      </div>
      {value.mode !== 'scroll' && <div className="grid min-w-0 gap-1">
        <label htmlFor={`${prefix}-alignment`}>แนวข้อความเมื่อแสดงคงที่</label>
        <select id={`${prefix}-alignment`} className="input-field min-w-0" value={value.alignment}
          onChange={(event) => onChange({ ...value, alignment: event.currentTarget.value as AlertPlayback['alignment'] })}>
          <option value="left">ชิดซ้าย</option>
          <option value="center">กึ่งกลาง</option>
          <option value="right">ชิดขวา</option>
        </select>
      </div>}
      <div className="grid min-w-0 gap-1">
        <label htmlFor={`${prefix}-count`}>จำนวนรอบ</label>
        <select id={`${prefix}-count`} className="input-field min-w-0" value={value.endOnToken && allowTokenEnd ? 'token' : value.passes ?? ''}
          onChange={(event) => {
            const option = event.currentTarget.value
            onChange({ ...value, passes: option && option !== 'token' ? Number(option) : null, endOnToken: option === 'token' })
          }}>
          <option value="">แสดงจนกว่าจะล้าง</option>
          {allowTokenEnd && <option value="token">เมื่อโทเค็นหมดเวลา</option>}
          {Array.from({ length: 9 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} รอบ</option>)}
        </select>
      </div>
    </fieldset>
  )
}
