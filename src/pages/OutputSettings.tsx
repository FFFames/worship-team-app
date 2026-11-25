import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTextEffectsFields } from '../components/AlertTextEffectsFields'
import { FoldbackAppearanceFields, FoldbackContentFields, FoldbackServiceFields } from '../components/FoldbackAppearanceFields'
import { useOutputSettings } from '../hooks/useOutputSettings'
import { defaultOutputSettings, defaultScriptureMinFontRatio, defaultScriptureReferenceInset, isScriptureOutputSettings, maxOutputMargin, outputAppearanceKeys, outputLabels, outputNames,
  outputSides, outputWindows, parseEasyWorshipOutputSettings, sameFoldbackAppearance, sameFoldbackService, sameScriptureOutput,
  scriptureFontHeight, scriptureFontRoles, scriptureFontSize, scriptureReferenceInsetOptions, scriptureReferenceLabels, scriptureReferenceModes, type OutputAppearanceKey, type OutputName,
  type ScriptureFont, type ScriptureOutputSettings } from '../utils/outputSettings'
import { foldbackContentRoles, validFoldbackAppearance, validFoldbackContentSettings, validFoldbackServiceSettings,
  type FoldbackContentRole, type FoldbackContentSettings } from '../utils/foldbackAppearance'
import { readOutputSettings, saveOutputSettings } from '../utils/outputSettingsStorage'
import { loadOutputDisplays, matchOutputDisplay, outputDisplayKey, outputDisplayReference, screenManagementSupported,
  type ConnectedDisplay, type DisplayAccess } from '../utils/outputWindows'

const sideLabels = { top: 'ด้านบน', right: 'ด้านขวา', bottom: 'ด้านล่าง', left: 'ด้านซ้าย' }
const scriptureFontLabels = { text: 'ข้อความพระคัมภีร์', number: 'เลขข้อพระคัมภีร์', reference: 'ชื่ออ้างอิง' }

function ScriptureFontFields({ title, value, onChange }: { title: string; value?: ScriptureFont; onChange: (font?: ScriptureFont) => void }) {
  function change(patch: ScriptureFont) {
    const font = { ...value, ...patch }
    for (const key of Object.keys(font) as (keyof ScriptureFont)[]) {
      if (font[key] === undefined) delete font[key]
    }
    onChange(Object.keys(font).length ? font : undefined)
  }

  return <fieldset className="grid min-w-0 grid-cols-2 gap-2 rounded-lg border border-[var(--border-subtle)] p-3!">
    <legend className="px-1! text-sm font-medium">{title}</legend>
    <label className="col-span-2 grid min-w-0 gap-1 text-sm">แบบอักษร
      <input className="input-field min-w-0" maxLength={80} value={value?.fontFamily ?? ''} placeholder="ตามธีม"
        onChange={(event) => change({ fontFamily: event.currentTarget.value || undefined })} />
    </label>
    <label className="grid min-w-0 gap-1 text-sm">ขนาด (% ของธีม)
      <input className="input-field min-w-0" type="number" min={scriptureFontSize.min} max={scriptureFontSize.max}
        value={value?.sizeScale === undefined ? '' : Math.round(value.sizeScale * 100)} placeholder="100"
        onChange={(event) => {
          const sizeScale = event.currentTarget.value ? event.currentTarget.valueAsNumber / 100 : undefined
          change({ sizeScale, ...(sizeScale === undefined ? {} : { fontRatio: undefined }) })
        }} />
    </label>
    <label className="grid min-w-0 gap-1 text-sm">ขนาด (% ของความสูงจอ)
      <input className="input-field min-w-0" type="number" min={scriptureFontHeight.min} max={scriptureFontHeight.max} step="any"
        value={value?.fontRatio === undefined ? '' : Number((value.fontRatio * 100).toFixed(5))} placeholder="ตามธีม"
        onChange={(event) => {
          const fontRatio = event.currentTarget.value ? event.currentTarget.valueAsNumber / 100 : undefined
          change({ fontRatio, ...(fontRatio === undefined ? {} : { sizeScale: undefined }) })
        }} />
    </label>
    <div className="col-span-2 grid min-w-0 gap-1 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(value?.color)}
          onChange={(event) => change({ color: event.currentTarget.checked ? '#ffffff' : undefined })} />
        กำหนดสี
      </label>
      <input className="h-10 w-full rounded border border-[var(--border-subtle)] enabled:cursor-pointer" type="color"
        aria-label="สีตัวอักษร" disabled={!value?.color}
        value={value?.color ?? '#ffffff'} onChange={(event) => change({ color: event.currentTarget.value })} />
    </div>
    {(['bold', 'italic'] as const).map((key) => <label key={key} className="grid min-w-0 gap-1 text-sm">
      {key === 'bold' ? 'ตัวหนา' : 'ตัวเอียง'}
      <select aria-label={key === 'bold' ? 'ตัวหนา' : 'ตัวเอียง'} className="input-field min-w-0"
        value={value?.[key] === undefined ? '' : String(value[key])} onChange={(event) => {
        const option = event.currentTarget.value
        change({ [key]: option ? option === 'true' : undefined })
      }}>
        <option value="">ตามธีม</option>
        <option value="true">เปิด</option>
        <option value="false">ปิด</option>
      </select>
    </label>)}
    <div className="col-span-2 min-w-0 text-sm">
      <AlertTextEffectsFields value={value?.effects} onChange={(effects) => change({ effects })} />
    </div>
    <button type="button" className="btn-ghost col-span-2 justify-self-start" disabled={!value} onClick={() => onChange()}>
      ใช้ฟอนต์ตามธีม
    </button>
  </fieldset>
}

