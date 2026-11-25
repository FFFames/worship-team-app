import { describe, expect, it } from 'vitest'
import type { AlertTemplate, AlertToken } from '../types/alertTemplate'
import { getEasyWorshipSql } from './easyWorship'
import { readEasyWorshipServiceIntervals } from './easyWorshipAlerts'
import { importedAlertRuns, recoverAlertTagText, restoreUneditedNativeTags } from './easyWorshipAlertTags'
import { alertTokenMarker, createAlertClock, renderAlertTokens } from './alertTokens'
import { defaultAlertPlayback, updateAlertProgress } from './alertPlayback'
import { withEditedAlertTokens } from './alertTokenEditing'
import { formatAlertText, liveAlertTextRuns, replaceAlertTextRange, trimAlertText, updateAlertText } from './alertTextEditing'

const ticksForZero = 94_353_120_000_000_000n
const token = (changes: Partial<AlertToken>): AlertToken => ({
  id: '1', uid: 'clock-id', name: 'นาฬิกา', type: 1, format: 'HH:nn:ss',
  interval: null, timeValue: null, fixedTime: null, allowOverrun: 0,
  ...changes,
})
const template = (tokens: AlertToken[], text: string, endToken: string | null = null): AlertTemplate => ({
  id: 'alert', title: 'ประกาศ', text, output: 'live',
  source: {
    profileName: 'Example', rowId: '1', rtf: '', displayType: 0, alignment: 1,
    endType: endToken ? 2 : 0, repeatCount: 1, endToken, tokens,
  },
})

