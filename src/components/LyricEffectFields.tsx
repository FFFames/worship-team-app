/** Edits each effect property while retaining the other properties on every lyric run. */

import type { DesignTextRun, DesignTextStyle } from '../types/slideDesign'
import type { LyricRunStyle } from '../utils/songLyricFormatting'

type EffectName = 'outline' | 'textShadow'
type EffectParameters = { color?: string; width?: number; blur?: number; offset?: number; angle?: number }
type StylePatch = (style: LyricRunStyle | undefined) => LyricRunStyle
const fieldClass = 'grid min-w-0 gap-1 text-sm'

function colorParts(color: string | undefined, fallback: string) {
  const hex = color?.match(/^#[\da-f]{6}([\da-f]{2})?$/i)?.[0] ?? fallback
  return { rgb: hex.slice(0, 7).toLowerCase(), alpha: hex.slice(7).toLowerCase() || 'ff' }
}

function EffectAmount({ label, values, min = 0, max = 100, onChange }: {
  label: string; values: number[]; min?: number; max?: number; onChange: (value: number) => void
}) {
  const first = values[0]
  const value = first !== undefined && values.every((amount) => amount === first) ? Number(first.toFixed(2)).toString() : ''
  return <label className={fieldClass}>{label}
    <input key={value} className="input-field min-w-0" inputMode={min < 0 ? 'text' : 'decimal'} autoComplete="off"
      defaultValue={value} placeholder={value === '' ? 'หลายค่า' : undefined}
      onBlur={(event) => {
        const input = event.currentTarget
        const draft = input.value.trim().replace(',', '.').replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50))
        const amount = Number(draft)
        if (!draft || !Number.isFinite(amount) || amount < min || amount > max) input.value = value
        else if (amount !== Number(value) || value === '') onChange(amount)
        else input.value = value
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.currentTarget.blur()
      }} />
  </label>
}

export function LyricEffectFields({ effect, label, selected, base, onApply }: {
  effect: EffectName
  label: string
  selected: DesignTextRun[]
  base?: DesignTextStyle
  onApply: (patch: StylePatch) => void
}) {
  const outline = effect === 'outline'
  const inheritedColor = outline ? base?.outlineColor : base?.shadowColor
  const fallback = outline ? '#000000' : '#000000cc'
  const defaultColor = colorParts(inheritedColor, fallback)
  const defaultHex = defaultColor.rgb + defaultColor.alpha
  const configs: EffectParameters[] = selected.map(({ style }) => style?.[effect] || {})
  const colors = configs.map(({ color }) => colorParts(color, defaultHex))
  const shownColor = colors[0]?.rgb ?? defaultColor.rgb

  function update(change: (current: EffectParameters) => EffectParameters) {
    onApply((style) => ({ [effect]: change(style?.[effect] || {}) }))
  }

  function updateColor(change: (parts: ReturnType<typeof colorParts>) => string) {
    update((current) => ({ color: change(colorParts(current.color, defaultHex)) }))
  }

  return <fieldset className="grid min-w-0 gap-2 rounded-md border border-[var(--border-subtle)] p-2 sm:grid-cols-2">
    <legend className="px-1 text-sm font-medium">{label}</legend>
    <label className={fieldClass}>{outline ? 'สีเส้นขอบ' : 'สีเงา'}
      <input type="color" className="h-10 w-14" value={shownColor}
        onChange={(event) => {
          const rgb = event.currentTarget.value
          updateColor(({ alpha }) => rgb + (alpha === 'ff' ? '' : alpha))
        }} />
    </label>
    <EffectAmount label={outline ? 'ความทึบเส้นขอบ (%)' : 'ความทึบเงา (%)'}
      values={colors.map(({ alpha }) => parseInt(alpha, 16) * 100 / 255)}
      onChange={(opacity) => updateColor(({ rgb }) => rgb + (opacity === 100 ? '' : Math.round(opacity * 255 / 100).toString(16).padStart(2, '0')))} />
    {outline ? <EffectAmount label="ความหนาเส้นขอบ (% ของขนาดตัวอักษร)" values={configs.map(({ width }) => (width ?? .035) * 100)}
      onChange={(width) => update(() => ({ width: width / 100 }))} /> : <>
      <EffectAmount label="ความเบลอเงา (% ของขนาดตัวอักษร)" values={configs.map(({ blur }) => (blur ?? .12) * 100)}
        onChange={(blur) => update(() => ({ blur: blur / 100 }))} />
      <EffectAmount label="ระยะเงา (% ของขนาดตัวอักษร)" values={configs.map(({ offset }) => (offset ?? .08) * 100)}
        onChange={(offset) => update(() => ({ offset: offset / 100 }))} />
      <EffectAmount label="มุมเงา (องศา)" values={configs.map(({ angle }) => angle ?? 45)} min={-360} max={360}
        onChange={(angle) => update(() => ({ angle }))} />
    </>}
  </fieldset>
}