const displayGuidance = {
  ready: 'ตำแหน่งจอจะมีผลเมื่อเปิดหน้าต่างจอครั้งถัดไป กด F ในหน้าต่างจอเพื่อสลับเต็มจอ',
  prompt: 'กดค้นหาจอและอนุญาตให้เบราว์เซอร์เห็นจอที่เชื่อมต่อ',
  denied: 'เปิดสิทธิ์จัดการหน้าต่างในการตั้งค่าเว็บไซต์ของเบราว์เซอร์ แล้วกดค้นหาจออีกครั้ง',
  unsupported: 'เบราว์เซอร์นี้เปิดหน้าต่างจอแบบปกติ ลากหน้าต่างไปวางบนจอที่ต้องการได้',
}

function displayLabel(screen: ConnectedDisplay) {
  const name = screen.label || (screen.isPrimary ? 'จอหลัก' : 'จอภายนอก')
  return `${name} · ${screen.width} × ${screen.height} (${screen.left}, ${screen.top})`
}

function mergeFoldbackContent(saved: FoldbackContentSettings, draft: FoldbackContentSettings, changed: Set<FoldbackContentRole>) {
  const updated = { ...saved }
  for (const role of changed) {
    if (draft[role] === undefined) delete updated[role]
    else updated[role] = draft[role]
  }
  return updated
}

