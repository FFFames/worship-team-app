/** Edits collection folders, matching rules, and manual library membership. */

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { CollectionDefinition, CollectionResource, CollectionRule, EasyWorshipCollection } from '../utils/easyWorshipCollections'
import type { ScriptureEditionInfo } from '../types/scripture'
import { localCollectionSet, saveLibraryCollection, type LibraryCollectionOption } from '../utils/collectionLibrary'
import { compileSongCollectionRules } from '../utils/songCollectionRules'
import { compileDesignCollectionRules } from '../utils/designCollectionRules'
import { compileMediaCollectionRules } from '../utils/mediaCollectionRules'
import { CollectionMembers, SongCollectionMembers, type CollectionMember } from './CollectionMembers'
import { ScriptureCollectionMembers, ScriptureCollectionScope } from './ScriptureCollectionFields'
import { planScriptureCollection, scriptureEditionRuleField, validScriptureTextRule } from '../utils/easyWorshipScriptureCollections'

const songFields = [
  ['title', 'ชื่อเพลง'], ['author', 'ศิลปินหรือผู้แต่ง'], ['copyright', 'ลิขสิทธิ์'],
  ['administrator', 'ผู้ดูแลลิขสิทธิ์'], ['words', 'เนื้อเพลง'], ['any field', 'ทุกช่อง'],
] as const
const commonFields = [
  ['title', 'ชื่อรายการ'], ['author', 'ผู้สร้าง'], ['description', 'คำอธิบาย'], ['tags', 'แท็ก'],
  ['filename', 'ชื่อไฟล์'], ['folder', 'โฟลเดอร์ต้นทาง'],
] as const
const designFields = [...commonFields, ['copyright', 'ลิขสิทธิ์']] as const
const operators = [
  [9, 'มีคำว่า'], [10, 'ไม่มีคำว่า'], [0, 'ตรงกับ'], [1, 'ต่างจาก'], [11, 'ขึ้นต้นด้วย'], [12, 'ลงท้ายด้วย'],
] as const

export type EditableCollectionResource = Extract<CollectionResource, 'songs' | 'media' | 'presentations' | 'themes' | 'scripture'>
export type ScriptureCollectionEditorContext = { editions: ScriptureEditionInfo[]; initialEdition?: string }

const resourceLabels: Record<EditableCollectionResource, string> = {
  songs: 'เพลง', media: 'สื่อ', presentations: 'งานนำเสนอ', themes: 'ธีม', scripture: 'พระคัมภีร์',
}
const compilers = { songs: compileSongCollectionRules, media: compileMediaCollectionRules,
  presentations: compileDesignCollectionRules, themes: compileDesignCollectionRules }

function editableDefinition(resource: EditableCollectionResource, group: EasyWorshipCollection | undefined): CollectionDefinition | undefined {
  if (group?.nativeType === 0) return
  if (resource === 'scripture') {
    if (group && planScriptureCollection([group]).hasUnsupported) return
    return { matchType: group?.matchType === 1 ? 1 : 0, rules: group?.rulesEnabled ? group.rules : [],
      inclusions: [...new Set(group?.inclusions ?? [])], exclusions: [...new Set(group?.exclusions ?? [])] }
  }
  if (group?.rulesEnabled && !compilers[resource](group)) return
  const keys = { ...group?.resourceItems, ...group?.resourceOverrides }
  const inclusions = group?.inclusions.map((id) => keys[id]) ?? []
  const exclusions = group?.exclusions.map((id) => keys[id]) ?? []
  if (!inclusions.every(Boolean) || !exclusions.every(Boolean)) return
  const fixed = resource !== 'songs' && !group?.rulesEnabled ? Object.values(group?.resourceItems ?? {}) : []
  return {
    matchType: group?.matchType === 1 ? 1 : 0,
    rules: group?.rulesEnabled ? group.rules : [],
    inclusions: [...new Set([...fixed, ...inclusions])].filter((id) => !exclusions.includes(id)),
    exclusions: [...new Set(exclusions)],
  }
}

