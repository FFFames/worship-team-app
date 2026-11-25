/** Lets readers correct the Windows character set of a legacy song preview. */

import { LEGACY_ENCODING_OPTIONS, type LegacySongEncoding } from '../utils/easyWorshipEncoding'

export function EasyWorshipLegacyEncoding({ value, onChange, disabled, label = 'รหัสอักษรของเพลงรุ่นเก่า' }: {
  value: LegacySongEncoding
  onChange: (encoding: LegacySongEncoding) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <label className="flex w-full min-w-0 max-w-sm flex-col gap-2 text-sm">
      {label}
      <select className="input-field min-w-0" value={value} disabled={disabled}
        onChange={(event) => onChange(event.target.value as LegacySongEncoding)}>
        {LEGACY_ENCODING_OPTIONS.map(([encoding, label]) => <option key={encoding} value={encoding}>{label}</option>)}
      </select>
      <span className="text-[var(--fg-secondary)]">หากภาษาไทยหรือภาษาอื่นอ่านผิด ให้เลือกรหัสอักษรแล้วตรวจรายการอีกครั้ง</span>
    </label>
  )
}