export default function OutputSettingsPage() {
  const saved = useOutputSettings()
  const [draft, setDraft] = useState(saved)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const lastSaved = useRef(saved)
  const pendingAppearance = useRef(new Set<OutputAppearanceKey>())
  const pendingFoldbackContent = useRef(new Set<FoldbackContentRole>())
  const [access, setAccess] = useState<DisplayAccess>(() => ({ state: screenManagementSupported() ? 'prompt' : 'unsupported' }))
  const [screens, setScreens] = useState<ConnectedDisplay[]>([])
  const [discovering, setDiscovering] = useState(false)
  const discovery = useRef(0)
  const fillDisplay = draft.alphaSource && draft.displays[draft.alphaSource]
  const keyDisplay = draft.displays.key
  const sameDisplay = fillDisplay && keyDisplay && outputDisplayKey(fillDisplay) === outputDisplayKey(keyDisplay)

  useEffect(() => {
    const previous = lastSaved.current
    lastSaved.current = saved
    setDraft((current) => {
      function margins(output: OutputName) {
        if (pendingAppearance.current.has(output)) return current[output]
        const merged = { ...saved[output] }
        for (const side of outputSides) {
          if (current[output][side] !== previous[output][side]) merged[side] = current[output][side]
        }
        return merged
      }
      const alternateLayers = { ...saved.alternateLayers }
      for (const layer of ['background', 'foreground'] as const) {
        if (pendingAppearance.current.has('alternateLayers') || current.alternateLayers[layer] !== previous.alternateLayers[layer]) {
          alternateLayers[layer] = current.alternateLayers[layer]
        }
      }
      const songLabels = { ...saved.songLabels }
      const scripture = { ...saved.scripture }
      for (const output of ['live', 'alternate'] as const) {
        if (current.songLabels[output] !== previous.songLabels[output]) songLabels[output] = current.songLabels[output]
        if (pendingAppearance.current.has('scripture') || !sameScriptureOutput(current.scripture[output], previous.scripture[output])) {
          scripture[output] = current.scripture[output]
        }
      }
      const foldback = pendingAppearance.current.has('foldback') || !sameFoldbackAppearance(current.foldback, previous.foldback)
        ? current.foldback : saved.foldback
      const foldbackService = pendingAppearance.current.has('foldbackService') || !sameFoldbackService(current.foldbackService, previous.foldbackService)
        ? current.foldbackService : saved.foldbackService
      const foldbackContent = mergeFoldbackContent(saved.foldbackContent, current.foldbackContent, pendingFoldbackContent.current)
      return { ...current, live: margins('live'), stage: margins('stage'), alternate: margins('alternate'), alternateLayers, songLabels, scripture, foldback, foldbackService, foldbackContent }
    })
  }, [saved])

  useEffect(() => {
    const version = ++discovery.current
    void loadOutputDisplays().then((result) => { if (discovery.current === version) setAccess(result) })
    return () => { discovery.current++ }
  }, [])

  useEffect(() => {
    if (access.state !== 'ready') { setScreens([]); return }
    const { details } = access
    let observed: readonly ConnectedDisplay[] = []
    function update() {
      for (const screen of observed) screen.removeEventListener('change', update)
      observed = details.screens
      setScreens([...observed])
      for (const screen of observed) screen.addEventListener('change', update)
    }
    update()
    details.addEventListener('screenschange', update)
    return () => {
      details.removeEventListener('screenschange', update)
      for (const screen of observed) screen.removeEventListener('change', update)
    }
  }, [access])

  async function discoverDisplays() {
    const version = ++discovery.current
    setDiscovering(true)
    const result = await loadOutputDisplays(true)
    if (discovery.current !== version) return
    setAccess(result)
    setDiscovering(false)
  }

  async function importSettings(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    event.currentTarget.value = ''
    setError('')
    setStatus('')
    if (file.size > 1024 * 1024) {
      setError('ไฟล์ตั้งค่าต้องมีขนาดไม่เกิน 1 MB')
      return
    }

    setReading(true)
    try {
      const imported = parseEasyWorshipOutputSettings(new Uint8Array(await file.arrayBuffer()))
      const outputs = outputNames.filter((output) => Object.keys(imported.margins[output]).length > 0
        || (output === 'alternate' && Object.keys(imported.alternateLayers).length > 0))
      if (outputs.length === 0) {
        setError('ไม่พบค่าระยะขอบหรือเลเยอร์จอที่รองรับในไฟล์นี้')
        return
      }
      for (const output of outputNames) if (Object.keys(imported.margins[output]).length) pendingAppearance.current.add(output)
      if (Object.keys(imported.alternateLayers).length) pendingAppearance.current.add('alternateLayers')
      setDraft((current) => ({
        ...current,
        live: { ...current.live, ...imported.margins.live },
        stage: { ...current.stage, ...imported.margins.stage },
        alternate: { ...current.alternate, ...imported.margins.alternate },
        alternateLayers: { ...current.alternateLayers, ...imported.alternateLayers },
      }))
      setStatus(`อ่านค่า${outputs.map((output) => outputLabels[output]).join('และ')}แล้ว ตรวจค่าและกดบันทึกเพื่อใช้กับจอ`)
    } catch {
      setError('อ่านไฟล์ตั้งค่าไม่ได้ กรุณาเลือกไฟล์อีกครั้ง')
    } finally {
      setReading(false)
    }
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('')
    if (!validFoldbackAppearance(draft.foldback)) {
      setError('ตรวจแบบอักษรและรูปแบบนาฬิกาของจอเวทีอีกครั้ง')
      return
    }
    if (!validFoldbackServiceSettings(draft.foldbackService)) {
      setError('ตรวจรูปแบบและช่วงเวลานมัสการบนจอเวทีอีกครั้ง')
      return
    }
    if (!validFoldbackContentSettings(draft.foldbackContent)) {
      setError('ตรวจแบบอักษร ระยะขอบ และคำที่ใช้ตัวพิมพ์ใหญ่บนจอเวทีอีกครั้ง')
      return
    }
    if (!isScriptureOutputSettings(draft.scripture.live) || !isScriptureOutputSettings(draft.scripture.alternate)) {
      setError('ตรวจชื่อและขนาดแบบอักษรของข้อพระคัมภีร์อีกครั้ง')
      return
    }
    try {
      const foldbackContent = mergeFoldbackContent(readOutputSettings().foldbackContent, draft.foldbackContent, pendingFoldbackContent.current)
      saveOutputSettings({ ...draft, foldbackContent }, pendingAppearance.current)
      pendingAppearance.current.clear()
      pendingFoldbackContent.current.clear()
      const placementChanged = outputWindows.some((output) => JSON.stringify(draft.displays[output]) !== JSON.stringify(saved.displays[output]))
      setStatus(placementChanged ? 'บันทึกแล้ว ตำแหน่งจอจะมีผลเมื่อเปิดหน้าต่างจอครั้งถัดไป'
        : 'บันทึกแล้ว จอที่เปิดอยู่ในเบราว์เซอร์นี้จะใช้ค่าใหม่ทันที')
    } catch {
      setError('เบราว์เซอร์บันทึกการตั้งค่าไม่ได้')
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="page-header mb-0!">
        <div className="page-title">
          <h1>ตั้งค่าจอ</h1>
          <p>เลือกจอจริง ระยะขอบเป็นพิกเซล และเลเยอร์จอถ่ายทอดสดสำหรับเบราว์เซอร์นี้</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/settings/themes" className="btn-secondary">ธีมเริ่มต้นของจอ</Link>
          <Link to="/import/easyworship" className="btn-secondary">ย้ายโปรไฟล์ EasyWorship</Link>
        </div>
      </header>
      <form className="flex flex-col gap-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4! sm:p-6!" onSubmit={apply}>
        <fieldset className="grid min-w-0 gap-3 border-b border-[var(--border-subtle)] pb-4!" disabled={reading}>
          <legend className="mb-2! text-base font-medium">หน้าต่างบนจอจริง</legend>
          <p role="status" id="output-display-guidance" className="text-sm text-[var(--fg-secondary)]">
            {discovering ? 'กำลังค้นหาจอที่เชื่อมต่อ…' : displayGuidance[access.state]}
          </p>
          {access.state !== 'unsupported' && (
            <button className="btn-secondary justify-self-start" type="button" onClick={() => void discoverDisplays()} disabled={discovering}>
              ค้นหาจอที่เชื่อมต่อ
            </button>
          )}
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {outputWindows.map((output) => {
              const stored = draft.displays[output]
              const available = matchOutputDisplay(stored, screens)
              const selected = available ?? stored
              return (
                <label key={output} className="flex min-w-0 flex-col gap-1 text-sm">{outputLabels[output]}
                  <select className="input-field min-w-0" aria-label={`เลือก${outputLabels[output]}`} aria-describedby="output-display-guidance"
                    value={selected ? outputDisplayKey(selected) : ''} onChange={(event) => {
                      const key = event.currentTarget.value
                      const screen = screens.find((item) => outputDisplayKey(item) === key)
                      setDraft((current) => ({ ...current, displays: { ...current.displays, [output]: screen ? outputDisplayReference(screen) : undefined } }))
                      setStatus('')
                    }}>
                    <option value="">ตำแหน่งปกติ</option>
                    {stored && !available && <option value={outputDisplayKey(stored)}>{stored.label || 'จอที่บันทึกไว้'} · รอเชื่อมต่อ</option>}
                    {screens.map((screen) => <option key={outputDisplayKey(screen)} value={outputDisplayKey(screen)}>{displayLabel(screen)}</option>)}
                  </select>
                </label>
              )
            })}
          </div>
        </fieldset>
        <label className="flex min-w-0 flex-col gap-2 text-sm">
          นำเข้าจาก ComputerSettings.ini ของ EasyWorship
          <input type="file" accept=".ini" className="input-field min-w-0" onChange={importSettings} disabled={reading} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          {outputNames.map((output) => (
            <fieldset key={output} disabled={reading} className="grid min-w-0 grid-cols-2 gap-3">
              <legend className="mb-2! text-base font-medium">{outputLabels[output]}</legend>
              {outputSides.map((side) => (
                <label key={side} className="flex min-w-0 flex-col gap-1 text-sm">
                  {sideLabels[side]}
                  <input type="number" required min={0} max={maxOutputMargin} step={1}
                    className="input-field min-w-0" value={Number.isNaN(draft[output][side]) ? '' : draft[output][side]}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber
                      setDraft((current) => ({ ...current, [output]: { ...current[output], [side]: value } }))
                      setStatus('')
                    }} />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <FoldbackAppearanceFields value={draft.foldback} disabled={reading} onChange={(patch) => {
          pendingAppearance.current.add('foldback')
          setDraft((current) => ({ ...current, foldback: { ...current.foldback, ...patch } }))
          setStatus('')
        }} />
        <FoldbackServiceFields value={draft.foldbackService} disabled={reading} onChange={(patch) => {
          pendingAppearance.current.add('foldbackService')
          setDraft((current) => ({ ...current, foldbackService: { ...current.foldbackService, ...patch } }))
          setStatus('')
        }} />
        <FoldbackContentFields value={draft.foldbackContent} disabled={reading} onChange={(role, style) => {
          pendingAppearance.current.add('foldbackContent')
          pendingFoldbackContent.current.add(role)
          setDraft((current) => ({ ...current, foldbackContent: { ...current.foldbackContent, [role]: style } }))
          setStatus('')
        }} />
        <fieldset disabled={reading} className="grid gap-2">
          <legend className="mb-2! text-base font-medium">ป้ายชื่อท่อนเพลง</legend>
          {(['live', 'alternate'] as const).map((output) => (
            <label key={output} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.songLabels[output]} onChange={(event) => {
                const enabled = event.currentTarget.checked
                setDraft((current) => ({ ...current, songLabels: { ...current.songLabels, [output]: enabled } }))
                setStatus('')
              }} />
              แสดงป้ายชื่อท่อนเพลงบน{outputLabels[output]}
            </label>
          ))}
        </fieldset>
        <fieldset id="scripture-output" disabled={reading} className="grid min-w-0 gap-3">
          <legend className="mb-2! text-base font-medium">การแสดงข้อพระคัมภีร์</legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {(['live', 'alternate'] as const).map((output) => {
              const { reference, completePassage, verseNumbers, abbreviateBooks, fonts, referenceInsets, pagination } = draft.scripture[output]
              const paginationMode = pagination?.flow === false ? 'single' : Object.keys(pagination ?? {}).length ? 'auto' : 'verse'
              function change(update: Partial<ScriptureOutputSettings>) {
                setDraft((current) => ({ ...current, scripture: { ...current.scripture, [output]: { ...current.scripture[output], ...update } } }))
                setStatus('')
              }
              return <div className="grid min-w-0 gap-2" key={output}>
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <label htmlFor={`scripture-reference-${output}`}>ตำแหน่งอ้างอิงบน{outputLabels[output]}</label>
                  <select id={`scripture-reference-${output}`} className="input-field min-w-0" value={reference} onChange={(event) => {
                    const value = scriptureReferenceModes.find((mode) => mode === event.currentTarget.value)
                    if (value) change({ reference: value })
                  }}>
                    {scriptureReferenceModes.map((mode) => <option key={mode} value={mode}>{scriptureReferenceLabels[mode]}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={completePassage} disabled={reference === 'hidden' || reference === 'after-passage'}
                    onChange={(event) => change({ completePassage: event.currentTarget.checked })} />
                  ใช้อ้างอิงทั้งตอนบน{outputLabels[output]}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(verseNumbers)} disabled={reference === 'reference-only'}
                    onChange={(event) => change({ verseNumbers: event.currentTarget.checked })} />
                  แสดงเลขข้อพระคัมภีร์บน{outputLabels[output]}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(abbreviateBooks)} disabled={reference === 'hidden'}
                    onChange={(event) => change({ abbreviateBooks: event.currentTarget.checked })} />
                  ใช้ชื่อย่อหนังสือพระคัมภีร์บน{outputLabels[output]}
                </label>
                {scriptureReferenceInsetOptions.map(({ label, sides: [start, end] }) => (
                  <label key={label} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(referenceInsets?.[start] || referenceInsets?.[end])}
                      disabled={reference === 'hidden' || (start === 'top' && reference === 'reference-only')}
                      onChange={(event) => {
                        const inset = event.currentTarget.checked ? defaultScriptureReferenceInset : 0
                        change({ referenceInsets: { ...referenceInsets, [start]: inset, [end]: inset } })
                      }} />
                    {label}บน{outputLabels[output]}
                  </label>
                ))}
                <details className="min-w-0">
                  <summary className="cursor-pointer py-1! text-sm font-medium">แบบอักษรบน{outputLabels[output]}</summary>
                  <div className="mt-2! grid min-w-0 gap-2">
                    {scriptureFontRoles.map((role) => <ScriptureFontFields key={role} title={scriptureFontLabels[role]} value={fonts?.[role]}
                      onChange={(font) => {
                        const updated = { ...fonts }
                        if (font) updated[role] = font
                        else delete updated[role]
                        change({ fonts: updated })
                      }} />)}
                  </div>
                </details>
                {output === 'live' && <fieldset className="grid min-w-0 gap-2 rounded-lg border border-[var(--border-subtle)] p-3!">
                  <legend className="px-1! text-sm font-medium">การแบ่งสไลด์จากคลังพระคัมภีร์</legend>
                  <label className="grid min-w-0 gap-1 text-sm" htmlFor="scripture-pagination-mode">วิธีแบ่งสไลด์เริ่มต้น</label>
                  <select id="scripture-pagination-mode" className="input-field min-w-0" value={paginationMode}
                    onChange={(event) => {
                      const mode = event.currentTarget.value
                      change({ pagination: mode === 'verse' ? {} : { ...pagination, flow: mode === 'auto' } })
                    }}>
                    <option value="verse">แยกทีละข้อ</option>
                    <option value="auto">แบ่งอัตโนมัติตามพื้นที่จอ</option>
                    <option value="single">รวมในสไลด์เดียว</option>
                  </select>
                  {paginationMode === 'auto' && <>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={Boolean(pagination?.breakOnVerse)}
                        onChange={(event) => change({ pagination: { ...pagination, breakOnVerse: event.currentTarget.checked } })} />
                      เริ่มข้อใหม่บนสไลด์ใหม่
                    </label>
                    <label className="grid min-w-0 gap-1 text-sm">ขนาดต่ำสุดก่อนแบ่ง (% ของความสูงจอ)
                      <input className="input-field min-w-0" type="number" min={scriptureFontHeight.min} max={scriptureFontHeight.max} step="any"
                        value={pagination?.minFontRatio === undefined ? '' : Number((pagination.minFontRatio * 100).toFixed(5))}
                        placeholder={(defaultScriptureMinFontRatio * 100).toFixed(1)}
                        onChange={(event) => {
                          const { minFontRatio: _previous, ...rest } = pagination ?? {}
                          change({ pagination: { ...rest, flow: true, ...(event.currentTarget.value
                            ? { minFontRatio: event.currentTarget.valueAsNumber / 100 } : {}) } })
                        }} />
                    </label>
                  </>}
                </fieldset>}
              </div>
            })}
          </div>
        </fieldset>
        <fieldset disabled={reading} className="grid gap-2">
          <legend className="mb-2! text-base font-medium">เลเยอร์จอถ่ายทอดสด</legend>
          {([
            ['background', 'ตามภาพพื้นหลังที่เปลี่ยนจากหน้าควบคุม'],
            ['foreground', 'แสดงสื่อด้านหน้าที่แนบกับสไลด์'],
          ] as const).map(([layer, label]) => (
            <label key={layer} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.alternateLayers[layer]} onChange={(event) => {
                const checked = event.currentTarget.checked
                setDraft((current) => ({ ...current, alternateLayers: { ...current.alternateLayers, [layer]: checked } }))
                setStatus('')
              }} />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset disabled={reading} className="grid gap-2">
          <legend className="mb-2! text-base font-medium">Alpha Key และ Fill</legend>
          <label className="flex max-w-sm flex-col gap-1 text-sm">
            แหล่งภาพ Fill
            <select className="input-field" aria-label="แหล่งภาพ Fill" value={draft.alphaSource ?? ''}
              onChange={(event) => {
                const selected = event.currentTarget.value
                setDraft((current) => ({ ...current, alphaSource: selected === 'live' || selected === 'alternate' ? selected : null }))
                setStatus('')
              }}>
              <option value="">ปิด</option>
              <option value="live">จอผู้ชม</option>
              <option value="alternate">จอถ่ายทอดสด</option>
            </select>
          </label>
          {draft.alphaSource && <p className="text-sm text-[var(--fg-secondary)]">
            เปิดจอ Fill และจอ Alpha Key จากหน้าควบคุม ตั้งจอทั้งสองให้มีความละเอียดและสเกลเท่ากัน แล้วกด F ในแต่ละหน้าต่าง
          </p>}
          {sameDisplay && <p role="status" className="text-sm text-[var(--fg-secondary)]">เลือกจอแยกสำหรับ Fill และ Alpha Key เพื่อส่งสองสัญญาณพร้อมกัน</p>}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={reading}>บันทึกค่าจอ</button>
          <button type="button" className="btn-secondary" disabled={reading} onClick={() => {
            pendingAppearance.current = new Set(outputAppearanceKeys)
            pendingFoldbackContent.current = new Set(foldbackContentRoles)
            setDraft(defaultOutputSettings)
            setError('')
            setStatus('คืนค่าเริ่มต้นแล้ว กดบันทึกเพื่อใช้กับจอ')
          }}>คืนค่าเริ่มต้น</button>
        </div>
        <p role="status" className="empty:hidden text-sm text-[var(--fg-secondary)]">{status}</p>
        {error && <p role="alert" className="text-sm text-[var(--fg-secondary)]">{error}</p>}
      </form>
    </main>
  )
}