export function CollectionEditor({ option, parent, resources, members, scripture, loading, options, onClose, onSave }: {
  option?: LibraryCollectionOption
  parent?: LibraryCollectionOption
  resources: readonly EditableCollectionResource[]
  members?: Partial<Record<EditableCollectionResource, CollectionMember[]>>
  scripture?: ScriptureCollectionEditorContext
  loading?: boolean
  options: LibraryCollectionOption[]
  onClose: () => void
  onSave: (id: string) => void
}) {
  const group = option?.collection
  const initialResource = resources.find((resource) => resource === (group?.resource ?? parent?.collection.resource)) ?? resources[0]
  const [resource, setResource] = useState(initialResource)
  const setId = option?.setId ?? (resource === parent?.collection.resource ? parent.setId : localCollectionSet)
  const label = resourceLabels[resource]
  const fields = resource === 'songs' ? songFields : resource === 'media' ? commonFields : designFields
  const [kind, setKind] = useState<0 | 1>(group?.nativeType === 0 ? 0 : 1)
  const [name, setName] = useState(group?.name ?? '')
  const [parentId, setParentId] = useState(group?.parentId ?? parent?.collection.id ?? '')
  const [definition, setDefinition] = useState(() => editableDefinition(resource, group))
  const [definitionChanged, setDefinitionChanged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { element?.close() }
  }, [])

  const folders = options.filter((option) => option.setId === setId && option.collection.resource === resource && option.collection.nativeType === 0)
  const parentById = new Map(folders.map(({ collection }) => [collection.id, collection.parentId]))
  const destinations = folders.filter(({ collection }) => {
    if (group?.nativeType !== 0) return true
    const seen = new Set([group.id])
    for (let current: string | null = collection.id; current; current = parentById.get(current) ?? null) {
      if (seen.has(current)) return false
      seen.add(current)
    }
    return true
  })
  const visibleRules = definition?.rules.filter((rule) => resource !== 'scripture'
    || (rule.field !== scriptureEditionRuleField && rule.field.toLowerCase() !== 'translation')) ?? []

  function changeDefinition(next: CollectionDefinition) {
    setDefinition(next)
    setDefinitionChanged(true)
  }

  function changeRule(id: string, change: Partial<CollectionRule>) {
    if (!definition) return
    changeDefinition({ ...definition, rules: definition.rules.map((rule) => rule.id === id ? { ...rule, ...change } : rule) })
  }

  function dismiss() {
    dialog.current?.close()
    onClose()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (kind === 1 && resource === 'scripture' && !visibleRules.every(validScriptureTextRule)) {
      setError('กรอกคำหรือวลีที่ใช้กับกฎให้ครบ')
      return
    }
    setError('')
    setSaving(true)
    try {
      const id = await saveLibraryCollection({
        setId, groupId: group?.id, revision: option?.revision, kind, resource,
        edit: { name, parentId: parentId || null, definition: kind === 1 && definitionChanged ? definition : undefined },
      })
      dialog.current?.close()
      onSave(id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกกลุ่มไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const decisions = Object.fromEntries([
    ...(definition?.inclusions ?? []).map((id) => [id, 'include'] as const),
    ...(definition?.exclusions ?? []).map((id) => [id, 'exclude'] as const),
  ])
  function changeMember(id: string, decision: 'include' | 'exclude' | '', aliases: string[] = []) {
    if (!definition) return
    const keep = (current: string) => current !== id && !aliases.includes(current)
    changeDefinition({
      ...definition,
      inclusions: [...definition.inclusions.filter(keep), ...(decision === 'include' ? [id] : [])],
      exclusions: [...definition.exclusions.filter(keep), ...(decision === 'exclude' ? [id] : [])],
    })
  }
  const rootValue = group?.parentId && !parentById.has(group.parentId) ? group.parentId : ''
  return (
    <dialog ref={dialog} aria-labelledby={titleId}
      className="surface fixed inset-0 m-auto! w-[min(44rem,calc(100%-1rem))] max-h-[90dvh] max-w-none overflow-y-auto p-4! text-[var(--fg-primary)] sm:p-6! backdrop:bg-black/70"
      onCancel={(event) => { event.preventDefault(); if (!saving) dismiss() }}>
      <h2 id={titleId} className="mb-4!">{group ? (kind === 0 ? `แก้ไขโฟลเดอร์${label}` : `แก้ไขกลุ่ม${label}`) : `สร้างกลุ่มหรือโฟลเดอร์${label}`}</h2>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={saving} className="grid min-w-0 gap-5">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1">
              {group ? (kind === 0 ? 'ชื่อโฟลเดอร์' : `ชื่อกลุ่ม${label}`) : 'ชื่อกลุ่มหรือโฟลเดอร์'}
              <input className="input-field" type="text" autoFocus required value={name}
                onChange={(event) => setName(event.target.value)} />
            </label>
            {!group && resources.length > 1 && <div className="grid min-w-0 gap-1">
              <label htmlFor={`${titleId}-resource`}>คลัง</label>
              <select id={`${titleId}-resource`} className="input-field" value={resource} onChange={(event) => {
                const next = resources.find((item) => item === event.target.value)
                if (!next) return
                setResource(next)
                setParentId(next === parent?.collection.resource ? parent.collection.id : '')
                setDefinition(editableDefinition(next, undefined))
                setDefinitionChanged(false)
              }}>
                {resources.map((item) => <option key={item} value={item}>{resourceLabels[item]}</option>)}
              </select>
            </div>}
            {!group && <div className="grid min-w-0 gap-1">
              <label htmlFor={`${titleId}-kind`}>ประเภท</label>
              <select id={`${titleId}-kind`} className="input-field" value={kind}
                onChange={(event) => setKind(event.target.value === '0' ? 0 : 1)}>
                <option value={1}>กลุ่ม{label}</option>
                <option value={0}>โฟลเดอร์</option>
              </select>
            </div>}
            <div className="grid min-w-0 gap-1">
              <label htmlFor={`${titleId}-parent`}>โฟลเดอร์ปลายทาง</label>
              <select id={`${titleId}-parent`} className="input-field" value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value={rootValue}>ระดับบนสุด</option>
                {destinations.map(({ collection }) => <option key={collection.id} value={collection.id}>{collection.path.join(' › ')}</option>)}
              </select>
            </div>
          </div>
          {kind === 1 && definition && <>
            {resource === 'scripture' && <ScriptureCollectionScope editions={scripture?.editions ?? []} rules={definition.rules}
              onChange={(rules) => changeDefinition({ ...definition, rules })} />}
            <fieldset className="grid min-w-0 gap-2">
              <legend className="font-medium">กฎเลือก{label}อัตโนมัติ</legend>
              {visibleRules.length > 0 && <div className="grid min-w-0 gap-1">
                <label htmlFor={`${titleId}-match`}>วิธีจับคู่</label>
                <select id={`${titleId}-match`} className="input-field" value={definition.matchType}
                  onChange={(event) => changeDefinition({ ...definition, matchType: event.target.value === '1' ? 1 : 0 })}>
                  <option value={0}>ตรงทุกเงื่อนไข</option>
                  <option value={1}>ตรงอย่างน้อยหนึ่งเงื่อนไข</option>
                </select>
              </div>}
              {visibleRules.map((rule, index) => (
                <div key={rule.id} className="grid min-w-0 gap-2 rounded-lg border border-[var(--border-standard)] p-3! sm:grid-cols-2">
                  {resource !== 'scripture' && <div className="grid min-w-0 gap-1">
                    <label htmlFor={`${titleId}-field-${index}`}>ข้อมูลที่ใช้ · {index + 1}</label>
                    <select id={`${titleId}-field-${index}`} className="input-field" value={rule.field}
                      onChange={(event) => changeRule(rule.id, { field: event.target.value })}>
                      {fields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>}
                  <div className="grid min-w-0 gap-1">
                    <label htmlFor={`${titleId}-operator-${index}`}>เงื่อนไข · {index + 1}</label>
                    <select id={`${titleId}-operator-${index}`} className="input-field" value={rule.operator ?? 9}
                      onChange={(event) => changeRule(rule.id, { operator: Number(event.target.value) })}>
                      {operators.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <label className="grid min-w-0 gap-1">ข้อความ · {index + 1}
                    <input className="input-field" required value={rule.value ?? ''}
                      onChange={(event) => changeRule(rule.id, { value: event.target.value })} />
                  </label>
                  <button className="btn-secondary self-end justify-self-start" type="button" aria-label={`เอาเงื่อนไข ${index + 1} ออก`}
                    onClick={() => changeDefinition({ ...definition, rules: definition.rules.filter(({ id }) => id !== rule.id) })}>
                    เอาเงื่อนไข {index + 1} ออก
                  </button>
                </div>
              ))}
              <button type="button" className="btn-secondary justify-self-start" onClick={() => changeDefinition({
                ...definition, rules: [...definition.rules, { id: crypto.randomUUID(),
                  field: resource === 'scripture' ? 'ScriptureText' : 'title', operator: 9, value: '', secondValue: null }],
              })}>เพิ่มเงื่อนไข</button>
            </fieldset>
            {resource === 'songs' ? <SongCollectionMembers decisions={decisions} onChange={changeMember} />
              : resource === 'scripture' ? <ScriptureCollectionMembers editions={scripture?.editions ?? []}
                initialEdition={scripture?.initialEdition} decisions={decisions} onChange={changeMember} />
              : <CollectionMembers items={members?.[resource] ?? []} label={label} loading={loading} decisions={decisions} onChange={changeMember} />}
          </>}
          {kind === 1 && !definition && <p className="text-sm text-[var(--fg-secondary)]">
            แก้ชื่อและโฟลเดอร์ปลายทางได้ รายละเอียดของกฎหรือบางรายการยังอ่านจาก EasyWorship ได้ไม่ครบ
          </p>}
          {error && <p role="alert" className="text-[var(--status-error-text)]">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-secondary" type="button" onClick={dismiss}>ยกเลิก</button>
            <button className="btn-primary" type="submit">{saving ? 'กำลังบันทึก…' : 'บันทึกกลุ่ม'}</button>
          </div>
        </fieldset>
      </form>
    </dialog>
  )
}
