import { useState, type FormEvent } from 'react'
import { useMessageAlertSettings } from '../hooks/useMessageAlertSettings'
import { alertOutputLabels, type AlertOutput } from '../types/alertTemplate'
import { defaultMessageAlertStyle, messageAlertOutputs, saveMessageAlertSettings, validMessageAlertStyle, type MessageAlertStyle } from '../utils/messageAlertSettings'
import { AlertTextEffectsFields } from './AlertTextEffectsFields'

export function MessageAlertSettingsForm() {
  const [output, setOutput] = useState<AlertOutput>('live')
  const settings = useMessageAlertSettings()
  return (
    <section id="message-alert-settings" className="surface grid min-w-0 gap-4 rounded-xl p-4!" aria-labelledby="message-alert-settings-title">
      <h2 id="message-alert-settings-title" className="text-base! font-medium">ค่าเริ่มต้นข้อความแจ้งเตือน</h2>
      <div className="grid gap-1 text-sm">
        <label htmlFor="message-alert-output">จอที่จะตั้งค่า</label>
        <select id="message-alert-output" className="input-field w-fit" value={output} onChange={(event) => setOutput(event.currentTarget.value as AlertOutput)}>
          {messageAlertOutputs.map((key) => <option key={key} value={key}>{alertOutputLabels[key]}</option>)}
        </select>
      </div>
      <MessageAlertOutputForm key={output} output={output} style={settings[output] ?? defaultMessageAlertStyle[output]} />
    </section>
  )
}

function MessageAlertOutputForm({ output, style }: { output: AlertOutput; style: MessageAlertStyle }) {
  const [patch, setPatch] = useState<Partial<MessageAlertStyle>>({})
  const [result, setResult] = useState<'saved' | 'invalid' | 'failed'>()
  const draft = { ...style, ...patch }
  const fontPercent = draft.fontRatio === undefined ? '' : Number((draft.fontRatio * 100).toFixed(4))
  function change(update: Partial<MessageAlertStyle>) {
    setPatch((previous) => ({ ...previous, ...update }))
    setResult(undefined)
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const style = { ...draft, fontFamily: draft.fontFamily?.trim() || undefined }
    if (!validMessageAlertStyle(style)) {
      setResult('invalid')
      return
    }
    try {
      saveMessageAlertSettings({ [output]: style })
      setPatch({})
      setResult('saved')
    } catch { setResult('failed') }
  }
  return (
    <form onSubmit={save} className="grid max-w-xl gap-3 text-sm">
      <label className="flex gap-2"><input type="checkbox" checked={draft.enabled}
        onChange={(event) => change({ enabled: event.currentTarget.checked })} />แสดงข้อความบนจอนี้</label>
      <fieldset className="grid gap-1">
        <legend>ตำแหน่งข้อความ</legend>
        <label className="flex gap-2"><input type="radio" name="message-location" checked={draft.position === 'top'}
          onChange={() => change({ position: 'top' })} />บน</label>
        <label className="flex gap-2"><input type="radio" name="message-location" checked={draft.position === 'bottom'}
          onChange={() => change({ position: 'bottom' })} />ล่าง</label>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">สีข้อความ<input type="color" value={draft.textColor}
          onChange={(event) => change({ textColor: event.currentTarget.value })} /></label>
        <label className="grid gap-1">สีพื้นหลัง<input type="color" value={draft.backgroundColor}
          onChange={(event) => change({ backgroundColor: event.currentTarget.value })} /></label>
        <label className="grid min-w-0 gap-1">ความทึบพื้นหลัง (%)
          <input type="number" min={0} max={100} required className="input-field min-w-0"
            value={Number.isNaN(draft.opacity) ? '' : draft.opacity} onChange={(event) => change({ opacity: event.currentTarget.valueAsNumber })} />
        </label>
        <label className="grid min-w-0 gap-1">ความเร็วเลื่อน (0–100)
          <input type="number" min={0} max={100} className="input-field min-w-0" value={draft.scrollSpeed ?? ''}
            onChange={(event) => change({ scrollSpeed: event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber })} />
        </label>
      </div>
      <label className="grid gap-1">ชื่อแบบอักษร
        <input type="text" autoComplete="off" spellCheck={false} className="input-field min-w-0" value={draft.fontFamily ?? ''}
          onChange={(event) => change({ fontFamily: event.currentTarget.value })} />
      </label>
      <label className="grid gap-1">ขนาดข้อความ (% ของความสูงจอ)
        <input type="number" min={0.01} max={25} step="any" className="input-field min-w-0" value={fontPercent}
          onChange={(event) => change({ fontRatio: event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber / 100 })} />
      </label>
      <fieldset className="grid gap-1">
        <legend>รูปแบบตัวอักษร</legend>
        <label className="flex gap-2"><input type="checkbox" checked={draft.bold ?? (output === 'stage')}
          onChange={(event) => change({ bold: event.currentTarget.checked })} />ตัวหนา</label>
        <label className="flex gap-2"><input type="checkbox" checked={draft.italic ?? false}
          onChange={(event) => change({ italic: event.currentTarget.checked })} />ตัวเอียง</label>
      </fieldset>
      <AlertTextEffectsFields value={draft.effects} onChange={(effects) => change({ effects })} />
      <button type="submit" className="btn-secondary justify-self-start">บันทึกค่าข้อความแจ้งเตือน</button>
      {result === 'saved' && <p role="status">บันทึกค่าข้อความแจ้งเตือนแล้ว</p>}
      {result === 'invalid' && <p role="alert">ตรวจชื่อแบบอักษรและค่าที่กรอก</p>}
      {result === 'failed' && <p role="alert">บันทึกค่าข้อความแจ้งเตือนไม่สำเร็จ</p>}
    </form>
  )
}
