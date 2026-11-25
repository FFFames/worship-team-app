/** Imports Bible editions, finds passages, and presents or schedules selected verses. */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LibraryCollectionControls } from '../components/LibraryCollectionControls'
import { outputTextInsetsStyle, StyledTextRuns } from '../components/StyledTextRuns'
import { LayeredSlide } from '../components/LayeredSlide'
import { useAppendPlaylistCue } from '../hooks/useAppendPlaylistCue'
import { useCollectionFilter } from '../hooks/useCollectionFilter'
import { usePlaylists } from '../hooks/usePlaylists'
import { useStandalonePresenter } from '../hooks/useStandalonePresenter'
import { useOutputSettings } from '../hooks/useOutputSettings'
import { useScripturePagination } from '../hooks/useScripturePagination'
import type { PlaylistCue } from '../types/database'
import type { LocatedVerse, ScriptureEdition, ScriptureEditionInfo } from '../types/scripture'
import { buildScriptureCue, findScripturePassage, matchScriptureVerses, paginateScriptureCue, scriptureChapterVerses, searchScriptureText,
  verseKey, verseReference } from '../utils/scripture'
import { useDefaultThemes } from '../hooks/useDefaultThemes'
import { chooseDefaultTheme, chooseDefaultThemeSlide } from '../utils/defaultThemes'
import { applyThemeText } from '../utils/slideDesign'
import { scriptureFlowDesign, scriptureOutputDesign, scriptureOutputLayout, scriptureOutputText, scriptureReference } from '../utils/scriptureOutput'
import { defaultScriptureMinFontRatio } from '../utils/outputSettings'
import { deleteScriptureEdition, listScriptureEditions, readScriptureEdition, saveScriptureEdition } from '../utils/scriptureLibrary'
import { planScriptureCollection, scriptureCollectionEditions, scriptureCollectionVerses } from '../utils/easyWorshipScriptureCollections'

const panel = 'surface min-w-0 rounded-xl p-4! sm:p-6!'
const fieldError = 'text-sm text-[var(--status-error-text)]'
const pageSize = 40

type LivePassage = { cue: PlaylistCue; slide: number }
const scriptureLibraryLayouts = ['output', 'verse', 'continuous', 'automatic', 'single'] as const
type ScriptureLibraryLayout = typeof scriptureLibraryLayouts[number]

