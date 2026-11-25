/** Connects collection filters and management actions to a library. */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { useCollectionFilter } from '../hooks/useCollectionFilter'
import { removeLibraryCollection, type LibraryCollectionOption } from '../utils/collectionLibrary'
import { CollectionEditor, type EditableCollectionResource, type ScriptureCollectionEditorContext } from './CollectionEditor'
import type { CollectionMember } from './CollectionMembers'
import { LibraryCollectionFilter } from './LibraryCollectionFilter'

type Filter = ReturnType<typeof useCollectionFilter>

export function LibraryCollectionControls({ filter, resources, label, createLabel, editLabel, members, scripture, loading, disabled, onChange, children }: {
  filter: Filter
  resources: readonly EditableCollectionResource[]
  label: string
  createLabel: string
  editLabel: string
  members?: Partial<Record<EditableCollectionResource, CollectionMember[]>>
  scripture?: ScriptureCollectionEditorContext
  loading?: boolean
  disabled?: boolean
  onChange?: () => void
  children?: ReactNode
}) {
  const [editor, setEditor] = useState<{ option?: LibraryCollectionOption; parent?: LibraryCollectionOption }>()
  const selected = filter.selected
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <LibraryCollectionFilter filter={filter} label={label} disabled={disabled} onChange={onChange}>{children}</LibraryCollectionFilter>
    <button type="button" className="btn-secondary" disabled={disabled || !filter.ready}
      onClick={() => setEditor({ parent: selected?.collection.nativeType === 0 ? selected : undefined })}>{createLabel}</button>
    {selected && <>
      <button type="button" className="btn-secondary" disabled={disabled} onClick={() => setEditor({ option: selected })}>
        {selected.collection.nativeType === 0 ? 'แก้ไขโฟลเดอร์' : editLabel}
      </button>
      <RemoveCollectionButton option={selected} filter={filter} disabled={disabled} onChange={onChange} />
    </>}
    {editor && <CollectionEditor {...editor} options={filter.options} resources={resources} members={members} scripture={scripture} loading={loading}
      onClose={() => setEditor(undefined)} onSave={(id) => {
        filter.refresh()
        filter.select(id)
        setEditor(undefined)
        onChange?.()
      }} />}
  </div>
}

function RemoveCollectionButton({ option, filter, disabled, onChange }: {
  option: LibraryCollectionOption; filter: Filter; disabled?: boolean; onChange?: () => void
}) {
  const [removing, setRemoving] = useState<LibraryCollectionOption>()
  return <>
    <button type="button" className="btn-ghost" disabled={disabled} onClick={() => setRemoving(option)}>
      {option.collection.nativeType === 0 ? 'ลบโฟลเดอร์' : 'ลบกลุ่ม'}
    </button>
    {removing && <RemoveCollectionDialog option={removing} onClose={() => setRemoving(undefined)} onRemove={() => {
      const parent = filter.options.find((entry) => entry.setId === removing.setId && entry.collection.id === removing.collection.parentId)
      filter.refresh()
      filter.select(parent?.id ?? '')
      setRemoving(undefined)
      onChange?.()
    }} />}
  </>
}

function RemoveCollectionDialog({ option, onClose, onRemove }: { option: LibraryCollectionOption; onClose: () => void; onRemove: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const folder = option.collection.nativeType === 0
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { element?.close() }
  }, [])

  async function remove() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await removeLibraryCollection(option)
      onRemove()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ลบกลุ่มไม่สำเร็จ')
      setBusy(false)
    }
  }

  return <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} role="alertdialog"
    className="surface fixed inset-0 m-auto! grid w-[min(28rem,calc(100%-1rem))] gap-3 p-4! text-[var(--fg-primary)] sm:p-6! backdrop:bg-black/70"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <h2 id={`${id}-title`} className="wrap-anywhere font-medium">ลบ{folder ? 'โฟลเดอร์' : 'กลุ่ม'} {option.collection.name}</h2>
    <p id={`${id}-body`} className="text-sm text-[var(--fg-secondary)]">
      {folder ? 'โฟลเดอร์และกลุ่มย่อยจะถูกนำออก ' : ''}รายการต้นฉบับยังอยู่ในคลัง
    </p>
    {error && <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className="btn-secondary" autoFocus disabled={busy} onClick={onClose}>ยกเลิก</button>
      <button type="button" className="btn-secondary text-[var(--status-error-text)]" disabled={busy} onClick={() => void remove()}>ยืนยันการลบ</button>
    </div>
  </dialog>
}
