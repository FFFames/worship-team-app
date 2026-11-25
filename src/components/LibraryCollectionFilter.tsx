/** A named collection selector shared by libraries that import EasyWorship resources. */

import { useId, type ReactNode } from 'react'
import type { useCollectionFilter } from '../hooks/useCollectionFilter'

const resourceName = { presentations: 'งานนำเสนอ', themes: 'ธีม' }

export function LibraryCollectionFilter({ filter, label, className, onChange, children, disabled }: {
  filter: Pick<ReturnType<typeof useCollectionFilter>, 'options' | 'selected' | 'select'>
  label: string
  className?: string
  onChange?: () => void
  children?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  if (!filter.options.length) return null
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-3 ${className ?? ''}`}>
      <label htmlFor={id} className="text-sm">{label}</label>
      <select id={id} className="sort-dropdown max-w-full min-w-0 truncate" value={filter.selected?.id ?? ''}
        disabled={disabled}
        onChange={(event) => { filter.select(event.target.value); onChange?.() }}>
        <option value="">ทุกกลุ่ม</option>
        {filter.options.map(({ id, profile, collection }) => {
          const resource = collection.resource === 'presentations' || collection.resource === 'themes'
            ? `${resourceName[collection.resource]} · ` : ''
          return <option key={id} value={id}>
            {profile} · {resource}{collection.scope === 'personal' ? 'กลุ่มส่วนตัว · ' : ''}{collection.path.join(' › ')}
          </option>
        })}
      </select>
      {children}
    </div>
  )
}