describe('Native EasyWorship alert tokens', () => {
  it('edits imported character formatting locally and keeps it on a renamed token and its live value', () => {
    const original = template([token({})], 'เวลา {{นาฬิกา}}')
    original.source!.rtf = String.raw`{\rtf1\ansi เวลา {\b\ul\sdewtexttag{\*\sdewtagguid clock-id}00:00\sdewtexttag0}}`
    const styled = formatAlertText(original, { start: 9, end: 10 }, { color: '#aaff00', sizeScale: 1.25 })
    const renamed: AlertTemplate = { ...withEditedAlertTokens(styled, [token({ name: 'เวลาพิธี' })]), id: original.id }
    expect(renamed.source).toEqual(original.source)
    const now = new Date(2026, 10, 23, 12, 13, 14)
    const clock = createAlertClock(renamed, renamed.text, now.getTime())
    const runs = liveAlertTextRuns(renamed, renamed.text)
    expect(runs?.find((run) => run.text === '{{เวลาพิธี}}')?.style)
      .toMatchObject({ bold: true, underline: true, color: '#aaff00', sizeScale: 1.25 })
    const rendered = renderAlertTokens({ id: renamed.id, text: renamed.text, runs, playback: defaultAlertPlayback, clock }, now)
    expect(rendered.runs?.find((run) => run.text === '12:13:14')?.style).toMatchObject({ bold: true, color: '#aaff00' })
    const reset: AlertTemplate = { ...formatAlertText(renamed, { start: 0, end: 0 }, null), id: renamed.id }
    expect(liveAlertTextRuns(reset, reset.text)).toBeUndefined()
    expect(reset.source).toEqual(original.source)
  })

  it('maintains selected formatting when inserting at a known range and removes it with the last styled text', () => {
    const draft = { title: 'Test', output: 'live' as const, text: ' 🔔 ฉาย  ' }
    const emphasized = formatAlertText(draft, { start: 2, end: 3 }, { bold: true })
    expect(emphasized.runs?.find((run) => run.style?.bold)?.text).toBe('🔔')
    const inserted = replaceAlertTextRange(emphasized, { start: 1, end: 3 }, '{{หัวข้อ}}')
    const trimmed = trimAlertText(inserted)
    expect(trimmed.runs).toEqual([{ text: '{{หัวข้อ}}', style: { bold: true } }, { text: ' ฉาย' }])
    const removed = updateAlertText(trimmed, ' ฉาย')
    expect(removed.runs).toEqual([{ text: ' ฉาย' }])
  })
  it('preserves imported styles and the ending condition when a countdown is renamed', () => {
    const timer = token({ id: 'timer', name: 'ถอยหลัง', type: 6, format: 'nn:ss', fixedTime: '00:00:05' })
    const record = template([timer], 'เวลา {{ถอยหลัง}}', timer.uid)
    record.source!.rtf = String.raw`{\rtf1\ansi เวลา {\b\sdewtexttag{\*\sdewtagguid clock-id}00:05\sdewtexttag0}}`
    record.playback = { ...defaultAlertPlayback, endOnToken: true }
    const edited = { id: record.id, ...withEditedAlertTokens(record, [{ ...timer, name: 'จบพิธี' }]) }
    expect(edited.text).toBe('เวลา {{จบพิธี}}')
    expect(edited.source).toEqual(record.source)
    expect(edited.tokenSettings.endToken).toBe('timer')
    expect(importedAlertRuns(edited, edited.text)?.find((run) => run.text === '{{จบพิธี}}')?.style).toMatchObject({ bold: true })
    const removed = withEditedAlertTokens(edited, [])
    expect(removed.playback?.endOnToken).toBe(false)
    expect(removed.text).toBe('เวลา ')
    expect(restoreUneditedNativeTags({ id: edited.id, ...removed, text: 'เวลา 00:05' }).text).toBe('เวลา 00:05')
  })

  it('starts a local countdown at activation and expires only for the selected token', () => {
    const now = new Date(2026, 10, 23, 9, 50, 0)
    const tokens = [
      token({ id: 'early', name: 'timer', type: 6, fixedTime: '00:00:01' }),
      token({ id: 'timer', uid: null, name: 'จบข้อความ', type: 6, fixedTime: '00:00:05', format: 'nn:ss' }),
    ]
    const record: AlertTemplate = { id: 'local', title: 'นับถอยหลัง', output: 'stage', text: '{{จบข้อความ}}',
      tokenSettings: { tokens, endToken: 'timer' } }
    const clock = createAlertClock(record, record.text, now.getTime())
    const alert = { id: 'run', text: record.text, playback: defaultAlertPlayback, clock }
    expect(renderAlertTokens(alert, new Date(now.getTime() + 2000))).toEqual({ text: '00:03', expired: false })
    expect(renderAlertTokens(alert, new Date(now.getTime() + 5000))).toEqual({ text: '00:00', expired: true })
  })

  it('replaces only tagged text and preserves existing user edits and unknown tags', () => {
    const timer = token({ id: '2', uid: 'timer-id', name: 'ตัวจับเวลา', type: 6 })
    const rtf = String.raw`{\rtf1\ansi Before \sdewtexttag{\*\sdewtagguid \{clock-id\}}12:30\sdewtexttag0  after {\sdewtexttag{\*\sdewtagguid timer-id}\b 05:00} and \sdewtexttag{\*\sdewtagguid other-id}literal\sdewtexttag0.}`
    const tokens = [token({}), timer]
    const original = 'Before 12:30 after 05:00 and literal.'
    const migrated = 'Before {{นาฬิกา}} after {{ตัวจับเวลา}} and literal.'
    expect(recoverAlertTagText(rtf, tokens)).toBe(migrated)
    const existing = template(tokens, original)
    existing.source!.rtf = rtf
    expect(restoreUneditedNativeTags(existing).text).toBe(migrated)
    expect(restoreUneditedNativeTags({ ...existing, text: 'Local edit' }).text).toBe('Local edit')
  })

  it('updates clocks, preserves countdown start across replay and evaluates token expiration', () => {
    const now = new Date(2026, 10, 23, 13, 43, 12)
    const timer = token({ id: '2', uid: 'timer-id', name: 'ตัวจับเวลา', type: 6, format: 'nn:ss', allowOverrun: 1,
      fixedTime: (ticksForZero + 30n * 10_000_000n).toString() })
    const duplicateName = token({ id: '3', uid: 'other-clock' })
    const original = template([token({}), timer, duplicateName], '{{นาฬิกา 1}} · {{ตัวจับเวลา}}', '{timer-id}')
    expect(alertTokenMarker(original.source!.tokens[0], original.source!.tokens)).toBe('{{นาฬิกา 1}}')
    const clock = createAlertClock(original, original.text, now.getTime())
    const live = { id: 'run', text: original.text, playback: defaultAlertPlayback, clock }
    expect(renderAlertTokens(live, new Date(now.getTime() + 10_000))).toEqual({ text: '13:43:22 · 00:20', expired: false })
    expect(renderAlertTokens(live, new Date(now.getTime() + 31_000))).toEqual({ text: '13:43:43 · -00:01', expired: true })
    expect(updateAlertProgress(live, 'run', 0)).toBeNull()
    const manual = { ...live, clock: createAlertClock(original, original.text, now.getTime(), false) }
    expect(renderAlertTokens(manual, new Date(now.getTime() + 31_000)).expired).toBe(false)
    expect(updateAlertProgress(manual, 'run', 0)).toBe(manual)
  })

  it('keeps imported character styles on Thai text, an empty tagged clock and each clock update', () => {
    const clockToken = token({})
    const record = template([clockToken], 'การ {{นาฬิกา}} original')
    record.source!.rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Tahoma;}{\f1 Courier New;}}
{\colortbl ;\red42\green180\blue75;}{\pard\qr\fs40 \u3585?\u3634?\u3619? {\f1\b\i\ul\fs60\cf1\sdewtexttag{\*\sdewtagguid clock-id}\sdewtexttag0} original}}`
    const text = record.text.replace('original', 'edited')
    const runs = importedAlertRuns(record, text)
    expect(runs?.map((run) => run.text).join('')).toBe(text)
    expect(runs?.every((run) => run.align === undefined)).toBe(true)
    const clockStyle = { fontFamily: 'Courier New', color: '#2ab44b', sizeScale: 1.5, bold: true, italic: true, underline: true }
    expect(runs?.find((run) => run.text === '{{นาฬิกา}}')?.style).toEqual(clockStyle)

    // An operator edit can place a placeholder across formatting boundaries.
    const split = runs!.flatMap((run) => run.text === '{{นาฬิกา}}'
      ? [{ ...run, text: '{{นาฬิ' }, { text: 'กา}}' }]
      : [run])
    const now = new Date(2026, 10, 23, 13, 43, 12)
    const clock = createAlertClock(record, text, now.getTime())
    const alert = { id: 'styled', text, runs: split, playback: defaultAlertPlayback, clock }
    for (const [offset, expected] of [[0, '13:43:12'], [1000, '13:43:13']] as const) {
      const rendered = renderAlertTokens(alert, new Date(now.getTime() + offset))
      expect(rendered.text).toBe(`การ ${expected} edited`)
      expect(rendered.runs?.map((run) => run.text).join('')).toBe(rendered.text)
      expect(rendered.runs?.find((run) => run.text === expected)?.style).toEqual(clockStyle)
    }
  })

  it('carries native outline and shadow attributes through a tagged clock and honors explicit resets', () => {
    const record = template([token({})], '{{นาฬิกา}} Normal Plain')
    record.source!.rtf = String.raw`{\rtf1\ansi\sdeasyworship2{\colortbl ;\red45\green30\blue90;\red15\green100\blue60;}
\sdstroke\sdstrokecolor1\sdstrokealpha255{\*\sdstrokewidthf 0.05}
\shad\sdshadcolor2\sdshadalpha128\sdshadangle90{\*\sdshadradiusf 0.1}{\*\sdshadoffsf 0.2}
\sdewtexttag{\*\sdewtagguid clock-id}00:00:00\sdewtexttag0  \sdstroke0\shad0 Normal \plain Plain}`
    const runs = importedAlertRuns(record, record.text)
    const now = new Date(2026, 10, 23, 13, 43, 12)
    const clock = createAlertClock(record, record.text, now.getTime())
    const rendered = renderAlertTokens({ id: 'effects', text: record.text, runs, playback: defaultAlertPlayback, clock }, now)
    expect(rendered.text).toBe('13:43:12 Normal Plain')
    expect(rendered.runs?.find((run) => run.text === '13:43:12')?.style).toEqual({
      outline: { color: '#2d1e5aff', width: 0.05 },
      textShadow: { color: '#0f643c80', angle: 90, blur: 0.1, offset: 0.2 },
    })
    expect(runs?.find((run) => run.text === 'Normal ')?.style).toMatchObject({ outline: false, textShadow: false })
    expect(runs?.find((run) => run.text === 'Plain')?.style).toBeUndefined()
    record.source!.rtf = String.raw`{\rtf1\b0 Plain}`
    expect(importedAlertRuns(record, 'Plain')).toEqual([{ text: 'Plain', style: { bold: false } }])
    record.source!.rtf = String.raw`{\rtf1\ulnone\strike0\nosupersub\sdtxtalpha255 Plain}`
    expect(importedAlertRuns(record, 'Plain')).toEqual([{ text: 'Plain',
      style: { underline: false, strike: false, baseline: 'normal', fontOpacity: 100 },
    }])
  })

  it('uses the source weekday and time from a fixed service interval database', async () => {
    const SQL = await getEasyWorshipSql()
    const db = new SQL.Database()
    const fileTime = (hour: number) => (BigInt(Date.UTC(2000, 0, 3, hour)) * 10_000n + 116_444_736_000_000_000n).toString()
    let file: File
    try {
      db.run(`CREATE TABLE interval (rowid INTEGER PRIMARY KEY,start_time DATETIME,end_time DATETIME,start_time_fixed DATETIME,end_time_fixed DATETIME);
        INSERT INTO interval VALUES (1,NULL,NULL,${fileTime(9)},${fileTime(10)});`)
      file = new File([new Uint8Array(db.export())], 'ServiceIntervals.db')
    } finally {
      db.close()
    }
    const serviceIntervals = await readEasyWorshipServiceIntervals(file)
    expect(serviceIntervals).toEqual([{ startDay: 1, startSeconds: 32_400, endDay: 1, endSeconds: 36_000 }])
    const service = token({ name: 'จบรอบ', type: 3, format: 'nn:ss' })
    const record = template([service], 'เหลือ {{จบรอบ}}', service.uid)
    record.source!.serviceIntervals = serviceIntervals
    const clock = createAlertClock(record, record.text, new Date(2026, 10, 23, 9, 20).getTime())
    const alert = { id: 'service', text: record.text, clock, playback: defaultAlertPlayback }
    expect(renderAlertTokens(alert, new Date(2026, 10, 23, 9, 25)).text).toBe('เหลือ ')
    expect(renderAlertTokens(alert, new Date(2026, 10, 23, 9, 45)).text).toBe('เหลือ 15:00')
    expect(renderAlertTokens(alert, new Date(2026, 10, 23, 10, 0, 1)).expired).toBe(true)
  })
})