export default function ScriptureLibrary() {
  const scriptureSettings = useOutputSettings().scripture.live
  const [searchParams] = useSearchParams()
  const collectionFilter = useCollectionFilter('scripture')
  const activeCollection = collectionFilter.selected
  const requestedPlaylist = searchParams.get('playlist') ?? ''
  const { playlists, loading: loadingPlaylists, error: playlistError } = usePlaylists()
  const appendCue = useAppendPlaylistCue()
  const sendToPresenter = useStandalonePresenter('scripture')
  const defaults = useDefaultThemes()
  const [editions, setEditions] = useState<ScriptureEditionInfo[]>([])
  const [selectedEditionId, setSelectedEditionId] = useState('')
  const [edition, setEdition] = useState<ScriptureEdition | null>(null)
  const [libraryBusy, setLibraryBusy] = useState(true)
  const [changingEdition, setChangingEdition] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [mode, setMode] = useState<'reference' | 'text' | 'browse'>('reference')
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<{ editionId: string; verses: LocatedVerse[] } | null>(null)
  const [browseBookId, setBrowseBookId] = useState('')
  const [browseChapter, setBrowseChapter] = useState<number>()
  const [verseOrder, setVerseOrder] = useState<'ascending' | 'descending'>('ascending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const [layout, setLayout] = useState<ScriptureLibraryLayout>('output')
  const [preview, setPreview] = useState(0)
  const [playlistId, setPlaylistId] = useState(requestedPlaylist)
  const [saving, setSaving] = useState(false)
  const [savedPlaylist, setSavedPlaylist] = useState('')
  const [saveError, setSaveError] = useState('')
  const [live, setLive] = useState<LivePassage | null>(null)
  const [presenterError, setPresenterError] = useState('')
  const pendingCue = useRef<{ id: string; key: string } | null>(null)

  const collectionPlan = useMemo(() => activeCollection ? planScriptureCollection(activeCollection.leaves) : null, [activeCollection])
  const collectionEditions = useMemo(() => collectionPlan && scriptureCollectionEditions(collectionPlan, editions), [collectionPlan, editions])
  const loadingCollection = Boolean(searchParams.get('collection')) && !collectionFilter.ready
  const editionId = loadingCollection ? '' : selectedEditionId || collectionEditions?.compatible[0]?.id || editions[0]?.id || ''

  useEffect(() => {
    let active = true
    void listScriptureEditions().then((available) => {
      if (!active) return
      setEditions(available)
    }).catch(() => { if (active) setLibraryError('เปิดคลังพระคัมภีร์ในเบราว์เซอร์ไม่ได้') })
      .finally(() => { if (active) setLibraryBusy(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (!editionId) {
      setEdition(null)
      return
    }
    if (edition?.id === editionId) return

    void readScriptureEdition(editionId).then((loaded) => {
      if (!active) return
      if (loaded) setEdition(loaded)
      else setLibraryError('ไม่พบพระคัมภีร์ฉบับที่เลือก กรุณานำเข้าไฟล์อีกครั้ง')
    }).catch(() => { if (active) setLibraryError('อ่านฉบับที่บันทึกไว้ไม่ได้') })
    return () => { active = false }
  }, [edition, editionId])

  const currentEdition = edition?.id === editionId ? edition : null
  const collectionVerses = useMemo(() => currentEdition && collectionPlan ? scriptureCollectionVerses(collectionPlan, currentEdition) : null,
    [currentEdition, collectionPlan])
  const browseBook = currentEdition?.books.find(({ id }) => id === browseBookId) ?? currentEdition?.books[0]
  const browseChapters = useMemo(() => [...new Set(browseBook?.verses.map(({ chapter }) => chapter))].sort((a, b) => a - b), [browseBook])
  const chapter = browseChapter && browseChapters.includes(browseChapter) ? browseChapter : browseChapters[0]
  const editionMatches = useMemo(() => matches && currentEdition
    ? matches.editionId === currentEdition.id ? matches.verses : matchScriptureVerses(currentEdition, matches.verses)
    : null, [matches, currentEdition])
  const displayedMatches = editionMatches ?? collectionVerses
  const orderedMatches = useMemo(() => displayedMatches && verseOrder === 'descending' ? [...displayedMatches].reverse() : displayedMatches,
    [displayedMatches, verseOrder])
  const chosen = useMemo(() => displayedMatches && selected.size > 0 ? displayedMatches.filter((verse) => selected.has(verseKey(verse))) : [],
    [displayedMatches, selected])
  const switchedEdition = Boolean(matches && currentEdition && matches.editionId !== currentEdition.id)
  const missingSelection = switchedEdition ? selected.size - chosen.length : 0
  const pagination = scriptureSettings.pagination
  const configuredLayout = pagination?.flow === false ? 'single' : Object.keys(pagination ?? {}).length ? 'automatic' : 'verse'
  const layoutMode = layout === 'output' ? configuredLayout : layout
  const paginationRequest = useMemo(() => layoutMode === 'automatic' && currentEdition && chosen.length ? {
    edition: currentEdition, verses: chosen, settings: scriptureSettings, themes: defaults,
    breakOnVerse: pagination?.breakOnVerse ?? false, minFontRatio: pagination?.minFontRatio ?? defaultScriptureMinFontRatio,
  } : null, [layoutMode, currentEdition, chosen, scriptureSettings, defaults, pagination])
  const measured = useScripturePagination(paginationRequest)
  const cue = useMemo(() => {
    if (!currentEdition) return null
    if (layoutMode === 'automatic') return measured?.cue ?? null
    if (layoutMode === 'single') return paginateScriptureCue(currentEdition, chosen, false)
    return buildScriptureCue(currentEdition, chosen, layoutMode)
  }, [currentEdition, chosen, layoutMode, measured])
  const slideIndex = Math.min(preview, Math.max(0, (cue?.slides.length ?? 1) - 1))
  const slide = cue?.slides[slideIndex]
  const targetPlaylist = playlists.find((playlist) => playlist.id === playlistId)

  function resetResultView() {
    setPreview(0)
    setVisibleCount(pageSize)
    setSavedPlaylist('')
    setSaveError('')
  }

  function resetMatches() {
    setMatches(null)
    setSelected(new Set())
    resetResultView()
  }

  function changeEdition(id: string) {
    setSelectedEditionId(id)
    setLibraryError('')
    if (!collectionPlan && mode !== 'text' && matches?.verses.length) {
      resetResultView()
    } else {
      setQuery('')
      resetMatches()
    }
  }

  async function importEdition(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file || changingEdition) return

    setChangingEdition(true)
    setLibraryError('')
    try {
      const { readEasyWorshipBible } = await import('../utils/easyWorshipBible')
      const imported = await readEasyWorshipBible(file)
      await saveScriptureEdition(imported)
      setEditions(await listScriptureEditions())
      setEdition(imported)
      setSelectedEditionId(imported.id)
      setQuery('')
      resetMatches()
    } catch (cause) {
      setLibraryError(cause instanceof Error ? cause.message : 'นำเข้าพระคัมภีร์ไม่สำเร็จ')
    } finally {
      setChangingEdition(false)
      input.value = ''
    }
  }

  async function removeEdition() {
    if (!currentEdition || !window.confirm(`เอา ${currentEdition.name} ออกจากคลังในเบราว์เซอร์นี้หรือไม่? ข้อที่บันทึกไว้ยังอยู่ในเพลย์ลิสต์`)) return

    setChangingEdition(true)
    setLibraryError('')
    try {
      await deleteScriptureEdition(currentEdition.id)
      const available = await listScriptureEditions()
      setEditions(available)
      setSelectedEditionId('')
      setQuery('')
      resetMatches()
    } catch {
      setLibraryError('เอาพระคัมภีร์ฉบับนี้ออกจากคลังไม่สำเร็จ')
    } finally {
      setChangingEdition(false)
    }
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentEdition) return
    if (mode === 'browse' ? !browseBook || !chapter : !query.trim()) return

    let found = mode === 'browse' && browseBook && chapter ? scriptureChapterVerses(browseBook, chapter)
      : mode === 'reference' ? findScripturePassage(currentEdition, query) : searchScriptureText(currentEdition, query)
    if (collectionVerses) {
      const keys = new Set(collectionVerses.map(verseKey))
      found = found.filter((verse) => keys.has(verseKey(verse)))
    }
    resetMatches()
    setMatches({ editionId: currentEdition.id, verses: found })
    setSelected(new Set(mode === 'reference' ? found.map(verseKey) : []))
  }

  async function addPassage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cue || !targetPlaylist || saving) return

    const key = JSON.stringify([targetPlaylist.id, cue])
    if (pendingCue.current?.key !== key) pendingCue.current = { id: crypto.randomUUID(), key }
    setSaving(true)
    setSavedPlaylist('')
    setSaveError('')
    try {
      await appendCue(targetPlaylist.id, pendingCue.current.id, cue)
      pendingCue.current = null
      setSavedPlaylist(targetPlaylist.id)
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'เพิ่มข้อพระคัมภีร์ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  function showPassage(passage: LivePassage) {
    const target = passage.cue.slides[passage.slide]
    if (!target) return

    setPresenterError('')
    try {
      const lyrics = target.lines.join('\n')
      const theme = chooseDefaultThemeSlide(defaults, 'live', 'scripture', target.label)
      const scripture = scriptureReference(passage.cue, target.label, passage.slide)
      sendToPresenter(passage.cue.scriptureFlow ? { type: 'SHOW_DESIGN', design: scriptureFlowDesign(lyrics, theme?.design), scripture, transition: theme?.transition }
        : theme ? { type: 'SHOW_DESIGN', design: applyThemeText(theme.design, lyrics), scripture, transition: theme.transition }
        : { type: 'SHOW_LYRICS', lyrics, subtitle: target.label, scripture })
      setLive(passage)
    } catch (cause) {
      setPresenterError(cause instanceof Error ? cause.message : 'เปิดจอผู้ชมไม่ได้ในเบราว์เซอร์นี้')
    }
  }

  const previewSource = cue && slide && scriptureReference(cue, slide.label, slideIndex)
  const previewLayout = previewSource ? scriptureOutputLayout(previewSource, scriptureSettings) : undefined
  const previewCaption = previewLayout?.referenceRuns ? <StyledTextRuns runs={previewLayout.referenceRuns} /> : previewLayout?.reference
  const previewCaptionSpacing = outputTextInsetsStyle(previewLayout?.referenceInsets)
  const previewText = slide && scriptureOutputText(slide.lines.join('\n'), previewLayout)
  const previewDesign = cue?.scriptureFlow && slide && previewLayout ? scriptureOutputDesign(
    scriptureFlowDesign(slide.lines.join('\n'), chooseDefaultTheme(defaults, 'live', 'scripture', slide.label)), previewLayout) : undefined

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="page-header mb-0!">
        <div className="page-title">
          <h1>พระคัมภีร์</h1>
          <p>ค้นข้อพระคัมภีร์ ดูตัวอย่างสไลด์ แล้วขึ้นจอหรือเพิ่มในเพลย์ลิสต์</p>
        </div>
        {requestedPlaylist && <Link className="btn-secondary" to={`/playlists/${requestedPlaylist}`}>กลับเพลย์ลิสต์</Link>}
      </header>

      <section className={panel} aria-labelledby="scripture-editions">
        <h2 id="scripture-editions" className="mb-3! text-lg font-medium">ฉบับพระคัมภีร์</h2>
        <fieldset className="grid gap-4 sm:grid-cols-2" disabled={libraryBusy || loadingCollection || changingEdition || saving}>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-medium">นำเข้าไฟล์ EasyWorship .ewb</span>
            <input type="file" className="input-field min-w-0" accept=".ewb" onChange={importEdition} aria-describedby="edition-help" />
          </label>
          {editions.length > 0 && (
            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-sm font-medium">เลือกฉบับ</span>
              <select className="input-field" value={editionId} onChange={(event) => changeEdition(event.target.value)}>
                {editions.map((info) => <option key={info.id} value={info.id}>{info.name} ({info.abbreviation})</option>)}
              </select>
            </label>
          )}
        </fieldset>
        <p id="edition-help" className="mt-3! text-sm text-[var(--fg-secondary)]">
          ฉบับเต็มเก็บในเบราว์เซอร์นี้ ข้อที่เพิ่มในเพลย์ลิสต์จะบันทึกเป็นข้อความสไลด์ของเพลย์ลิสต์
        </p>
        {currentEdition?.copyright && (
          <details className="mt-2! text-xs text-[var(--fg-secondary)]">
            <summary className="cursor-pointer">ข้อมูลลิขสิทธิ์</summary>
            <p className="mt-2! whitespace-pre-line wrap-anywhere">{currentEdition.copyright}</p>
          </details>
        )}
        {currentEdition && <button type="button" className="btn-ghost mt-2!" disabled={changingEdition || saving} onClick={() => void removeEdition()}>เอาฉบับนี้ออกจากคลัง</button>}
        {(libraryBusy || loadingCollection || changingEdition || (editionId && !currentEdition && !libraryError)) && <p role="status" className="mt-3! text-sm">กำลังเปิดคลังพระคัมภีร์…</p>}
        {libraryError && <p role="alert" className={`mt-3! ${fieldError}`}>{libraryError}</p>}
      </section>

      <section className={panel} id="scripture-collections" aria-labelledby="scripture-collection-heading">
        <h2 id="scripture-collection-heading" className="mb-3! text-lg font-medium">กลุ่มและโฟลเดอร์</h2>
        <LibraryCollectionControls filter={collectionFilter} resources={['scripture']} label="กลุ่มพระคัมภีร์"
          createLabel="สร้างกลุ่มพระคัมภีร์" editLabel="แก้ไขกลุ่มพระคัมภีร์" scripture={{ editions, initialEdition: editionId }}
          disabled={changingEdition || saving}
          onChange={() => { setSelectedEditionId(''); setLibraryError(''); setQuery(''); resetMatches() }} />
        {collectionEditions && (
          <>
            <div className="mt-2! flex flex-wrap gap-2">
              {collectionEditions.compatible.filter(({ id }) => id !== editionId).map(({ id, name }) => (
                <button key={id} type="button" className="chip-btn" disabled={changingEdition || saving}
                  onClick={() => changeEdition(id)}>เปิด {name}</button>
              ))}
            </div>
            {collectionEditions.missingIds.length + collectionEditions.missingEditionIds.length + collectionEditions.missingNames.length > 0 && !libraryBusy && (
              <p className="mt-2! text-sm wrap-anywhere text-[var(--fg-secondary)]" role="status">
                นำเข้าไฟล์ .ewb ของฉบับที่กลุ่มนี้ใช้เพิ่มเติม · {[
                  ...[...collectionEditions.missingIds, ...collectionEditions.missingEditionIds].map((id) => `รหัสฉบับ ${id}`),
                  ...collectionEditions.missingNames,
                ].join(', ')}
              </p>
            )}
            {collectionPlan?.hasUnsupported && <p className="mt-2! text-sm text-[var(--fg-secondary)]">
              กลุ่มนี้มีรายการหรือกฎที่แอปยังอ่านไม่ได้บางส่วน
            </p>}
          </>
        )}
      </section>

      {currentEdition && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className={panel} aria-labelledby="scripture-search">
            <h2 id="scripture-search" className="text-lg font-medium">ค้นข้อพระคัมภีร์</h2>
            <form className="mt-3!" onSubmit={search}>
              <fieldset className="flex flex-wrap gap-x-4 gap-y-2" disabled={saving}>
                <legend className="sr-only">วิธีค้นหา</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="scripture-mode" checked={mode === 'reference'} onChange={() => { setMode('reference'); resetMatches() }} /> อ้างอิงข้อ
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="scripture-mode" checked={mode === 'text'} onChange={() => { setMode('text'); resetMatches() }} /> คำหรือวลี
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="scripture-mode" checked={mode === 'browse'} onChange={() => { setMode('browse'); resetMatches() }} /> เลือกหนังสือและบท
                </label>
              </fieldset>
              {mode === 'browse' ? (
                <div className="mt-3! grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <div className="flex min-w-0 flex-col gap-2 text-sm">
                    <label htmlFor="scripture-browse-book">หนังสือพระคัมภีร์</label>
                    <select id="scripture-browse-book" className="input-field min-w-0" value={browseBook?.id ?? ''} disabled={saving}
                      onChange={(event) => { setBrowseBookId(event.target.value); setBrowseChapter(undefined); resetMatches() }}>
                      {currentEdition.books.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </div>
                  <div className="flex min-w-0 flex-col gap-2 text-sm">
                    <label htmlFor="scripture-browse-chapter">บท</label>
                    <select id="scripture-browse-chapter" className="input-field min-w-0" value={chapter ?? ''} disabled={saving || !browseChapters.length}
                      onChange={(event) => { setBrowseChapter(Number(event.target.value)); resetMatches() }}>
                      {browseChapters.map((number) => <option key={number} value={number}>{number}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <label className="mt-3! flex flex-col gap-2 text-sm">
                  {mode === 'reference' ? 'ชื่อหนังสือ บท และข้อ' : 'คำที่ต้องการค้น'}
                  <input type="search" className="input-field" required value={query} disabled={saving}
                    placeholder={mode === 'reference' ? `${currentEdition.books[0]?.name ?? 'John'} 1:1–3` : undefined}
                    list={mode === 'reference' ? 'scripture-books' : undefined}
                    onChange={(event) => setQuery(event.target.value)} />
                </label>
              )}
              {mode === 'reference' && (
                <datalist id="scripture-books">
                  {currentEdition.books.map((book) => <option key={book.id} value={`${book.name} ${book.verses[0]?.chapter ?? 1}`} />)}
                </datalist>
              )}
              <button type="submit" className="btn-secondary mt-3!" disabled={saving || (mode === 'browse' && !chapter)}>
                {mode === 'browse' ? 'เปิดบท' : 'ค้นหา'}
              </button>
            </form>

            {orderedMatches && (
              <>
                <div className="mt-4! flex flex-wrap items-center justify-between gap-3">
                  <p role="status" className="text-sm text-[var(--fg-secondary)]">
                    {orderedMatches.length ? `พบ ${orderedMatches.length} ข้อ · เลือก ${chosen.length} ข้อ`
                      : switchedEdition ? 'ฉบับนี้ไม่มีข้อตามอ้างอิงที่ค้นไว้'
                      : collectionPlan && !matches ? 'กลุ่มนี้ไม่มีข้อในฉบับที่เลือก' : 'ไม่พบข้อที่ตรงกับคำค้นในฉบับนี้'}
                  </p>
                  {orderedMatches.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <label htmlFor="scripture-verse-order">เรียงรายการ</label>
                      <select id="scripture-verse-order" className="input-field" value={verseOrder} disabled={saving}
                        onChange={(event) => {
                          setVerseOrder(event.target.value === 'descending' ? 'descending' : 'ascending')
                          setVisibleCount(pageSize)
                        }}>
                        <option value="ascending">จากต้นเล่ม</option>
                        <option value="descending">จากท้ายเล่ม</option>
                      </select>
                    </div>
                  )}
                </div>
                {missingSelection > 0 && <p role="status" className="mt-2! text-sm">ฉบับนี้ไม่มี {missingSelection} ข้อจากที่เลือกไว้</p>}
                <ol className="mt-2! max-h-[28rem] divide-y divide-[var(--border-subtle)] overflow-y-auto">
                  {orderedMatches.slice(0, visibleCount).map((verse) => (
                    <li key={verseKey(verse)}>
                      <label className="flex min-w-0 cursor-pointer items-start gap-3 py-3! text-sm">
                        <input type="checkbox" className="mt-1! shrink-0" checked={selected.has(verseKey(verse))}
                          disabled={saving} onChange={(event) => {
                            const checked = event.target.checked
                            setSelected((current) => {
                              const next = new Set(current)
                              if (checked) next.add(verseKey(verse))
                              else next.delete(verseKey(verse))
                              return next
                            })
                            setSavedPlaylist('')
                          }} />
                        <span className="min-w-0 wrap-break-word">
                          <span className="block font-medium text-[var(--accent)]">{verseReference(verse)}</span>
                          <span className="text-[var(--fg-secondary)]">{verse.text}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ol>
                {orderedMatches.length > visibleCount && (
                  <button type="button" className="btn-ghost mt-2!" onClick={() => setVisibleCount(visibleCount + pageSize)}>แสดงอีก {Math.min(pageSize, orderedMatches.length - visibleCount)} ข้อ</button>
                )}
              </>
            )}
          </section>

          <section className={panel} aria-labelledby="scripture-preview">
            <h2 id="scripture-preview" className="text-lg font-medium">ตัวอย่างสไลด์</h2>
            <label className="mt-3! flex flex-col gap-2 text-sm">
              การแบ่งสไลด์
              <select className="input-field" disabled={saving} value={layout} onChange={(event) => {
                const mode = scriptureLibraryLayouts.find((option) => option === event.target.value)
                if (mode) setLayout(mode)
                setPreview(0)
                setSavedPlaylist('')
              }}>
                <option value="output">ตามค่าจอผู้ชม</option>
                <option value="verse">แยกทีละข้อ</option>
                <option value="continuous">จัดข้อความต่อเนื่อง</option>
                <option value="automatic">แบ่งอัตโนมัติตามพื้นที่จอ</option>
                <option value="single">รวมในสไลด์เดียว</option>
              </select>
            </label>
            {paginationRequest && !measured && <p className="mt-3! text-sm" role="status">กำลังแบ่งสไลด์ตามพื้นที่จอ…</p>}
            {measured?.error && <p className={fieldError} role="alert">{measured.error}</p>}
            {cue && slide ? (
              <>
                {previewDesign ? <div className="mt-3! aspect-video overflow-hidden rounded-lg bg-black">
                  <LayeredSlide design={previewDesign} preview />
                </div> : <div style={{ containerType: 'size' }}
                  className="mt-3! flex aspect-video min-h-36 flex-col items-center justify-center-safe gap-3 overflow-y-auto rounded-lg bg-black p-4! text-center text-white">
                  {previewLayout?.before && previewCaption && <p style={previewCaptionSpacing} className="text-sm text-white/80">{previewCaption}</p>}
                  {previewLayout?.showText && previewText && <p className="whitespace-pre-wrap wrap-break-word">
                    {previewText.runs ? <StyledTextRuns runs={previewText.runs} /> : previewText.text}
                  </p>}
                  {!previewLayout?.before && previewCaption && <p style={previewCaptionSpacing} className="text-sm text-white/80">{previewCaption}</p>}
                </div>}
                <div className="mt-3! flex flex-wrap items-center gap-2" aria-label="เลื่อนตัวอย่างสไลด์">
                  <button type="button" className="btn-secondary" disabled={slideIndex === 0} onClick={() => setPreview(slideIndex - 1)}>ก่อนหน้า</button>
                  <span className="text-sm tabular-nums">{slideIndex + 1}/{cue.slides.length}</span>
                  <button type="button" className="btn-secondary" disabled={slideIndex >= cue.slides.length - 1} onClick={() => setPreview(slideIndex + 1)}>ถัดไป</button>
                  <button type="button" className="btn-primary" onClick={() => showPassage({ cue, slide: slideIndex })}>ขึ้นจอผู้ชม</button>
                </div>
              </>
            ) : !paginationRequest && <p className="mt-3! text-sm text-[var(--fg-secondary)]">เลือกข้อพระคัมภีร์เพื่อดูสไลด์</p>}

            {presenterError && <p role="alert" className={`mt-3! ${fieldError}`}>{presenterError}</p>}
            {live && (
              <div className="mt-4! border-t border-[var(--border-subtle)] pt-3!">
                <p role="status" className="text-sm">กำลังแสดง {live.cue.slides[live.slide].label}</p>
                <div className="mt-2! flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" disabled={live.slide === 0}
                    onClick={() => showPassage({ ...live, slide: live.slide - 1 })}>ถอยจอผู้ชม</button>
                  <button type="button" className="btn-secondary" disabled={live.slide >= live.cue.slides.length - 1}
                    onClick={() => showPassage({ ...live, slide: live.slide + 1 })}>เลื่อนจอผู้ชม</button>
                  <button type="button" className="btn-secondary" onClick={() => {
                    sendToPresenter({ type: 'SHOW_BLACK' }, false)
                    setLive(null)
                  }}>ล้างจอผู้ชม</button>
                </div>
              </div>
            )}

            {cue && (
              <form className="mt-4! border-t border-[var(--border-subtle)] pt-4!" onSubmit={addPassage}>
                <label className="flex flex-col gap-2 text-sm">
                  เลือกเพลย์ลิสต์
                  <select value={targetPlaylist?.id ?? ''} required className="input-field" disabled={loadingPlaylists || saving}
                    onChange={(event) => { setPlaylistId(event.target.value); setSavedPlaylist(''); setSaveError('') }}>
                    <option value="">เลือกเพลย์ลิสต์ที่จะเพิ่ม</option>
                    {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
                  </select>
                </label>
                {playlistError && <p className={`mt-2! ${fieldError}`}>เปิดรายการเพลย์ลิสต์ไม่สำเร็จ</p>}
                <button type="submit" className="btn-primary mt-3!" disabled={saving || !targetPlaylist}>
                  {saving ? 'กำลังเพิ่ม…' : 'เพิ่มข้อที่เลือกในเพลย์ลิสต์'}
                </button>
                {saveError && <p role="alert" className={`mt-3! ${fieldError}`}>{saveError}</p>}
                {savedPlaylist && <p role="status" className="mt-3! text-sm">เพิ่มแล้ว · <Link className="text-[var(--accent)] underline" to={`/playlists/${savedPlaylist}`}>เปิดเพลย์ลิสต์</Link></p>}
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
