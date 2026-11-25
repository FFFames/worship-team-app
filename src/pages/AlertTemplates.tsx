import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAlertResourceCatalogs, useAlertTemplates } from '../hooks/useAlertTemplates'
import { alertOutputLabels, type AlertOutput, type AlertPlayback, type AlertResourceCatalog, type AlertTemplate } from '../types/alertTemplate'
import { addImportedAlertResourceCatalog, addImportedAlertTemplate, saveAlertTemplate } from '../utils/alertTemplateLibrary'
import { AlertPlaybackFields } from '../components/AlertPlaybackFields'
import { defaultAlertPlayback, templateAlertPlayback } from '../utils/alertPlayback'
import { alertTokenMarker, alertTokenSettings, findAlertEndToken, isAlertCountdown } from '../utils/alertTokens'
import { withEditedAlertTokens } from '../utils/alertTokenEditing'
import { AlertTokenEditor } from '../components/AlertTokenEditor'
import { AlertRichTextEditor } from '../components/AlertRichTextEditor'
import { formatAlertText, replaceAlertTextRange, trimAlertText, updateAlertText } from '../utils/alertTextEditing'
import { NurserySettingsForm } from '../components/NurserySettingsForm'
import { MessageAlertSettingsForm } from '../components/MessageAlertSettingsForm'

const initialDraft = { title: '', text: '', output: 'live' as AlertOutput, playback: defaultAlertPlayback }
const outputs: AlertOutput[] = ['live', 'stage', 'alternate']

