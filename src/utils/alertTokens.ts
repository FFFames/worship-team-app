import type { AlertServiceInterval, AlertTemplate, AlertToken, AlertTokenSettings, OutputAlert } from '../types/alertTemplate'
import { replaceInTextRuns } from './textRunReplacement'
import { dateAtDay, daySeconds, serviceEndDayOffset } from './serviceIntervals'

const delphiEpochTicks = 94_353_120_000_000_000n
const unixEpochTicks = 116_444_736_000_000_000n

export const nativeAlertTokenNames: Readonly<Record<number, string>> = {
  0: 'ข้อความ', 1: 'นาฬิกา', 2: 'นับถอยหลังก่อนเริ่มนมัสการ', 3: 'นับถอยหลังก่อนจบนมัสการ',
  4: 'นับถอยหลังตามช่วงนมัสการ', 5: 'นับถอยหลังถึงเวลาที่กำหนด', 6: 'ตัวจับเวลาถอยหลัง',
}
export const alertTokenPattern = /\{\{[^{}\r\n]+\}\}/g

export function fixedTokenSeconds(value: string | null) {
  if (!value) return undefined
  if (/^\d{17,19}$/.test(value)) {
    const ticks = BigInt(value) - delphiEpochTicks
    return Math.round(Number(ticks / 10_000n) / 1000)
  }
  const time = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!time || Number(time[2]) > 59 || Number(time[3] ?? 0) > 59) return undefined
  return Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3] ?? 0)
}

function nativeTimeDate(value: string) {
  const date = /^\d{17,19}$/.test(value)
    ? new Date(Number((BigInt(value) - unixEpochTicks) / 10_000n))
    : new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

export function alertTokenSeconds(token: AlertToken) {
  const fixed = fixedTokenSeconds(token.fixedTime)
  if (fixed !== undefined) return fixed
  const legacyDate = token.timeValue ? nativeTimeDate(token.timeValue) : undefined
  return legacyDate ? legacyDate.getHours() * 3600 + legacyDate.getMinutes() * 60 + legacyDate.getSeconds() : fixedTokenSeconds(token.timeValue)
}

export function nativeServiceTime(fixed: string | null, legacy: string | null) {
  const date = fixed && /^\d{17,19}$/.test(fixed) ? nativeTimeDate(fixed) : undefined
  if (date) return {
    day: date.getUTCDay(),
    seconds: date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds(),
  }
  const local = legacy ? nativeTimeDate(legacy) : undefined
  if (local) return {
    day: local.getDay(), seconds: local.getHours() * 3600 + local.getMinutes() * 60 + local.getSeconds(),
  }
}

export function normalizedTokenId(value: string) {
  return value.trim().replace(/^\{(.*)\}$/, '$1').toLowerCase()
}

export function alertTokenMarker(token: AlertToken, tokens: AlertToken[]) {
  const name = token.name.replace(/[{}\r\n]/g, ' ').trim() || token.id
  const duplicates = tokens.filter((item) => item.name.replace(/[{}\r\n]/g, ' ').trim().toLowerCase() === name.toLowerCase())
  return `{{${duplicates.length > 1 ? name + ' ' + token.id : name}}}`
}

type AlertTokenSource = Pick<AlertTemplate, 'source' | 'tokenSettings'>

export function alertTokenSettings(template?: AlertTokenSource): AlertTokenSettings | undefined {
  const source = template?.source
  const edited = template?.tokenSettings
  if (edited) return { ...edited, serviceIntervals: edited.serviceIntervals ?? source?.serviceIntervals }
  if (source) return { tokens: source.tokens, serviceIntervals: source.serviceIntervals, endToken: source.endType === 2 ? source.endToken : null }
}

export function isAlertCountdown(token: AlertToken) {
  return token.type != null && token.type >= 2 && token.type <= 6
}

export function findAlertEndToken(settings?: AlertTokenSettings) {
  if (!settings?.endToken) return undefined
  const { endToken } = settings
  const countdowns = settings.tokens.filter(isAlertCountdown)
  return countdowns.find((token) => token.id === endToken) ?? countdowns.find((token) => matchesEndToken(token, endToken))
}

export function canEndAlertOnToken(template?: AlertTokenSource) {
  return Boolean(findAlertEndToken(alertTokenSettings(template)))
}

export function createAlertClock(
  template: AlertTemplate | undefined, text: string, now = Date.now(), expireOnToken = canEndAlertOnToken(template),
): OutputAlert['clock'] {
  const settings = alertTokenSettings(template)
  if (!settings?.tokens.length) return undefined
  const endToken = expireOnToken ? findAlertEndToken(settings)?.id ?? null : null
  const hasDynamicValue = settings.tokens.some((token) => text.includes(alertTokenMarker(token, settings.tokens))
    || token.id === endToken)
  return hasDynamicValue ? {
    tokens: settings.tokens, startedAt: now, endToken, serviceIntervals: settings.serviceIntervals,
  } : undefined
}

function matchesEndToken(token: AlertToken, identifier: string) {
  const key = normalizedTokenId(identifier)
  return Boolean(key && [token.uid, token.name, token.id].some((value) => value != null && normalizedTokenId(value) === key))
}

function serviceTarget(intervals: AlertServiceInterval[], mode: number, anchor: Date) {
  const current = anchor.getTime()
  let upcoming: { start: number; end: number } | undefined
  let running: { start: number; end: number } | undefined
  for (const interval of intervals) {
    // Include last week's occurrence so a service spanning midnight can still be active.
    const firstDay = (interval.startDay - anchor.getDay() + 7) % 7
    for (const offset of [firstDay - 7, firstDay, firstDay + 7]) {
      const start = dateAtDay(anchor, offset, interval.startSeconds)
      const end = dateAtDay(anchor, offset + serviceEndDayOffset(interval), interval.endSeconds)
      if (start <= current && current <= end && (!running || start > running.start)) running = { start, end }
      if (start > current && (!upcoming || start < upcoming.start)) upcoming = { start, end }
    }
  }
  if (mode === 3 || (mode === 4 && running)) {
    const service = running ?? upcoming
    if (service) return { at: service.end, visibleFrom: service.end - Math.max((service.end - service.start) / 3, 15 * 60_000) }
  }
  const at = (mode === 2 ? running ?? upcoming : upcoming)?.start
  if (at !== undefined) return { at, visibleFrom: -Infinity }
}

export function formatClock(now: Date, pattern: string) {
  const hour = now.getHours()
  const numbers = { h: hour % 12 || 12, H: hour, n: now.getMinutes(), s: now.getSeconds() }
  return pattern.replace(/"([^"]*)"|'([^']*)'|am\/pm|HH?|hh?|nn?|ss?/gi, (term, quoted, apostrophe) => {
    if (quoted !== undefined || apostrophe !== undefined) return quoted ?? apostrophe
    if (term.toLowerCase() === 'am/pm') {
      const suffix = hour < 12 ? 'am' : 'pm'
      return term === 'AM/PM' ? suffix.toUpperCase() : suffix
    }
    const key = term[0] === 'H' ? 'H' : term[0].toLowerCase() as 'h' | 'n' | 's'
    return String(numbers[key]).padStart(term.length, '0')
  })
}

