/** Library for migrated and native slide designs, theme application, and live playback. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LibraryCollectionControls } from '../components/LibraryCollectionControls'
import { useCollectionFilter } from '../hooks/useCollectionFilter'
import { prepareDesignCollectionFilter } from '../utils/designCollectionRules'
import { designCollectionKey, localDesignCollectionKey } from '../utils/collectionLibrary'
import type { CollectionMember } from '../components/CollectionMembers'
import { EasyWorshipDesignImport } from '../components/EasyWorshipDesignImport'
import { LayeredSlide } from '../components/LayeredSlide'
import { LayeredFeedAssignments } from '../components/LayeredFeedAssignments'
import { PowerPointImport } from '../components/PowerPointImport'
import { SlideDesignEditor } from '../components/SlideDesignEditor'
import { useAppendPlaylistCue } from '../hooks/useAppendPlaylistCue'
import { usePlaylist, usePlaylists } from '../hooks/usePlaylists'
import { usePlaylistTheme, useSlideDesigns, type DesignInput } from '../hooks/useSlideDesigns'
import { useStandalonePresenter } from '../hooks/useStandalonePresenter'
import { createSlideAdvanceController, getSlideAdvance } from '../utils/slidePlayback'
import { useDefaultThemes } from '../hooks/useDefaultThemes'
import type { DesignKind, DesignSlide, LibraryDesign } from '../types/slideDesign'
import { applyPresentationBackground, applyThemeText, DESIGN_KIND_LABELS, designSoundtrackAssets, normalizeDesignWebLayers, powerPointSoundtrackAssets, presentationCue } from '../utils/slideDesign'
import { chooseDefaultThemeSlide, readDefaultThemes, saveDefaultThemes, type DefaultThemeSlot, type OutputDefaultThemes } from '../utils/defaultThemes'
import { resolveSlideTransition } from '../utils/slideTransitions'
import { librarySoundtrack } from '../utils/presentationChannel'
import { powerPointBuildLength, powerPointDesignAtStep, stepPowerPointSlide } from '../utils/powerPoint/buildNavigation'
import { advancePowerPointTransitionSound, type PowerPointTransitionSoundState } from '../utils/powerPoint/transitionSound'
import { validOptionalSpeakerNotes, visibleNote } from '../utils/speakerNotes'

const panel = 'surface min-w-0 rounded-xl p-4! sm:p-6!'
const themeSample = 'ความรักมั่นคงของพระเจ้าดำรงเป็นนิตย์'

function createDraft(kind: DesignKind, template?: DesignSlide): DesignInput {
  const id = crypto.randomUUID()
  const slide: DesignSlide = template ? { ...template, id: crypto.randomUUID() } : {
    id: crypto.randomUUID(),
    label: 'สไลด์ 1',
    design: {
      aspectRatio: 16 / 9,
      layers: [{
        id: crypto.randomUUID(),
        kind: 'text',
        frame: { x: 0.08, y: 0.15, width: 0.84, height: 0.7 },
        text: '',
        slot: kind === 'song-theme' || kind === 'scripture-theme' || kind === 'text-theme' ? 'content' : undefined,
        style: { fontSize: 0.075, align: 'center' },
      }],
    },
  }
  return { id, kind, title: '', content: { slides: [slide] } }
}

export default function SlideDesignLibrary() {
  const [params] = useSearchParams()
  const collectionFilter = useCollectionFilter('designs')
  const requestedPlaylist = params.get('playlist') ?? ''
  const library = useSlideDesigns()
  const { playlists } = usePlaylists()
  const appendCue = useAppendPlaylistCue()
  const storeTheme = usePlaylistTheme()
  const [slideAdvance] = useState(createSlideAdvanceController)
  const send = useStandalonePresenter('design', slideAdvance.report)
  useEffect(() => slideAdvance.cancel, [slideAdvance])
  const defaults = useDefaultThemes()

  const [filter, setFilter] = useState<DesignKind | ''>('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [slideIndex, setSlideIndex] = useState(0)
  const [createKind, setCreateKind] = useState<DesignKind>('presentation')
  const [draft, setDraft] = useState<DesignInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [playlistId, setPlaylistId] = useState(requestedPlaylist)
  const [entryId, setEntryId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [playlistLink, setPlaylistLink] = useState('')
  const [live, setLive] = useState<{ design: LibraryDesign; index: number; step: number } | null>(null)
  const pendingCue = useRef<{ key: string; id: string } | null>(null)
  const embeddedAudioRun = useRef<string | undefined>(undefined)
  const transitionSoundState = useRef<PowerPointTransitionSoundState | undefined>(undefined)

  const activeCollection = collectionFilter.selected
  const members = useMemo(() => {
    const groups: Record<'presentations' | 'themes', CollectionMember[]> = { presentations: [], themes: [] }
    for (const design of library.designs) {
      const catalogId = designCollectionKey(design.content.source)
      const localId = localDesignCollectionKey(design.id)
      groups[design.kind === 'presentation' ? 'presentations' : 'themes'].push({
        id: catalogId ?? localId, aliases: catalogId ? [localId] : undefined, title: design.title, detail: DESIGN_KIND_LABELS[design.kind],
      })
    }
    return groups
  }, [library.designs])
  const matchesCollection = useMemo(() => activeCollection && prepareDesignCollectionFilter(activeCollection.collection, activeCollection.leaves), [activeCollection])
  const filtered = useMemo(() => {
    const name = query.trim().toLocaleLowerCase()
    return library.designs.filter((row) => (!filter || row.kind === filter) && row.title.toLocaleLowerCase().includes(name)
      && (!matchesCollection || matchesCollection(row)))
  }, [library.designs, filter, query, matchesCollection])
  const selected = filtered.find((row) => row.id === selectedId) ?? filtered[0]
  const slide = selected?.content.slides[slideIndex] ?? selected?.content.slides[0]
  const isTextTheme = selected?.kind === 'song-theme' || selected?.kind === 'scripture-theme' || selected?.kind === 'text-theme'
  const hasContent = slide?.design.layers.some((layer) => layer.kind === 'text' && layer.slot === 'content')
  const previewDesign = slide && isTextTheme ? applyThemeText(slide.design, themeSample, selected?.kind === 'scripture-theme' ? 'สดุดี 136:1' : '')
    : slide && powerPointDesignAtStep(slide.design, 0)
  const liveSlides = live?.design.content.slides
  const liveBuildLength = live && powerPointBuildLength(liveSlides?.[live.index]?.design)
  const previous = live && liveSlides && stepPowerPointSlide(liveSlides, live.index, live.step, -1)
  const next = live && liveSlides && stepPowerPointSlide(liveSlides, live.index, live.step, 1)
  const target = playlists.find((playlist) => playlist.id === playlistId)
  const schedule = usePlaylist(target?.id)
  const applicable = schedule.songs.filter((entry) =>
    ((selected?.kind === 'song-theme' || selected?.kind === 'text-theme') && (entry.song || entry.cue?.kind === 'song'))
    || ((selected?.kind === 'scripture-theme' || selected?.kind === 'text-theme') && entry.cue?.kind === 'scripture'))

  const sendLiveSlide = useCallback(function showDesignSlide(design: LibraryDesign, index: number, openWindow: boolean, step = 0, withinBuild = false) {
    const current = design.content.slides[index]
    if (!current) return
    const active = powerPointDesignAtStep(current.design, step)
    const theme = chooseDefaultThemeSlide(defaults, 'live', 'presentation', current.template ?? current.label)
    const plan = step >= powerPointBuildLength(current.design) ? getSlideAdvance(design.content.slides, index, design.content.looping) : null
    const completionId = slideAdvance.start(plan, (next) => showDesignSlide(design, next, false), (reason) =>
      setError(reason === 'failed' ? 'สื่อเล่นไม่จบ กรุณาเลือกสไลด์ถัดไปเอง' : 'สไลด์นี้ไม่มีเสียงหรือวิดีโอให้รอจบ'))
    const playback = current.playback
    const runId = playback?.restart || playback?.mode === 'media' ? crypto.randomUUID() : undefined
    const embedded = current.design.soundtracks?.some((track) => track.powerPointMediaId)
    const assets = embedded ? powerPointSoundtrackAssets(active) : designSoundtrackAssets(active) ?? designSoundtrackAssets(theme?.design)
    const embeddedRun = withinBuild && embeddedAudioRun.current ? embeddedAudioRun.current : crypto.randomUUID()
    const soundtrack = librarySoundtrack(assets, design.id, runId ?? (embedded ? embeddedRun : undefined))
    transitionSoundState.current = advancePowerPointTransitionSound(transitionSoundState.current, design.id, index, active, undefined, openWindow)
    const sent = send({
      type: 'SHOW_DESIGN', transition: withinBuild ? { uid: '', values: {} } : resolveSlideTransition(current.transition, theme?.transition),
      cuePlayback: playback && { completionId, runId, once: playback.mode === 'media', loop: playback.loop },
      design: theme ? applyPresentationBackground(theme.design, active, false) : active,
      soundtrack, transitionSound: transitionSoundState.current?.sound,
    }, openWindow)
    if (!sent) slideAdvance.cancel()
    embeddedAudioRun.current = embeddedRun
    setLive(sent ? { design, index, step } : null)
  }, [defaults, send, slideAdvance])

  function clearStatus() {
    setNotice('')
    setError('')
    setPlaylistLink('')
  }

  function startDraft(next: DesignInput) {
    clearStatus()
    setDraft(next)
  }

  async function saveDraft() {
    if (!draft?.title.trim() || !draft.content.slides.length || busy) return
    setBusy(true)
    clearStatus()
    try {
      if (!validOptionalSpeakerNotes(draft.content.notes)) throw new Error('ตรวจความยาวและอักขระในโน้ตงานนำเสนอ')
      const exists = library.designs.some((item) => item.id === draft.id)
      const slides = draft.content.slides.map((slide, index) => {
        const design = normalizeDesignWebLayers(slide.design)
        if (!design) throw new Error(`ตรวจที่อยู่ในกรอบเว็บของสไลด์ ${index + 1} ให้เป็น HTTPS หรือ HTTP`)
        return { ...slide, design }
      })
      const saved = await library.saveDesign({ ...draft, title: draft.title.trim(), content: { ...draft.content, slides } }, exists)
      if (exists) {
        try {
          const updates: OutputDefaultThemes = {}
          for (const [slot, theme] of Object.entries(readDefaultThemes())) {
            if (theme?.id === saved.id) updates[slot as DefaultThemeSlot] = { id: saved.id, title: saved.title, slides: saved.content.slides }
          }
          if (Object.keys(updates).length) saveDefaultThemes(updates)
        } catch {
          setError('บันทึกในคลังแล้ว แต่ปรับธีมเริ่มต้นในเบราว์เซอร์ไม่สำเร็จ')
        }
      }
      await library.refresh()
      setFilter('')
      if (!exists && activeCollection) collectionFilter.select('')
      setQuery('')
      setSelectedId(draft.id)
      setSlideIndex(0)
      setDraft(null)
      setNotice('บันทึกในคลังสไลด์แล้ว')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกสไลด์ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSelected() {
    if (!selected || busy || !window.confirm(`ลบ ${selected.title} ออกจากคลังสไลด์หรือไม่?`)) return
    setBusy(true)
    clearStatus()
    try {
      await library.deleteDesign(selected.id)
      await library.refresh()
      setSlideIndex(0)
      setNotice('ลบออกจากคลังสไลด์แล้ว')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ลบสไลด์ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  function showLive(design: LibraryDesign, index: number, step = 0, withinBuild = false) {
    try {
      sendLiveSlide(design, index, true, step, withinBuild)
    } catch (cause) {
      slideAdvance.cancel()
      setError(cause instanceof Error ? cause.message : 'เปิดจอผู้ชมไม่สำเร็จ')
    }
  }

  async function saveToPlaylist() {
    if (!selected || !slide || !target || busy) return
    setBusy(true)
    clearStatus()
    try {
      if (selected.kind === 'presentation') {
        const cue = presentationCue(selected)
        const key = JSON.stringify([target.id, cue])
        if (pendingCue.current?.key !== key) pendingCue.current = { key, id: crypto.randomUUID() }
        await appendCue(target.id, pendingCue.current.id, cue)
        pendingCue.current = null
        setNotice('เพิ่มงานนำเสนอในเพลย์ลิสต์แล้ว')
      } else if (isTextTheme && hasContent && applicable.some((entry) => entry.id === entryId)) {
        await storeTheme(target.id, entryId, { title: selected.title, design: slide.design, transition: slide.transition })
        setNotice('ใช้ธีมกับรายการในเพลย์ลิสต์แล้ว')
      } else return
      setPlaylistLink(target.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกรายการในเพลย์ลิสต์ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="page-header mb-0!">
        <div className="page-title"><h1>คลังสไลด์และธีม</h1></div>
        {requestedPlaylist && <Link className="btn-secondary" to={`/playlists/${requestedPlaylist}`}>กลับเพลย์ลิสต์</Link>}
      </header>

      {draft ? (
        <section className={panel} aria-label="แก้ไขสไลด์">
          <fieldset disabled={busy}><SlideDesignEditor key={draft.id} draft={draft} onChange={setDraft} /></fieldset>
          <div className="mt-4! flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy || !draft.title.trim()} onClick={() => void saveDraft()}>บันทึกสไลด์</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setDraft(null); clearStatus() }}>ยกเลิก</button>
          </div>
        </section>
      ) : (
        <>
          <EasyWorshipDesignImport store={library.importDesigns} onImported={library.refresh} />
          <PowerPointImport store={library.importDesigns} onImported={async (id) => {
            await library.refresh()
            setFilter('')
            setQuery('')
            setSelectedId(id)
            setSlideIndex(0)
            clearStatus()
          }} />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section className={panel} aria-labelledby="design-list">
              <h2 id="design-list" className="text-lg font-medium">งานนำเสนอและธีม</h2>
              <div className="mt-3! flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm">ประเภทสไลด์ใหม่
                  <select className="input-field" value={createKind} onChange={(event) => setCreateKind(event.target.value as DesignKind)}>
                    {Object.entries(DESIGN_KIND_LABELS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                  </select>
                </label>
                <button type="button" className="btn-primary shrink-0" onClick={() => startDraft(createDraft(createKind))}>สร้างใหม่</button>
              </div>
              <div className="mt-4! grid gap-2 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-2 text-sm">ค้นหาสไลด์และธีม
                  <input type="search" className="input-field" value={query} onChange={(event) => { setQuery(event.target.value); setSlideIndex(0); setEntryId('') }} />
                </label>
                <label className="flex min-w-0 flex-col gap-2 text-sm">แสดงประเภท
                  <select className="input-field" value={filter} onChange={(event) => { setFilter(event.target.value as DesignKind | ''); setSlideIndex(0); setEntryId('') }}>
                    <option value="">ทั้งหมด</option>
                    {Object.entries(DESIGN_KIND_LABELS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                  </select>
                </label>
              </div>
              <div id="design-collections" className="mt-3!">
                <LibraryCollectionControls filter={collectionFilter} resources={['presentations', 'themes']} label="กลุ่มสไลด์และธีม"
                  createLabel="สร้างกลุ่มสไลด์และธีม" editLabel="แก้ไขกลุ่มสไลด์และธีม" members={members} loading={library.loading} onChange={() => {
                  setSelectedId(''); setSlideIndex(0); setEntryId(''); clearStatus()
                }} />
              </div>
              {library.loading && <p role="status" className="mt-3! text-sm">กำลังอ่านคลังสไลด์…</p>}
              {library.error && <p role="alert" className="mt-3! text-sm wrap-anywhere text-[var(--status-error-text)]">{library.error}</p>}
              {!library.loading && filtered.length === 0 && <p className="mt-3! text-sm text-[var(--fg-secondary)]">ไม่มีรายการสไลด์ที่ตรงกับตัวกรอง</p>}
              <ul className="mt-3! max-h-96 divide-y divide-[var(--border-subtle)] overflow-y-auto">
                {filtered.map((row) => (
                  <li key={row.id}>
                    <button type="button" aria-pressed={row.id === selected?.id}
                      className="flex w-full min-w-0 flex-col gap-1 rounded px-2! py-3! text-left aria-pressed:bg-[var(--accent-bg)]"
                      onClick={() => { setSelectedId(row.id); setSlideIndex(0); setEntryId(''); clearStatus() }}>
                      <span className="font-medium wrap-anywhere">{row.title}</span>
                      <span className="text-xs text-[var(--fg-secondary)]">{DESIGN_KIND_LABELS[row.kind]} · {row.content.slides.length} สไลด์</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {selected && slide && previewDesign && (
              <section className={panel} aria-labelledby="design-preview">
                <h2 id="design-preview" className="text-lg font-medium wrap-anywhere">{selected.title}</h2>
                <div className="mt-3! aspect-video overflow-hidden rounded-lg"><LayeredSlide design={previewDesign} preview /></div>
                <LayeredFeedAssignments design={previewDesign} onAssigned={() => {
                  if (live?.design.id === selected.id && live.index === selected.content.slides.indexOf(slide)) sendLiveSlide(selected, live.index, false, live.step)
                }} />
                <label className="mt-3! flex min-w-0 flex-col gap-2 text-sm">สไลด์ตัวอย่าง
                  <select className="input-field" value={selected.content.slides.indexOf(slide)} onChange={(event) => setSlideIndex(Number(event.target.value))}>
                    {selected.content.slides.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.label}</option>)}
                  </select>
                </label>
                <div className="mt-3! flex flex-wrap gap-2">
                  {selected.kind === 'presentation' && <button type="button" className="btn-primary" onClick={() => showLive(selected, selected.content.slides.indexOf(slide))}>ขึ้นจอผู้ชม</button>}
                  {selected.kind === 'presentation-theme' && <button type="button" className="btn-primary" onClick={() => startDraft(createDraft('presentation', slide))}>สร้างงานนำเสนอจากสไลด์นี้</button>}
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => startDraft(selected)}>แก้ไขสไลด์</button>
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => void deleteSelected()}>ลบออกจากคลัง</button>
                </div>
                {(selected.kind === 'presentation' || isTextTheme) && (
                  <div className="mt-4! flex flex-col items-start gap-3 border-t border-[var(--border-subtle)] pt-4!">
                    <label className="flex w-full min-w-0 flex-col gap-2 text-sm">เลือกเพลย์ลิสต์
                      <select className="input-field" value={target?.id ?? ''} disabled={busy} onChange={(event) => { setPlaylistId(event.target.value); setEntryId(''); clearStatus() }}>
                        <option value="">เลือกเพลย์ลิสต์</option>
                        {playlists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </label>
                    {isTextTheme && target && (
                      <label className="flex w-full min-w-0 flex-col gap-2 text-sm">รายการที่จะใช้ธีม
                        <select className="input-field" value={entryId} disabled={busy || schedule.loading} onChange={(event) => { setEntryId(event.target.value); clearStatus() }}>
                          <option value="">เลือกรายการ</option>
                          {applicable.map((entry) => <option key={entry.id} value={entry.id}>{entry.order + 1}. {entry.song?.title ?? entry.cue?.label}</option>)}
                        </select>
                      </label>
                    )}
                    {isTextTheme && !hasContent && <p className="text-sm text-[var(--fg-secondary)]">สไลด์นี้ไม่มีช่องเนื้อหาสำหรับใช้กับเพลย์ลิสต์</p>}
                    <button type="button" className="btn-secondary" disabled={busy || !target || (isTextTheme && (!entryId || !hasContent))} onClick={() => void saveToPlaylist()}>
                      {isTextTheme ? 'ใช้ธีมกับรายการ' : 'เพิ่มงานนำเสนอในเพลย์ลิสต์'}
                    </button>
                    {schedule.error && <p role="alert" className="text-sm text-[var(--status-error-text)]">เปิดรายการเพลย์ลิสต์ไม่สำเร็จ</p>}
                  </div>
                )}
                {visibleNote(selected.content.notes) && <details className="mt-3! text-sm">
                  <summary className="cursor-pointer">โน้ตงานนำเสนอ</summary>
                  <p className="mt-2! whitespace-pre-wrap wrap-anywhere">{selected.content.notes}</p>
                </details>}
                {(selected.content.source?.author || selected.content.source?.copyright
                  || selected.content.source?.description || selected.content.warnings?.length) ? (
                  <details className="mt-3! text-sm text-[var(--fg-secondary)]">
                    <summary className="cursor-pointer">รายละเอียดการนำเข้า</summary>
                    <ul className="mt-2! space-y-1">
                      {[selected.content.source?.author, selected.content.source?.copyright, selected.content.source?.description].filter(Boolean)
                        .map((credit, index) => <li className="wrap-anywhere" key={index}>{credit}</li>)}
                      {selected.content.warnings?.map((warning) => <li className="wrap-anywhere" key={warning}>{warning}</li>)}
                    </ul>
                  </details>
                ) : null}
              </section>
            )}
          </div>
        </>
      )}
      {live && (
        <section className={panel} aria-label="ควบคุมจอผู้ชม">
          <p role="status" className="wrap-anywhere">กำลังแสดง {live.design.title} · {live.index + 1}/{live.design.content.slides.length}
            {liveBuildLength ? ` · ลำดับการแสดง ${live.step}/${liveBuildLength}` : ''}</p>
          <div className="mt-2! flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={!previous} onClick={() => previous && showLive(live.design, previous.index, previous.step, previous.index === live.index)}>
              {previous?.index === live.index ? 'ย้อนหนึ่งขั้น' : 'สไลด์ก่อนหน้า'}
            </button>
            <button type="button" className="btn-secondary" disabled={!next} onClick={() => next && showLive(live.design, next.index, next.step, next.index === live.index)}>
              {next?.index === live.index ? 'ถัดไปหนึ่งขั้น' : 'สไลด์ถัดไป'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => {
              transitionSoundState.current = undefined
              send({ type: 'SHOW_BLACK' }, false)
              setLive(null)
            }}>ล้างจอผู้ชม</button>
          </div>
        </section>
      )}
      {error && <p role="alert" className="wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
      {notice && <p role="status">{notice}{playlistLink && <> · <Link className="text-[var(--accent)] underline" to={`/playlists/${playlistLink}`}>เปิดเพลย์ลิสต์</Link></>}</p>}
    </div>
  )
}
