import { useState } from 'react'
import { alertOutputLabels, type AlertOutput, type AlertTemplate } from '../types/alertTemplate'
import { alertTokenSettings } from '../utils/alertTokens'

export function AlertTemplatePicker({ output, templates, onPick }: {
  output: AlertOutput
  templates: AlertTemplate[]
  onPick: (template: AlertTemplate) => void
}) {
  const [hasTokens, setHasTokens] = useState(false)
  const choices = templates.filter((template) => template.output === output)
  if (!choices.length) return null
  return (
    <div className="mb-2! grid min-w-0 gap-1">
      <div className="grid gap-1 text-xs">
        <label htmlFor={`saved-alert-${output}`}>ข้อความที่บันทึกสำหรับ{alertOutputLabels[output]}</label>
        <select id={`saved-alert-${output}`} className="input-field min-w-0" value="" onChange={(event) => {
          const selected = choices.find((template) => template.id === event.currentTarget.value)
          if (!selected) return
          onPick(selected)
          setHasTokens(Boolean(alertTokenSettings(selected)?.tokens.length))
        }}>
          <option value="">เลือกข้อความ</option>
          {choices.map((template) => (
            <option key={template.id} value={template.id}>
              {template.title}{template.source?.profileName ? ` · ${template.source.profileName}` : ''}
            </option>
          ))}
        </select>
      </div>
      {hasTokens && <p role="status" className="text-xs! text-[var(--fg-secondary)]">ตรวจข้อความที่มีโทเค็นก่อนขึ้นจอ</p>}
    </div>
  )
}
