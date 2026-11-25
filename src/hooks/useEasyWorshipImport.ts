/** Saves reviewed EasyWorship songs through the library's existing Supabase table. */

import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { formatLyricsOnly } from '../utils/chordParser'
import { sectionLyricText, songLibrarySections } from '../utils/songLibrarySlides'
import { alignedLyricRuns } from '../utils/songLyricFormatting'
import { easyWorshipSongIdentity } from '../utils/easyWorshipSongIdentity'
import type { EasyWorshipSong } from '../utils/easyWorship'
import type { SongAppearance } from '../types/slideDesign'
import { storeSongAppearance, type SlideAssetReader } from '../utils/slideDesignAssets'
import type { WithMediaBlob } from '../utils/zipAsset'
import type { ProfileItemOutcome } from '../utils/easyWorshipProfileImport'
import { missingEasyWorshipSongFields, type SongImportSnapshot } from '../utils/easyWorshipSongRefresh'

const BATCH_SIZE = 50

export type ImportProgress = { added: number; duplicates: number; filled?: number; warnings?: string[] }
export type SongImportBatch = ImportProgress & { items: ProfileItemOutcome[] }

/** Content-derived IDs let Postgres ignore repeats and concurrent imports without overwriting edits. */
async function makeSongRow(song: EasyWorshipSong) {
  const rawContent = formatLyricsOnly(song.sections)
  const id = await easyWorshipSongIdentity(song, rawContent)
  const nativeDesigns = new Set(song.appearance?.sections?.map(({ index }) => index))
  const sections = songLibrarySections({ raw_content: rawContent, sections: null }).map((section, index) => {
    const source = song.sections[index]
    const runs = !nativeDesigns.has(index) && alignedLyricRuns(sectionLyricText(section), source?.lyricRuns)
    return { ...section, ...(runs ? { lyricRuns: runs } : {}), ...(source?.slideLabel ? { slideLabel: source.slideLabel } : {}),
      ...(source?.transition ? { transition: source.transition } : {}), ...(source?.playback ? { playback: source.playback } : {}) }
  })

  return {
    id,
    title: song.title,
    artist: song.author,
    copyright: song.copyright,
    ccli_number: song.ccli,
    raw_content: rawContent,
    sections,
    user_id: 'default',
  }
}

type SavedImportSong = SongImportSnapshot & { id: string; updated_at: string }
type ImportRow = Awaited<ReturnType<typeof makeSongRow>> & { appearance?: SongAppearance }
type SavedSongIdentity = { import_id: string; destination_id: string; inserted: boolean; filled: boolean }
type FillResult = { filled?: true; stale?: true; appearance?: SongAppearance | null }
const savedFields = 'id,raw_content,sections,appearance,updated_at'
const filledNote = 'เติมรูปแบบหรือไฟล์ที่ขาดในเพลงเดิมแล้ว'
const recoveredNote = 'เติมข้อมูลต้นฉบับในเพลงที่กู้ไว้แล้ว'

async function saveSongRows(rows: ImportRow[], songs: EasyWorshipSong[]) {
  const wordsRows: Array<ImportRow & { words_id: string; words_record_id?: string; lyrics_only: boolean; recovery_title: string }> = []
  const otherRows: ImportRow[] = []
  for (const [index, row] of rows.entries()) {
    const recovery = songs[index].wordsRecovery
    if (recovery) wordsRows.push({
      ...row, words_id: recovery.id, words_record_id: recovery.recordId, lyrics_only: recovery.lyricsOnly, recovery_title: recovery.title,
    })
    else otherRows.push(row)
  }
  const saved = new Map<string, SavedSongIdentity>()
  if (wordsRows.length) {
    const { data, error } = await supabase.rpc('import_easyworship_word_songs', { p_songs: wordsRows })
    if (error) throw new Error(error.message)
    if (!Array.isArray(data) || data.length !== wordsRows.length) throw new Error('ยืนยันการบันทึกเพลงจาก SongWords ไม่ได้')
    for (const result of data as SavedSongIdentity[]) {
      const previous = saved.get(result.import_id)
      saved.set(result.import_id, { ...result, inserted: result.inserted || previous?.inserted === true,
        filled: result.filled || previous?.filled === true })
    }
  }
  if (otherRows.length) {
    const { data, error } = await supabase.from('songs').upsert(otherRows, { onConflict: 'id', ignoreDuplicates: true }).select('id')
    if (error) throw new Error(error.message)
    const inserted = new Set(data.map(({ id }) => id))
    for (const { id } of otherRows) saved.set(id, { import_id: id, destination_id: id, inserted: inserted.has(id), filled: false })
  }
  return saved
}

export async function resolveEasyWorshipSongIds(ids: string[]) {
  const matches = new Map<string, string | null>()
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE).join(',')
    const { data, error } = await supabase.from('songs').select('id,easyworship_import_id,easyworship_words_record_id')
      .or(`id.in.(${batch}),easyworship_import_id.in.(${batch}),easyworship_words_record_id.in.(${batch})`).order('id')
    if (error) throw new Error(error.message)
    for (const { id, easyworship_import_id: importId, easyworship_words_record_id: recordId } of data) {
      if (importId && !matches.has(importId)) matches.set(importId, id)
      if (recordId && matches.get(recordId) !== recordId) {
        matches.set(recordId, matches.has(recordId) && matches.get(recordId) !== id ? null : id)
      }
      // A real song ID takes precedence over aliases found in restored backups.
      matches.set(id, id)
    }
  }
  return new Map([...matches].flatMap(([id, match]) => match ? [[id, match]] : []))
}

