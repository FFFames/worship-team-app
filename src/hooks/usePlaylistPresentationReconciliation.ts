/** Loads comparable library presentations and saves a reviewed decision atomically. */

import { supabase } from '../lib/supabase'
import type { PlaylistSong } from '../types/database'
import type { LibraryDesign } from '../types/slideDesign'
import { matchesPresentationKind, playlistCueFromLibrary, presentationContentFromCue, presentationSourceUid,
  type PresentationCue, type PresentationDecision } from '../utils/playlistPresentationReconciliation'
import { readScheduleMedia } from '../utils/scheduleMedia'
import { storeSlideDesignAssets } from '../utils/slideDesignAssets'

async function findBy(field: string, value: string, format?: 'easyworship' | 'powerpoint') {
  const candidates: LibraryDesign[] = []
  const pageSize = 50
  for (let offset = 0; ; offset += pageSize) {
    const query = format ? supabase.rpc('find_easyworship_library_presentations', { p_format: format, p_uid: value })
      : supabase.from('slide_designs').select('*').eq('kind', 'presentation').eq(field, value)
    const { data, error } = await query.order('id').range(offset, offset + pageSize - 1)
    if (error?.code === 'PGRST202' && format) return findBy(field, value)
    if (error) throw new Error(error.message)
    candidates.push(...data as LibraryDesign[])
    if (data.length < pageSize) return candidates
  }
}

export async function comparePlaylistPresentation(cue: PresentationCue) {
  const uid = presentationSourceUid(cue)
  const [title, source, linked] = await Promise.all([
    findBy('title', cue.label),
    uid ? findBy('content->source->>uid', uid, cue.kind === 'powerpoint' ? 'powerpoint' : 'easyworship') : [],
    cue.libraryDesignId ? findBy('id', cue.libraryDesignId) : [],
  ])
  const matches = (rows: LibraryDesign[]) => rows.filter((row) => matchesPresentationKind(cue, row))
  const candidates = [...new Map(matches([...linked, ...source, ...title]).map((row) => [row.id, row])).values()]
  const preferred = matches(linked)[0] ?? (matches(source).length === 1 ? matches(source)[0] : undefined)
    ?? (candidates.length === 1 ? candidates[0] : undefined)
  return { candidates, preferred }
}

export async function reconcilePlaylistPresentation(
  entry: PlaylistSong, cue: PresentationCue, action: PresentationDecision, id: string, target?: LibraryDesign,
) {
  if (action !== 'add' && !target) throw new Error('เลือกงานนำเสนอจากคลังก่อนบันทึก')
  const draft = action === 'use_library' ? null : presentationContentFromCue(cue, true)
  const notes = target?.content.notes ?? draft?.notes
  const content = draft && await storeSlideDesignAssets({ ...draft, source: target ? target.content.source : draft.source,
    ...(notes !== undefined ? { notes } : {}),
  }, async (path) => {
    const blob = await readScheduleMedia(entry.playlist_id, path)
    if (!blob) throw new Error('เปิดสื่อในตารางจากเบราว์เซอร์นี้ไม่ได้')
    return blob
  }, { allowMissing: action === 'add' })
  const { data, error } = await supabase.rpc('reconcile_playlist_presentation', {
    p_playlist_id: entry.playlist_id, p_entry_id: entry.id, p_expected_cue: cue,
    p_action: action, p_target_id: id, p_content: content,
    p_expected_design: target ? { title: target.title, content: target.content } : null,
    p_library_cue: action === 'use_library' && target ? playlistCueFromLibrary(cue, target) : null,
  })
  if (error?.code === '40001') throw new Error('งานนำเสนอในตารางหรือคลังถูกแก้จากอีกหน้าต่าง กรุณาตรวจฉบับล่าสุดอีกครั้ง')
  if (error) throw new Error(error.message)
  if (data !== id) throw new Error('ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจรายการอีกครั้ง')
  return content?.warnings ?? []
}
