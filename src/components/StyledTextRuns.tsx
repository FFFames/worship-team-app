import type { CSSProperties } from 'react'
import type { DesignParagraphFormat, DesignTextLayout, DesignTextRun, DesignTextStyle } from '../types/slideDesign'
import type { AlertTextEffects } from '../utils/alertTextEffects'
import { paragraphListMarkers } from '../utils/slideParagraphLists'

export function safeColor(value: string | undefined, fallback: string) {
  if (!value || value.length > 120 || !CSS.supports('color', value)) return fallback
  return value
}

export function safeFont(value: string | undefined) {
  return value && value.length <= 80 && /^[\p{L}\p{M}\p{N}\s.,'-]+$/u.test(value) ? value : 'system-ui, sans-serif'
}

type RunStyle = NonNullable<DesignTextRun['style']>

function withOpacity(color: string, percent: number | undefined) {
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent >= 100) return color
  if (/^#[a-f\d]{6}$/i.test(color)) return color + Math.round(percent * 255 / 100).toString(16).padStart(2, '0')
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`
}

const withNativeOpacity = (color: string, percent: number | undefined) =>
  /^#[a-f\d]{8}$/i.test(color) ? color : withOpacity(color, percent)

function fittedOutputLength(ratio: number, factor = 1) {
  return `calc(${Number((ratio * factor * 100).toFixed(5))}cqh * var(--text-fit-scale, 1))`
}

function effectLength(relative: number | undefined, outputRatio: number | undefined, fallback: number, factor = 1, fitted = false) {
  if (typeof relative === 'number' && Number.isFinite(relative) && relative >= 0) return `${Math.min(relative, 1) * factor}em`
  if (outputRatio !== undefined) return fitted ? fittedOutputLength(outputRatio, factor) : `${Number((outputRatio * factor * 100).toFixed(5))}dvh`
  return `${fallback * factor}em`
}

function textShadow(
  shadow: RunStyle['textShadow'], defaults?: AlertTextEffects['shadow'], fallbackColor?: string, fitted = false,
) {
  if (shadow === false) return 'none'
  if (!shadow && !defaults?.enabled) return undefined
  const angle = shadow?.angle ?? defaults?.angle ?? 45
  const degrees = Number.isFinite(angle) ? angle % 360 : 45
  const radians = degrees * Math.PI / 180
  const x = Number(Math.cos(radians).toFixed(5))
  const y = Number(Math.sin(radians).toFixed(5))
  const horizontal = effectLength(shadow?.offset, defaults?.offset, 0.08, x, fitted)
  const vertical = effectLength(shadow?.offset, defaults?.offset, 0.08, y, fitted)
  const blur = effectLength(shadow?.blur, defaults?.blur, 0.12, 1, fitted)
  const color = withNativeOpacity(safeColor(shadow?.color ?? defaults?.color ?? fallbackColor,
    defaults?.opacity === undefined ? 'rgba(0,0,0,.8)' : '#000000'), defaults?.opacity)
  return `${horizontal} ${vertical} ${blur} ${color}`
}

function outlineStyle(outline: RunStyle['outline'], defaults?: AlertTextEffects['outline'], fallbackColor?: string, fitted = false): CSSProperties {
  if (outline === false) return { WebkitTextStroke: '0 transparent' }
  if (!outline && !defaults?.enabled) return {}
  const placement = defaults?.position
  const width = effectLength(outline?.width, defaults?.width, 0.035, placement === 'outer' ? 2 : 1, fitted)
  const color = withNativeOpacity(safeColor(outline?.color ?? defaults?.color ?? fallbackColor, '#000000'), defaults?.opacity)
  return { WebkitTextStroke: `${width} ${color}`, paintOrder: placement === 'center' || placement === 'inner' ? 'normal' : 'stroke fill' }
}

export function textEffectStyle(effects?: AlertTextEffects, style?: RunStyle, base?: DesignTextStyle): CSSProperties {
  const output = style?.output?.effects
  const opacity = output?.fontOpacity ?? style?.fontOpacity ?? effects?.fontOpacity
  const color = style?.color ? safeColor(style.color, 'currentColor') : undefined
  const decorations = [
    (output?.underline ?? style?.underline ?? effects?.underline ?? base?.underline) && 'underline',
    (output?.strike ?? style?.strike ?? effects?.strike) && 'line-through',
  ].filter(Boolean).join(' ')
  return {
    color: opacity === undefined ? color : withOpacity(color ?? safeColor(base?.color, 'currentColor'), opacity),
    fontVariantPosition: output?.baseline ?? style?.baseline ?? effects?.baseline,
    textDecoration: decorations || undefined,
    textShadow: output?.shadow ? textShadow(output.shadow.enabled ? undefined : false, output.shadow, base?.shadowColor, true)
      : textShadow(style?.textShadow, effects?.shadow, base?.shadowColor),
    ...(output?.outline ? outlineStyle(output.outline.enabled ? undefined : false, output.outline, base?.outlineColor, true)
      : outlineStyle(style?.outline, effects?.outline, base?.outlineColor)),
  }
}

export function StyledTextRuns({ runs, base, effects }: { runs: DesignTextRun[]; base?: DesignTextStyle; effects?: AlertTextEffects }) {
  return runs.map(({ text, style }, index) => {
    const size = style?.sizeScale
    const ratio = style?.output?.fontRatio
    const fontSize = typeof ratio === 'number' && ratio >= .001 && ratio <= 1 ? fittedOutputLength(ratio)
      : size === undefined ? undefined : `${Number.isFinite(size) ? Math.min(8, Math.max(0.1, size)) : 1}em`
    return (
      <span key={index} style={{
        fontFamily: style?.fontFamily ? safeFont(style.fontFamily) : undefined,
        fontSize,
        fontWeight: style?.bold === undefined ? undefined : style.bold ? 700 : 400,
        fontStyle: style?.italic === undefined ? undefined : style.italic ? 'italic' : 'normal',
        ...textEffectStyle(effects, style, base),
      }}>{text}</span>
    )
  })
}

export function outputTextInsetsStyle(insets?: DesignTextLayout['insets']) {
  if (!insets) return undefined
  const amount = (value: number | undefined, unit: 'cqw' | 'cqh') => typeof value === 'number' && value >= 0 && value <= 1
    ? `${Number((100 * value).toFixed(5))}${unit}` : undefined
  return { paddingLeft: amount(insets.left, 'cqw'), paddingRight: amount(insets.right, 'cqw'),
    paddingTop: amount(insets.top, 'cqh'), paddingBottom: amount(insets.bottom, 'cqh') }
}

function paragraphStyle(format?: DesignParagraphFormat): CSSProperties {
  const distance = (value?: number) => value === undefined || !Number.isFinite(value)
    ? undefined : `${Math.max(-100, Math.min(value, 100))}em`
  const spacing = format?.lineSpacing
  let lineHeight: CSSProperties['lineHeight']
  if (spacing && Number.isFinite(spacing.value) && spacing.value > 0) {
    if (spacing.mode === 'multiple') lineHeight = Math.min(100, spacing.value * 1.25)
    if (spacing.mode === 'exact') lineHeight = distance(spacing.value)
    if (spacing.mode === 'minimum') lineHeight = `max(1.25em, ${distance(spacing.value)})`
  }
  const insets = outputTextInsetsStyle(format?.outputInsets)
  const add = (a: string | undefined, b: string | undefined) => a && b ? `calc(${a} + ${b})` : a ?? b
  return {
    marginLeft: distance(format?.leftIndent),
    marginRight: distance(format?.rightIndent),
    textIndent: distance(format?.firstLineIndent),
    ...insets,
    paddingTop: add(distance(format?.spaceBefore), insets?.paddingTop),
    paddingBottom: add(distance(format?.spaceAfter), insets?.paddingBottom),
    lineHeight,
  }
}

/** Each source paragraph gets its own box. Soft wraps remain inside that box. */
export function ParagraphTextRuns({ runs, base }: { runs: DesignTextRun[]; base?: DesignTextStyle }) {
  const groups: { format?: DesignParagraphFormat; align?: DesignTextRun['align']; runs: DesignTextRun[] }[] = []
  for (const run of runs) {
    const previous = groups[groups.length - 1]
    if (previous && previous.format?.index === run.paragraph?.index) previous.runs.push(run)
    else groups.push({ format: run.paragraph, align: run.align, runs: [run] })
  }
  const markers = paragraphListMarkers(groups.map(({ format }) => format?.list))
  const widths = new Map<number, number>()
  markers.forEach((marker, index) => {
    const list = groups[index].format?.list
    if (!list || !marker) return
    const level = list.level ?? 0
    widths.set(level, Math.max(widths.get(level) ?? 0, [...marker].length))
  })
  return groups.map(({ format, align, runs: group }, index) => {
    const previousGroup = groups[index - 1]?.runs
    const previous = previousGroup?.[previousGroup.length - 1]?.text
    const trimmed = group.map((run, part) => {
      let { text } = run
      if (part === 0 && index && !previous?.endsWith('\n')) text = text.replace(/^\n/, '')
      if (part === group.length - 1 && index < groups.length - 1) text = text.replace(/\n$/, '')
      return text === run.text ? run : { ...run, text }
    })
    const content = trimmed.some((run) => run.text) ? <StyledTextRuns runs={trimmed} base={base} /> : '\u00a0'
    const alignment = align ?? base?.align
    const style = paragraphStyle(format)
    const marker = markers[index]
    const list = format?.list
    if (marker && list) {
      const level = list.level ?? 0
      const first = trimmed.find((run) => run.text.trim())
      return <span key={index} className="grid min-w-0 grid-cols-[max-content_minmax(0,max-content)] gap-x-[.5em] whitespace-pre-wrap"
        style={{ ...style, marginLeft: style.marginLeft ?? (level ? `${level * .75}em` : undefined),
          justifyContent: alignment === 'center' ? 'center' : alignment === 'right' ? 'end' : 'start',
          textIndent: (format?.firstLineIndent ?? 0) >= 0 ? style.textIndent : undefined }}>
        <span data-paragraph-marker className="text-right indent-0 tabular-nums" style={{ minWidth: `${widths.get(level) ?? 1}ch` }}>
          <StyledTextRuns runs={[{ text: marker, style: first?.style }]} base={base} />
        </span>
        <span className="min-w-0" style={{ textAlign: alignment }}>{content}</span>
      </span>
    }
    return <span key={index} className="block whitespace-pre-wrap" style={{ ...style, textAlign: alignment }}>
      {content}
    </span>
  })
}