async function fillExistingSong(saved: SavedImportSong, source: SongImportSnapshot): Promise<FillResult> {
  let current = saved
  for (let attempt = 0; attempt < 2; attempt++) {
    const patch = missingEasyWorshipSongFields(current, source)
    if (!patch.appearance && !patch.sections) return { appearance: current.appearance }
    const { data, error } = await supabase.from('songs').update(patch).eq('id', current.id)
      .eq('updated_at', current.updated_at).select('id')
    if (error) throw new Error(error.message)
    if (data.length) return { filled: true, appearance: patch.appearance ?? current.appearance }
    if (attempt === 0) {
      const { data: latest, error: lookupError } = await supabase.from('songs').select(savedFields).eq('id', current.id).maybeSingle()
      if (lookupError) throw new Error(lookupError.message)
      if (!latest) return { stale: true }
      current = latest as SavedImportSong
    }
  }
  return { stale: true, appearance: current.appearance }
}

export function useEasyWorshipImport() {
  return useCallback(async (songs: EasyWorshipSong[], onBatch: (batch: SongImportBatch) => void, readAsset?: SlideAssetReader, withAsset?: WithMediaBlob) => {
    const cache = new Map<string, string | null>()
    for (let offset = 0; offset < songs.length; offset += BATCH_SIZE) {
      const batch = songs.slice(offset, offset + BATCH_SIZE)
      let items: ProfileItemOutcome[] = []
      let completed = false
      const pending = new Map<string, Set<string>>()
      const warnings: string[] = []
      const notes = new Map<string, string[]>()
      try {
        const drafts = await Promise.all(batch.map(makeSongRow))
        const rows: ImportRow[] = []
        for (const [index, song] of batch.entries()) {
          const appearance = song.appearance && (song.appearance.defaultDesign || song.appearance.sections?.length || song.appearance.looping !== undefined)
            ? await storeSongAppearance(song.appearance, readAsset, cache, withAsset) : undefined
          rows.push({ ...drafts[index], ...(appearance ? { appearance } : {}) })
          if (appearance?.warnings?.length) notes.set(song.sourceId, appearance.warnings)
        }
        const saved = await saveSongRows(rows, batch)
        items = batch.map((song, index) => {
          const result = saved.get(rows[index].id)
          if (!result?.destination_id) throw new Error('ยืนยันรหัสเพลงปลายทางไม่ได้')
          rows[index].id = result.destination_id
          return {
            sourceId: song.sourceId, destinationId: result.destination_id,
            status: result.inserted ? 'saved' : 'duplicate', filled: result.filled,
            notes: [...(notes.get(song.sourceId) ?? []), ...(result.filled ? [recoveredNote] : [])],
          }
        })
        const details = batch.flatMap((song, index) => song.administrator || song.description || song.tags?.length || song.sourceUid ? [{
          id: rows[index].id, copyright_administrator: song.administrator, description: song.description, tags: song.tags,
          easyworship_uid: song.sourceUid,
        }] : [])

        for (const { id } of details) pending.set(id, new Set(['ข้อมูลเพลงเพิ่มเติม']))
        if (details.length) {
          const { error: detailsError } = await supabase.rpc('fill_easyworship_song_details', { p_details: details })
          if (detailsError) throw new Error(detailsError.message)
          for (const { id } of details) pending.get(id)?.delete('ข้อมูลเพลงเพิ่มเติม')
        }
        const candidates = rows.filter((row, index) => items[index].status === 'duplicate'
          && (row.appearance || row.sections.some((section) => section.lyricRuns || section.slideLabel || section.transition || section.playback)))
        if (candidates.length) {
          for (const { id } of candidates) pending.set(id, new Set(['รูปแบบสไลด์เพลง']))
          const { data: existing, error: lookupError } = await supabase.from('songs').select(savedFields)
            .in('id', candidates.map(({ id }) => id))
          if (lookupError) throw new Error(lookupError.message)
          const byId = new Map((existing as SavedImportSong[]).map((saved) => [saved.id, saved]))
          for (const source of candidates) {
            const saved = byId.get(source.id)
            const result: FillResult = saved ? await fillExistingSong(saved, source) : { stale: true }
            const item = items.find(({ destinationId }) => destinationId === source.id)
            if (item) {
              item.filled ||= result.filled
              item.notes = [...(item.notes?.filter((note) => note === recoveredNote) ?? []),
                ...(result.appearance?.warnings ?? []), ...(result.filled ? [filledNote] : []),
                ...(result.stale ? ['เพลงเปลี่ยนระหว่างนำเข้า กรุณาลองนำเข้าอีกครั้ง'] : [])]
            }
            pending.delete(source.id)
          }
        }
        for (const [index, item] of items.entries()) {
          const song = batch[index]
          const sourceWarnings = item.notes?.filter((note) => note !== filledNote && note !== recoveredNote) ?? []
          warnings.push(...sourceWarnings.map((warning) => `${song.title} · ${warning}`))
        }
        completed = true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'บันทึกเพลงไม่สำเร็จ'
        if (items.length) {
          for (const item of items) {
            const fields = pending.get(item.destinationId ?? '')
            if (fields?.size) item.error = `ยังไม่ยืนยัน${[...fields].join('และ')} · ${message}`
          }
        } else {
          items = batch.map((song) => ({ sourceId: song.sourceId, status: 'failed', error: message, notes: notes.get(song.sourceId) }))
        }
        throw error
      } finally {
        onBatch({
          added: completed ? items.filter(({ status }) => status === 'saved').length : 0,
          duplicates: completed ? items.filter(({ status }) => status === 'duplicate').length : 0,
          items, filled: items.filter(({ filled }) => filled).length, ...(warnings.length ? { warnings } : {}),
        })
      }
    }
  }, [])
}