function formatCountdown(seconds: number, pattern: string) {
  const absolute = Math.abs(seconds)
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor(absolute / 60)
  const hasHours = /h/i.test(pattern)
  const numbers = { h: hours, n: hasHours ? minutes % 60 : minutes, s: absolute % 60 }
  const value = pattern.replace(/\{ss\}/gi, hours > 0 ? '' : ':ss')
    .replace(/hh?|nn?|ss?/gi, (term) => String(numbers[term[0].toLowerCase() as keyof typeof numbers]).padStart(term.length, '0'))
  return (seconds < 0 ? '-' : '') + value
}

function tokenValue(token: AlertToken, clock: NonNullable<OutputAlert['clock']>, now: Date, endsAlert: boolean) {
  const type = token.type
  if (type === 0) return { text: token.value ?? undefined, expired: false }
  if (type === 1) return { text: formatClock(now, token.format || 'HH:nn'), expired: false }
  const seconds = alertTokenSeconds(token)
  let target: number | undefined
  if (type === 6 && seconds !== undefined && seconds >= 0) target = clock.startedAt + seconds * 1000
  if (type === 5 && seconds !== undefined) target = dateAtDay(new Date(clock.startedAt), 0, ((seconds % daySeconds) + daySeconds) % daySeconds)
  if (type != null && type >= 2 && type <= 4) {
    const anchor = endsAlert ? new Date(clock.startedAt) : now
    const service = serviceTarget(clock.serviceIntervals ?? [], type, anchor)
    if (service && now.getTime() < service.visibleFrom) return { text: '', expired: false }
    target = service?.at
  }
  if (target === undefined) return { text: undefined, expired: false }
  const remaining = (target - now.getTime()) / 1000
  const displayed = remaining < 0 ? Math.floor(remaining) : Math.ceil(remaining)
  return {
    text: formatCountdown(token.allowOverrun ? displayed : Math.max(0, displayed), token.format || 'nn:ss'),
    expired: remaining <= 0,
  }
}

export function renderAlertTokens(alert: OutputAlert, now: Date) {
  const { clock, runs } = alert
  if (!clock) return { text: alert.text, ...(runs ? { runs } : {}), expired: false }
  let expired = false
  const replacements = new Map<string, string>()
  const endToken = findAlertEndToken(clock)
  for (const token of clock.tokens) {
    const endsAlert = token === endToken
    const result = tokenValue(token, clock, now, endsAlert)
    if (result.text !== undefined) replacements.set(alertTokenMarker(token, clock.tokens), result.text)
    if (result.expired && endsAlert) expired = true
  }
  return { ...replaceInTextRuns(alert.text, runs, alertTokenPattern, (marker) => replacements.get(marker) ?? marker), expired }
}