export default function AlertTemplates() {
  const { templates, error: loadError } = useAlertTemplates()
  const { items: catalogs, error: catalogError } = useAlertResourceCatalogs()
  const [draft, setDraft] = useState<Omit<AlertTemplate, 'id'>>(initialDraft)
  const [editing, setEditing] = useState<string>()
  const [editorVersion, setEditorVersion] = useState(0)
  const [preview, setPreview] = useState<AlertTemplate[]>([])
  const [catalogPreview, setCatalogPreview] = useState<AlertResourceCatalog>()
  const [alertsFile, setAlertsFile] = useState<File | null>(null)
  const [intervalsFile, setIntervalsFile] = useState<File | null>(null)
  const alertsInput = useRef<HTMLInputElement>(null)
  const intervalsInput = useRef<HTMLInputElement>(null)
  const messageInput = useRef<HTMLTextAreaElement>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const tokenSettings = alertTokenSettings(draft)
  const countdowns = tokenSettings?.tokens.filter(isAlertCountdown) ?? []
  const endToken = findAlertEndToken(tokenSettings)

  function edit(template?: AlertTemplate) {
    setEditing(template?.id)
    setEditorVersion((current) => current + 1)
    setDraft(template ? { ...template, playback: templateAlertPlayback(template) } : initialDraft)
    setStatus('')
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = trimAlertText(draft)
    const title = draft.title.trim()
    const { text } = trimmed
    if (!title || !text || busy) return
    if (draft.tokenSettings && tokenSettings?.tokens.some((token) => token.type != null && token.type >= 2 && token.type <= 4
      && (token.id === endToken?.id && draft.playback?.endOnToken || text.includes(alertTokenMarker(token, tokenSettings.tokens))))
      && !tokenSettings.serviceIntervals?.length) {
      setError('เพิ่มช่วงเวลานมัสการรายสัปดาห์ก่อนใช้โทเค็นนับถอยหลังตามช่วงนมัสการ')
      return
    }
    const id = editing ?? crypto.randomUUID()
    setBusy(true)
    setStatus('')
    setError('')
    try {
      await saveAlertTemplate({ ...trimmed, id, title })
      setEditing(id)
      setStatus('บันทึกข้อความแล้ว')
    } catch {
      setError('บันทึกข้อความไม่ได้')
    } finally {
      setBusy(false)
    }
  }

  function insertToken(marker: string) {
    const input = messageInput.current
    if (!input) return
    const { selectionStart: start, selectionEnd: end } = input
    setDraft((current) => replaceAlertTextRange(current, { start, end }, marker))
    window.requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start + marker.length, start + marker.length)
    })
  }

  function chooseEndToken(id: string) {
    setDraft((current) => ({
      ...current,
      tokenSettings: { ...current.tokenSettings, tokens: alertTokenSettings(current)?.tokens ?? [], endToken: id },
    }))
  }

  function changePlayback(playback: AlertPlayback) {
    const selected = endToken?.id ?? countdowns[0]?.id
    setDraft((current) => ({
      ...current, playback,
      ...(playback.endOnToken && selected && !endToken ? {
        tokenSettings: { ...current.tokenSettings, tokens: alertTokenSettings(current)?.tokens ?? [], endToken: selected },
      } : {}),
    }))
  }

  async function inspect(file: File | null, intervals: File | null) {
    if (busy) return
    setBusy(true)
    setStatus('')
    setError('')
    setPreview([])
    setCatalogPreview(undefined)
    setWarnings([])
    try {
      if (!file && !intervals) return
      const { makeAlertResourceCatalog, readEasyWorshipAlerts, readEasyWorshipServiceIntervals } = await import('../utils/easyWorshipAlerts')
      const weeklyTimes = intervals ? await readEasyWorshipServiceIntervals(intervals).catch(() => {
        throw new Error('อ่าน ServiceIntervals.db ไม่สำเร็จ เลือกไฟล์จากชุดตัวเลือกเดียวกับ Alerts.db')
      }) : undefined
      const result = file ? await readEasyWorshipAlerts(file, undefined, weeklyTimes?.length ? weeklyTimes : undefined) : undefined
      const catalog = await makeAlertResourceCatalog('EasyWorship', result?.catalogTokens, weeklyTimes)
      const messages = result?.alerts ?? []
      const notices = result?.warnings ?? []
      setPreview(messages)
      setCatalogPreview(catalog)
      setWarnings(weeklyTimes?.length === 0 ? [...notices, 'ไม่พบเวลานมัสการรายสัปดาห์ใน ServiceIntervals.db'] : notices)
      if (messages.length) setStatus(`พบข้อความ ${messages.length} รายการ`)
      else if (!catalog) setStatus('ไม่พบข้อมูลสำหรับนำเข้าในไฟล์นี้')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อ่าน Alerts.db ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  function chooseAlerts(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    if (!file || busy) return
    setAlertsFile(file)
    void inspect(file, intervalsFile)
  }

  function chooseIntervals(file: File | null) {
    setIntervalsFile(file)
    void inspect(alertsFile, file)
  }

  async function importTemplates() {
    if ((!preview.length && !catalogPreview) || busy) return
    setBusy(true)
    setStatus('')
    setError('')
    let saved = 0
    let duplicate = 0
    let catalogStatus: string | undefined
    try {
      for (const template of preview) {
        if (await addImportedAlertTemplate(template) === 'saved') saved++
        else duplicate++
      }
      if (catalogPreview) {
        const result = await addImportedAlertResourceCatalog(catalogPreview)
        catalogStatus = result === 'saved' ? 'บันทึกคลังโทเค็นและเวลานมัสการแล้ว' : 'มีคลังโทเค็นและเวลานมัสการชุดนี้แล้ว'
      }
      setPreview([])
      setCatalogPreview(undefined)
    } catch {
      setError('นำเข้าได้บางส่วน กดนำเข้าอีกครั้งเพื่อลองรายการที่เหลือ')
    } finally {
      setStatus(preview.length ? `บันทึก ${saved} · มีอยู่แล้ว ${duplicate}` : catalogStatus ?? '')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="page-header mb-0!">
        <div className="page-title">
          <h1>คลังข้อความแจ้งเตือน</h1>
          <p>เลือกใช้ข้อความที่บันทึกไว้จากหน้าควบคุมการฉายในเบราว์เซอร์นี้</p>
        </div>
        <Link to="/import/easyworship" className="btn-secondary">ย้ายโปรไฟล์ EasyWorship</Link>
      </header>
      <section aria-label="นำเข้าข้อความจาก EasyWorship" className="surface grid min-w-0 gap-3 rounded-xl p-4!">
        <label className="grid min-w-0 gap-1 text-sm">
          นำเข้าจาก Alerts.db
          <input type="file" accept=".db" ref={alertsInput} disabled={busy} className="input-field min-w-0" onChange={chooseAlerts} />
        </label>
        {alertsFile && <button type="button" className="btn-ghost justify-self-start" disabled={busy} onClick={() => {
          if (alertsInput.current) alertsInput.current.value = ''
          setAlertsFile(null)
          void inspect(null, intervalsFile)
        }}>เอาไฟล์ข้อความออก</button>}
        <div className="grid min-w-0 gap-1 text-sm">
          <label className="grid min-w-0 gap-1">
            แนบ ServiceIntervals.db สำหรับเวลานมัสการ
            <input type="file" accept=".db" ref={intervalsInput} disabled={busy} aria-describedby="alert-service-file-help"
              className="input-field min-w-0" onChange={(event) => chooseIntervals(event.currentTarget.files?.[0] ?? null)} />
          </label>
          <p id="alert-service-file-help" className="text-[var(--fg-secondary)]">นำเข้าเวลานมัสการอย่างเดียวได้ ถ้าเลือก Alerts.db ด้วย ให้ใช้ไฟล์จากโฟลเดอร์เดียวกัน</p>
          {intervalsFile && <button type="button" className="btn-ghost justify-self-start" disabled={busy} onClick={() => {
            if (intervalsInput.current) intervalsInput.current.value = ''
            chooseIntervals(null)
          }}>เอาไฟล์เวลาออก</button>}
        </div>
        {(preview.length > 0 || catalogPreview) && (
          <>
            {preview.length > 0 && <ul className="max-h-48 overflow-y-auto">
              {preview.map((template) => <li key={template.id} className="text-sm! wrap-break-word">{template.title} · {alertOutputLabels[template.output]}</li>)}
            </ul>}
            {catalogPreview && <p className="text-sm!">โทเค็นใช้ซ้ำ {catalogPreview.tokens.length} รายการ · ช่วงเวลานมัสการ {catalogPreview.serviceIntervals.length} ช่วง</p>}
            <button type="button" className="btn-primary justify-self-start" disabled={busy} onClick={() => void importTemplates()}>
              {preview.length ? `นำเข้า ${preview.length} ข้อความ` : 'นำเข้าคลังโทเค็นและเวลานมัสการ'}
            </button>
          </>
        )}
        {warnings.length > 0 && <ul>{warnings.map((warning, index) => <li key={index} className="text-sm!">{warning}</li>)}</ul>}
      </section>
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <section aria-label="ข้อความที่บันทึก" className="surface flex min-w-0 flex-col gap-2 rounded-xl p-4!">
          <button type="button" className="btn-secondary self-start" disabled={busy} onClick={() => edit()}>สร้างข้อความ</button>
          {templates.map((template) => (
            <button type="button" key={template.id} aria-pressed={editing === template.id} disabled={busy}
              className="grid min-w-0 gap-1 rounded-lg border border-[var(--border-subtle)] p-2! text-left aria-pressed:border-[var(--accent)]"
              onClick={() => edit(template)}>
              <span className="wrap-break-word">{template.title}</span>
              <span className="text-xs text-[var(--fg-secondary)]">{alertOutputLabels[template.output]}</span>
            </button>
          ))}
          {!templates.length && !loadError && <p className="text-sm! text-[var(--fg-secondary)]">ยังไม่มีข้อความที่บันทึก</p>}
        </section>
        <form className="surface grid min-w-0 gap-3 self-start rounded-xl p-4!" onSubmit={(event) => void save(event)}>
          <h2 className="text-base!">{editing ? 'แก้ข้อความ' : 'ข้อความใหม่'}</h2>
          <label className="grid gap-1 text-sm">
            ชื่อข้อความ
            <input className="input-field" required value={draft.title} disabled={busy}
              onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })} />
          </label>
          <div className="grid gap-1 text-sm">
            <label htmlFor="alert-template-output">จอที่ใช้ข้อความ</label>
            <select id="alert-template-output" className="input-field" value={draft.output} disabled={busy}
              onChange={(event) => setDraft({ ...draft, output: event.currentTarget.value as AlertOutput })}>
              {outputs.map((output) => <option key={output} value={output}>{alertOutputLabels[output]}</option>)}
            </select>
          </div>
          <AlertRichTextEditor key={`text-${editorVersion}`} draft={draft} input={messageInput} disabled={busy}
            onTextChange={(text) => setDraft((current) => updateAlertText(current, text))}
            onFormat={(selection, style) => setDraft((current) => formatAlertText(current, selection, style))} />
          {catalogError && <p role="alert" className="text-xs!">อ่านคลังโทเค็นและเวลานมัสการไม่ได้</p>}
          <AlertTokenEditor key={`tokens-${editorVersion}`} settings={tokenSettings} disabled={busy} onInsert={insertToken}
            catalogs={catalogs} output={draft.output}
            onTokensChange={(tokens) => { setError(''); setDraft((current) => withEditedAlertTokens(current, tokens)) }}
            onIntervalsChange={(serviceIntervals) => {
              setError('')
              setDraft((current) => ({ ...current, tokenSettings: {
                tokens: alertTokenSettings(current)?.tokens ?? [],
                endToken: findAlertEndToken(alertTokenSettings(current))?.id ?? null,
                serviceIntervals,
              } }))
            }} />
          <AlertPlaybackFields prefix="template-alert" value={draft.playback ?? defaultAlertPlayback} disabled={busy}
            allowTokenEnd={countdowns.length > 0} onChange={changePlayback} />
          {draft.playback?.endOnToken && countdowns.length > 0 && <div className="grid gap-1 text-xs">
            <label htmlFor="template-alert-end-token">โทเค็นที่ใช้จบข้อความ</label>
            <select id="template-alert-end-token" className="input-field min-w-0" disabled={busy}
              value={endToken?.id ?? ''} onChange={(event) => chooseEndToken(event.currentTarget.value)}>
              {!endToken && <option value="" disabled>เลือกโทเค็น</option>}
              {countdowns.map((token) => <option key={token.id} value={token.id}>{alertTokenMarker(token, tokenSettings?.tokens ?? [])}</option>)}
            </select>
          </div>}
          {draft.source && <p className="text-xs! text-[var(--fg-secondary)]">จาก {draft.source.profileName}</p>}
          <button type="submit" className="btn-primary justify-self-start" disabled={busy || !draft.title.trim() || !draft.text.trim()}>บันทึกข้อความ</button>
        </form>
      </div>
      {status && <p role="status" className="text-sm!">{status}</p>}
      {(error || loadError) && <p role="alert" className="text-sm! text-[var(--status-error-text)]">{error || 'เปิดคลังข้อความไม่ได้'}</p>}
      <MessageAlertSettingsForm />
      <NurserySettingsForm />
    </main>
  )
}
