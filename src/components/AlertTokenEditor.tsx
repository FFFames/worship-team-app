import { useId, useState } from 'react'
import { ServiceIntervalFields } from './ServiceIntervalFields'
import type { AlertOutput, AlertResourceCatalog, AlertServiceInterval, AlertToken, AlertTokenSettings } from '../types/alertTemplate'
import { alertTokenMarker, alertTokenSeconds, isAlertCountdown, nativeAlertTokenNames } from '../utils/alertTokens'
import { alertTimeField, clockFormats, countdownFormats, validateAlertTokenDraft } from '../utils/alertTokenEditing'

const tokenTypes = [0, 1, 2, 3, 4, 5, 6]
const serviceCountdown = (token: AlertToken) => token.type === 2 || token.type === 3 || token.type === 4

export function AlertTokenEditor({ settings, catalogs, output, disabled, onTokensChange, onIntervalsChange, onInsert }: {
  settings?: AlertTokenSettings
  catalogs: AlertResourceCatalog[]
  output: AlertOutput
  disabled?: boolean
  onTokensChange: (tokens: AlertToken[]) => void
  onIntervalsChange: (intervals: AlertServiceInterval[]) => void
  onInsert: (marker: string) => void
}) {
  const [draft, setDraft] = useState<AlertToken>()
  const [error, setError] = useState('')
  const tokens = settings?.tokens ?? []
  const availableCatalogs = catalogs.filter((catalog) => catalog.serviceIntervals.length || catalog.tokens.some((entry) => entry.output === output))
  function change(patch: Partial<AlertToken>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
    setError('')
  }
  function edit(token?: AlertToken) {
    setError('')
    if (!token) {
      setDraft({ id: crypto.randomUUID(), uid: null, name: '', type: 6, format: 'nn:ss',
        interval: null, timeValue: null, fixedTime: '00:05:00', allowOverrun: 0 })
      return
    }
    const seconds = alertTokenSeconds(token)
    setDraft({ ...token, fixedTime: (token.type === 5 || token.type === 6) && seconds !== undefined && seconds >= 0
      ? alertTimeField(seconds) : token.fixedTime })
  }
  function remember() {
    if (!draft) return
    const token = { ...draft, name: draft.name.trim(), format: draft.format?.trim() ?? null,
      ...(draft.type === 0 ? { value: draft.value ?? '' } : {}) }
    const problem = validateAlertTokenDraft(token, tokens)
    if (problem) { setError(problem); return }
    const updated = tokens.some((item) => item.id === token.id)
      ? tokens.map((item) => item.id === token.id ? token : item)
      : [...tokens, token]
    onTokensChange(updated)
    setDraft(undefined)
  }
  const formats = draft?.type === 1 ? clockFormats : countdownFormats
  const actualFormat = draft?.format ?? formats[0]
  const customFormat = draft?.type === 1 && !formats.includes(actualFormat)
  const extendFormats = actualFormat && !customFormat && !formats.includes(actualFormat) ? [...formats, actualFormat] : formats
  return (
    <details className="min-w-0 rounded-lg border border-[var(--border-subtle)] p-3! text-sm">
      <summary className="cursor-pointer">โทเค็นข้อความและตัวจับเวลา</summary>
      <fieldset disabled={disabled} className="mt-3! grid min-w-0 gap-3">
        {availableCatalogs.length > 0 && <AlertResourcePicker key={output} catalogs={availableCatalogs} output={output} tokens={tokens}
          onCopyToken={(token) => onTokensChange([...tokens, token])} onCopyIntervals={onIntervalsChange} />}
        {tokens.length > 0 && <ul className="grid min-w-0 gap-2">
          {tokens.map((token) => <li key={token.id} className="grid min-w-0 gap-1 border-b border-[var(--border-subtle)] pb-2!">
            <span className="wrap-anywhere font-medium">{token.name || token.id}</span>
            <span className="text-xs text-[var(--fg-secondary)]">{nativeAlertTokenNames[token.type ?? -1] ?? 'รูปแบบจาก EasyWorship'}</span>
            <div className="flex flex-wrap gap-1">
              <button type="button" className="btn-secondary" onClick={() => onInsert(alertTokenMarker(token, tokens))}>แทรก</button>
              {tokenTypes.includes(token.type ?? -1) && <button type="button" className="btn-ghost" onClick={() => edit(token)}>แก้โทเค็น</button>}
              <button type="button" className="btn-ghost" onClick={() => {
                onTokensChange(tokens.filter((item) => item !== token))
                if (draft?.id === token.id) setDraft(undefined)
              }}>เอาโทเค็นออก</button>
            </div>
          </li>)}
        </ul>}
        <button type="button" className="btn-secondary justify-self-start" onClick={() => edit()}>เพิ่มโทเค็น</button>
        {draft && <fieldset className="grid min-w-0 gap-2">
          <legend className="font-medium">{tokens.some((token) => token.id === draft.id) ? 'แก้โทเค็น' : 'โทเค็นใหม่'}</legend>
          <label className="grid gap-1">ชื่อโทเค็น
            <input className="input-field min-w-0" value={draft.name} onChange={(event) => change({ name: event.currentTarget.value })} />
          </label>
          <div className="grid gap-1">
            <label htmlFor="alert-token-type">ชนิดโทเค็น</label>
            <select id="alert-token-type" className="input-field min-w-0" value={draft.type ?? 6} onChange={(event) => {
              const type = Number(event.currentTarget.value)
              change({ type, format: type === 1 ? clockFormats[0] : countdownFormats[0],
                fixedTime: type === 5 ? '09:00:00' : type === 6 ? '00:05:00' : null,
                timeValue: null, allowOverrun: 0, value: type === 0 ? draft.value ?? '' : null })
            }}>
              {tokenTypes.map((type) => <option key={type} value={type}>{nativeAlertTokenNames[type]}</option>)}
            </select>
          </div>
          {draft.type === 0 ? (
            <label className="grid gap-1">ค่าข้อความ
              <textarea rows={2} className="input-field min-w-0" value={draft.value ?? ''}
                onChange={(event) => change({ value: event.currentTarget.value })} />
            </label>
          ) : (
            <div className="grid gap-1">
              <label htmlFor="alert-token-format">รูปแบบเวลา</label>
              <select id="alert-token-format" className="input-field min-w-0" value={customFormat ? 'custom' : actualFormat}
                onChange={(event) => change({ format: event.currentTarget.value === 'custom' ? '' : event.currentTarget.value })}>
                {extendFormats.map((format) => <option key={format} value={format}>{format}</option>)}
                {draft.type === 1 && <option value="custom">กำหนดเอง</option>}
              </select>
              {customFormat && <label className="grid gap-1">รูปแบบเวลาที่กำหนดเอง
                <input className="input-field min-w-0" value={draft.format ?? ''} onChange={(event) => change({ format: event.currentTarget.value })} />
              </label>}
            </div>
          )}
          {draft.type === 5 && <label className="grid gap-1">เวลาที่ต้องการนับถอยหลังถึง
            <input type="time" step={1} className="input-field min-w-0" value={draft.fixedTime ?? ''}
              onChange={(event) => change({ fixedTime: event.currentTarget.value })} />
          </label>}
          {draft.type === 6 && <label className="grid gap-1">ระยะเวลา (ชั่วโมง:นาที:วินาที)
            <input className="input-field min-w-0" value={draft.fixedTime ?? ''}
              onChange={(event) => change({ fixedTime: event.currentTarget.value })} />
          </label>}
          {isAlertCountdown(draft) && <label className="flex gap-2">
            <input type="checkbox" checked={Boolean(draft.allowOverrun)} onChange={(event) => change({ allowOverrun: Number(event.currentTarget.checked) })} />
            นับต่อเป็นค่าติดลบเมื่อหมดเวลา
          </label>}
          {error && <p role="alert" className="text-xs text-[var(--status-error-text)]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={remember}>ใช้โทเค็นนี้</button>
            <button type="button" className="btn-ghost" onClick={() => { setDraft(undefined); setError('') }}>ยกเลิกแก้โทเค็น</button>
          </div>
        </fieldset>}
        {tokens.some(serviceCountdown) && <ServiceIntervalFields intervals={settings?.serviceIntervals ?? []} onChange={onIntervalsChange} />}
      </fieldset>
    </details>
  )
}

function AlertResourcePicker({ catalogs, output, tokens, onCopyToken, onCopyIntervals }: {
  catalogs: AlertResourceCatalog[]
  output: AlertOutput
  tokens: AlertToken[]
  onCopyToken: (token: AlertToken) => void
  onCopyIntervals: (intervals: AlertServiceInterval[]) => void
}) {
  const [catalogId, setCatalogId] = useState('')
  const [tokenId, setTokenId] = useState('')
  const [status, setStatus] = useState('')
  const controlId = useId()
  const catalog = catalogs.find((item) => item.id === catalogId) ?? catalogs[0]
  const options = catalog.tokens.filter((entry) => entry.output === output).map(({ token }) => token)
  const selected = options.find((token) => token.id === tokenId)

  function copyToken(token: AlertToken) {
    const original = token.name.replace(/[{}\r\n\0]/g, ' ').trim().slice(0, 80) || token.id
    const names = new Set(tokens.map((local) => local.name.trim().toLowerCase()))
    let name = original
    for (let index = 2; names.has(name.toLowerCase()); index++) {
      const suffix = ` (${index})`
      name = original.slice(0, 80 - suffix.length) + suffix
    }
    onCopyToken({ ...token, id: crypto.randomUUID(), uid: null, name })
    setStatus(`เพิ่มโทเค็น ${name} แล้ว`)
  }

  return <fieldset className="grid min-w-0 gap-2 border-b border-[var(--border-subtle)] pb-3!">
    <legend className="font-medium">ใช้ข้อมูลจาก EasyWorship</legend>
    <div className="grid min-w-0 gap-1">
      <label htmlFor={`${controlId}-catalog`}>คลังจาก EasyWorship</label>
      <select id={`${controlId}-catalog`} className="input-field min-w-0" value={catalog.id} onChange={(event) => {
        setCatalogId(event.currentTarget.value)
        setTokenId('')
        setStatus('')
      }}>
        {catalogs.map((item) => <option key={item.id} value={item.id}>{item.sourceName}</option>)}
      </select>
    </div>
    {options.length > 0 && <>
      <div className="grid min-w-0 gap-1">
        <label htmlFor={`${controlId}-token`}>โทเค็นจากคลัง</label>
        <select id={`${controlId}-token`} className="input-field min-w-0" value={selected?.id ?? ''}
          onChange={(event) => { setTokenId(event.currentTarget.value); setStatus('') }}>
          <option value="">เลือกโทเค็น</option>
          {options.map((token) => <option key={token.id} value={token.id}>{token.name || token.id} · {nativeAlertTokenNames[token.type ?? -1] ?? 'EasyWorship'}</option>)}
        </select>
      </div>
      <button type="button" className="btn-secondary justify-self-start" disabled={!selected} onClick={() => selected && copyToken(selected)}>คัดลอกโทเค็นเข้าเทมเพลต</button>
    </>}
    {catalog.serviceIntervals.length > 0 && <button type="button" className="btn-secondary justify-self-start" onClick={() => {
      onCopyIntervals(catalog.serviceIntervals)
      setStatus(`ใช้เวลานมัสการ ${catalog.serviceIntervals.length} ช่วงจากคลังแล้ว`)
    }}>ใช้เวลานมัสการ {catalog.serviceIntervals.length} ช่วงจากคลัง</button>}
    {status && <p role="status" className="text-xs!">{status}</p>}
  </fieldset>
}
