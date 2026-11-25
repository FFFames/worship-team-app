/** Controls each native NDI output independently from the presentation console. */

import { useEffect, useId, useState } from 'react'
import { outputLabels, type OutputName } from '../utils/outputSettings'

type NdiSource = OutputName
type NdiHeight = 720 | 1080
type NdiPreferences = { height: NdiHeight; audio: boolean }
type NdiStatus =
  | { state: 'idle'; source?: NdiSource }
  | { state: 'starting' | 'live'; source: NdiSource; height: NdiHeight; name: string; audio?: boolean }
  | { state: 'error'; source?: NdiSource; error: string }

declare global {
  interface Window {
    worshipNdi?: {
      status: (source?: NdiSource) => Promise<NdiStatus>
      start: (options: { source: NdiSource; height: NdiHeight; session: string; audio?: boolean }) => Promise<NdiStatus>
      stop: (source?: NdiSource) => Promise<NdiStatus>
      subscribe: (listener: (status: NdiStatus) => void) => () => void
    }
  }
}

const errors: Record<string, string> = {
  helper: 'ยังไม่ได้สร้างโปรแกรมส่ง NDI ให้รัน npm --prefix desktop run build:ndi',
  runtime: 'เปิด NDI Runtime 6 ไม่ได้ ตรวจการติดตั้ง NDI Runtime ให้ตรงกับเครื่องนี้',
  publisher: 'โปรแกรมส่ง NDI หยุดทำงาน ลองเริ่มส่งใหม่',
  surface: 'เปิดจอสำหรับส่งภาพ NDI ไม่ได้',
  audio: 'เปิดเสียงสำหรับ NDI ไม่สำเร็จ ลองส่งเฉพาะภาพหรือเปิดใหม่',
  timeout: 'รอโปรแกรม NDI หรือภาพจากจอนานเกินกำหนด',
  settings: 'ตั้งค่าการส่ง NDI ไม่สำเร็จ กรุณาเปิดหน้าควบคุมรายการใหม่',
}

const sources = ['live', 'alternate', 'stage'] as const satisfies readonly NdiSource[]
type NdiBridge = NonNullable<Window['worshipNdi']>
const idle: NdiStatus = { state: 'idle' }

function preferenceKey(source: NdiSource) {
  return `worshipteam.ndiOutput.${source}.v1`
}

function readPreferences(source: NdiSource): NdiPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey(source)) ?? 'null')
    return { height: saved?.height === 720 ? 720 : 1080, audio: source !== 'stage' && saved?.audio === true }
  } catch {
    return { height: 1080, audio: false }
  }
}

export function PresentationNdiControl({ session }: { session: string }) {
  const bridge = window.worshipNdi
  const [statuses, setStatuses] = useState<Partial<Record<NdiSource, NdiStatus>>>({})
  useEffect(() => {
    if (!bridge) return
    let active = true
    const received = new Set<NdiSource>()
    const unsubscribe = bridge.subscribe((next) => {
      if (!next.source) return
      const source = next.source
      received.add(source)
      setStatuses((previous) => ({ ...previous, [source]: next }))
    })
    for (const source of sources) {
      void bridge.status(source).then((next) => {
        if (active && !received.has(source) && (!next.source || next.source === source)) {
          setStatuses((previous) => ({ ...previous, [source]: next }))
        }
      }).catch(() => {
        if (active && !received.has(source)) setStatuses((previous) => ({
          ...previous, [source]: { state: 'error', error: 'publisher' },
        }))
      })
    }
    return () => {
      active = false
      unsubscribe()
    }
  }, [bridge])
  if (!bridge) return null

  const active = sources.filter((source) => statuses[source]?.state === 'live').length
  return (
    <details className="mb-3! rounded-xl border border-[var(--border-subtle)] p-3!">
      <summary className="cursor-pointer font-medium">
        ส่งภาพผ่าน NDI{active > 0 && ` · กำลังส่ง ${active} จอ`}
      </summary>
      <div className="mt-3! grid gap-3">
        {sources.map((source) => (
          <NdiOutputRow key={source} bridge={bridge} source={source} session={session} status={statuses[source] ?? idle} />
        ))}
      </div>
    </details>
  )
}

function NdiOutputRow({ bridge, source, session, status }: {
  bridge: NdiBridge
  source: NdiSource
  session: string
  status: NdiStatus
}) {
  const resolutionField = useId()
  const label = outputLabels[source]
  const [preferences, setPreferences] = useState(() => readPreferences(source))
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string>()

  function updatePreferences(next: NdiPreferences) {
    setPreferences(next)
    try {
      localStorage.setItem(preferenceKey(source), JSON.stringify(next))
    } catch {
      // The operator can still use these settings for this presentation.
    }
  }

  const running = status.state === 'starting' || status.state === 'live'
  const height = running ? status.height : preferences.height
  const audio = running ? Boolean(status.audio) : preferences.audio
  const action = running ? 'หยุดส่ง NDI' : 'เริ่มส่ง NDI'
  async function toggle() {
    if (busy) return
    setBusy(true)
    setActionError(undefined)
    try {
      const next = await (running ? bridge.stop(source) : bridge.start({ source, ...preferences, session }))
      if (next.state === 'error') setActionError(next.error)
    } catch {
      setActionError('publisher')
    } finally {
      setBusy(false)
    }
  }

  const error = actionError ?? (status.state === 'error' ? status.error : undefined)
  return (
    <fieldset className="min-w-0 rounded-lg border border-[var(--border-subtle)] px-3! pb-3!">
      <legend className="px-1! text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1 text-sm">
          <label htmlFor={resolutionField}>ความละเอียด</label>
          <select id={resolutionField} className="input-field" value={height} disabled={running || busy}
            onChange={(event) => updatePreferences({ ...preferences, height: event.target.value === '720' ? 720 : 1080 })}>
            <option value="720">720p30</option>
            <option value="1080">1080p30</option>
          </select>
        </div>
        {source !== 'stage' && (
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={audio} disabled={running || busy}
              onChange={(event) => updatePreferences({ ...preferences, audio: event.target.checked })} />
            ส่งเสียงจากคิว
          </label>
        )}
        <button type="button" className="btn-secondary" disabled={busy} aria-label={`${action} · ${label}`}
          onClick={() => void toggle()}>{action}</button>
      </div>
      {error && !busy && <p role="alert" className="mt-2! text-sm text-[var(--status-error-text)]">{errors[error] ?? errors.publisher}</p>}
      {running && <p role="status" className="mt-2! text-sm tabular-nums text-[var(--fg-secondary)]">
        {status.state === 'live'
          ? `${status.name} · ${height}p30 · ${audio ? 'ส่งภาพและเสียง' : 'ส่งเฉพาะภาพ'}`
          : 'กำลังเปิดจอสำหรับ NDI'}
      </p>}
    </fieldset>
  )
}
