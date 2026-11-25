import type { AlertTemplate, AlertToken } from '../types/alertTemplate'
import type { DesignTextRun } from '../types/slideDesign'
import { alertTokenMarker, alertTokenPattern, alertTokenSettings, findAlertEndToken, fixedTokenSeconds, isAlertCountdown } from './alertTokens'
import { replaceInTextRuns } from './textRunReplacement'

export const clockFormats = ['HH:nn', 'HH:nn:ss', 'hh:nn am/pm', 'hh:nn:ss am/pm', 'hh:nn', 'hh:nn:ss']
export const countdownFormats = ['nn:ss', 'hh:nn', 'hh:nn:ss', 'hh:nn{ss}']

export function replaceAlertTokenMarkers(
  text: string, previous: AlertToken[], next: AlertToken[], runs?: DesignTextRun[],
) {
  const nextTokens = new Map(next.map((token) => [token.id, token]))
  const replacements = new Map(previous.map((token) => {
    const edited = nextTokens.get(token.id)
    return [alertTokenMarker(token, previous), edited ? alertTokenMarker(edited, next) : '']
  }))
  return replaceInTextRuns(text, runs, alertTokenPattern, (marker) => replacements.get(marker) ?? marker)
}

export function withEditedAlertTokens(template: Omit<AlertTemplate, 'id'>, tokens: AlertToken[]) {
  const settings = alertTokenSettings(template)
  const priorEnd = findAlertEndToken(settings)
  const endToken = tokens.find((token) => token.id === priorEnd?.id && isAlertCountdown(token))?.id ?? null
  const { text, runs } = replaceAlertTokenMarkers(template.text, settings?.tokens ?? [], tokens, template.runs)
  const playback = endToken || !template.playback?.endOnToken ? template.playback : { ...template.playback, endOnToken: false }
  return { ...template, text, runs, playback, tokenSettings: { ...template.tokenSettings, tokens, endToken } }
}

export function validateAlertTokenDraft(token: AlertToken, tokens: AlertToken[]) {
  const name = token.name.trim()
  if (!name || name.length > 80 || /[{}\r\n\0]/.test(name)) return 'กรอกชื่อไม่เกิน 80 ตัวอักษรและเว้นเครื่องหมายปีกกา'
  const unchanged = tokens.find((other) => other.id === token.id)?.name.trim() === name
  if (!unchanged && tokens.some((other) => other.id !== token.id && other.name.trim().toLowerCase() === name.toLowerCase())) {
    return 'ชื่อนี้ใช้กับโทเค็นอื่นแล้ว'
  }
  if (token.type === 1 && (!token.format?.trim() || token.format.length > 100 || /[\r\n\0]/.test(token.format))) {
    return 'กรอกรูปแบบเวลาไม่เกิน 100 ตัวอักษร'
  }
  if (token.type === 5 || token.type === 6) {
    if (!/^\d{1,3}:\d{2}:\d{2}$/.test(token.fixedTime ?? '')) {
      if (token.type === 6) return 'กรอกระยะเวลาในรูปแบบ ชั่วโมง:นาที:วินาที เช่น 0:05:00'
      if (!/^\d{2}:\d{2}$/.test(token.fixedTime ?? '')) return 'เลือกเวลาภายในหนึ่งวัน'
    }
    const seconds = fixedTokenSeconds(token.fixedTime)
    if (token.type === 5 && (seconds === undefined || seconds < 0 || seconds >= 86_400)) return 'เลือกเวลาภายในหนึ่งวัน'
    if (token.type === 6 && (seconds === undefined || seconds < 1)) return 'กรอกระยะเวลาอย่างน้อย 1 วินาที เช่น 0:05:00'
  }
}

export function alertTimeField(seconds: number) {
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
  return parts.map((part) => String(part).padStart(2, '0')).join(':')
}
