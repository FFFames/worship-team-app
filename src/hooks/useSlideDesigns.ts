/** Reads and writes shared designs, and applies theme snapshots to playlist occurrences. */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppliedSlideTheme, DesignContent, LibraryDesign } from '../types/slideDesign'
import { backfillImportedCollectionDetails, backfillImportedLayoutDetails, hasImportedLayoutDetails } from '../utils/slideDesignAssets'
import { hasEasyWorshipLayoutChecksums, upgradeLegacyChecksumLayout } from '../utils/easyWorshipLegacyLayoutUpgrade'
import { backfillDesignMediaPlayback, countRestoredDesignSlidePlayback, hasDesignMediaPlayback, hasDesignSlidePlayback } from '../utils/designSlidePlayback'
import { backfillAssignedThemeDetails } from '../utils/defaultThemes'
import { hasDesignGeometry } from '../utils/designLayerGeometry'
import { restorePowerPointSlides } from '../utils/powerPoint/layoutReplacement'

export type DesignInput = Omit<LibraryDesign, 'created_at'>
export type ImportSlideDesigns = (rows: DesignInput[], onInserted?: (ids: string[]) => void,
  onMatched?: (importId: string, destinationId: string, restoredPlayback: number, restoredMediaPlayback?: number) => void,
  independentIds?: ReadonlySet<string>) => Promise<number>

const PAGE_SIZE = 100
const IMPORT_BATCH_SIZE = 10
type LayoutCandidate = Pick<LibraryDesign, 'id' | 'kind' | 'content'>

async function findChecksumLayoutCandidates(batch: DesignInput[]) {
  const uids = [...new Set(batch.flatMap(({ content }) =>
    hasEasyWorshipLayoutChecksums(content) && content.source?.uid ? [content.source.uid] : []))]
  const candidates: LayoutCandidate[] = []
  if (!uids.length) return candidates
  for (;;) {
    let query = supabase.from('slide_designs').select('id,kind,content')
      .eq('content->source->>format', 'easyworship').in('content->source->>uid', uids).order('id').limit(PAGE_SIZE)
    const last = candidates[candidates.length - 1]
    if (last) query = query.gt('id', last.id)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    candidates.push(...data as LayoutCandidate[])
    if (data.length < PAGE_SIZE) return candidates
  }
}

async function updateImportedDesign(target: Pick<LayoutCandidate, 'id' | 'content'>,
  merge: (saved: DesignContent) => DesignContent | undefined) {
  let expected = target.content
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = merge(expected)
    if (!content) return undefined
    if (content === expected) return { content: expected, restoredPlayback: 0, restoredMediaPlayback: 0 }
    const update = await supabase.rpc('refresh_easyworship_design_layout', {
      p_id: target.id, p_expected: expected, p_content: content,
    })
    if (update.error) throw new Error(update.error.message)
    if (update.data === true) return { content, restoredPlayback: countRestoredDesignSlidePlayback(expected.slides, content.slides),
      restoredMediaPlayback: backfillDesignMediaPlayback(expected.slides, content.slides).count }
    if (attempt === 1) throw new Error('สไลด์ถูกแก้ระหว่างนำเข้า กรุณานำเข้าอีกครั้งเพื่ออัปเดตข้อมูลต้นทาง')
    const latest = await supabase.from('slide_designs').select('content').eq('id', target.id).maybeSingle()
    if (latest.error) throw new Error(latest.error.message)
    if (!latest.data) return undefined
    expected = latest.data.content as DesignContent
  }
}

function refreshAssignedTheme(id: string, content: DesignContent) {
  if (content.source?.format !== 'easyworship' || !(hasDesignSlidePlayback(content.slides) || hasDesignMediaPlayback(content.slides)
    || content.slides.some(({ design }) => hasDesignGeometry(design)))) return
  try { backfillAssignedThemeDetails(id, content.slides) }
  catch (error) { console.warn('อัปเดตเอฟเฟ็กต์ในธีมเริ่มต้นของเบราว์เซอร์ไม่สำเร็จ', error) }
}

export function useImportSlideDesigns() {
  return useCallback<ImportSlideDesigns>(async (rows, onInserted, onMatched, independentIds) => {
    let added = 0
    for (let start = 0; start < rows.length; start += IMPORT_BATCH_SIZE) {
      const requested = rows.slice(start, start + IMPORT_BATCH_SIZE)
      const candidates = await findChecksumLayoutCandidates(requested.filter(({ id }) => !independentIds?.has(id)))
      const batch: DesignInput[] = []
      for (const row of requested) {
        if (!independentIds?.has(row.id) && hasEasyWorshipLayoutChecksums(row.content) && !candidates.some(({ id }) => id === row.id)) {
          const sameKind = candidates.filter(({ kind }) => kind === row.kind)
          const known = sameKind.filter(({ content }) => content.easyWorshipChecksumImportId === row.id)
          const matches = known.length ? known : sameKind.filter(({ content }) => upgradeLegacyChecksumLayout(content, row.content, row.id))
          if (matches.length > 1) throw new Error(`พบเลย์เอาต์เดิมที่ตรงกันหลายรายการสำหรับ ${row.title}`)
          const [target] = matches
          if (target) {
            const adopted = await updateImportedDesign(target, (saved) => {
              const merged = upgradeLegacyChecksumLayout(saved, row.content, row.id)
              return merged && backfillImportedCollectionDetails(merged, row.content)
            })
            if (adopted) {
              onMatched?.(row.id, target.id, adopted.restoredPlayback, adopted.restoredMediaPlayback)
              refreshAssignedTheme(target.id, adopted.content)
              target.content = adopted.content
              continue
            }
          }
        }
        batch.push(row)
      }
      if (!batch.length) continue
      const updatableImports = batch.filter(({ content }) => content.source?.collectionDetails || hasImportedLayoutDetails(content))
      const identify = Boolean(onInserted) || updatableImports.length > 0
      const request = supabase.from('slide_designs')
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: true, count: 'exact' })
      const { data, error: saveError, count } = await (identify ? request.select('id') : request)
      if (saveError) throw new Error(saveError.message)
      if (identify && !data) throw new Error('ยืนยันรายการสไลด์ที่บันทึกไม่ได้')
      const inserted = data?.map(({ id }) => id) ?? []
      onInserted?.(inserted)

      const duplicates = new Map(updatableImports.filter(({ id }) => !inserted.includes(id)).map((row) => [row.id, row.content]))
      if (duplicates.size) {
        const current = await supabase.from('slide_designs').select('id,content').in('id', [...duplicates.keys()])
        if (current.error) throw new Error(current.error.message)
        for (const row of (current.data ?? []) as Pick<LibraryDesign, 'id' | 'content'>[]) {
          const incoming = duplicates.get(row.id)
          if (!incoming) continue
          const updated = await updateImportedDesign(row, (saved) =>
            backfillImportedCollectionDetails(backfillImportedLayoutDetails(restorePowerPointSlides(saved, incoming), incoming), incoming))
          if (updated) {
            if (updated.restoredPlayback || updated.restoredMediaPlayback) {
              onMatched?.(row.id, row.id, updated.restoredPlayback, updated.restoredMediaPlayback)
            }
            refreshAssignedTheme(row.id, updated.content)
          }
        }
      }
      added += data?.length ?? count ?? 0
    }
    return added
  }, [])
}

export function useSlideDesigns() {
  const [designs, setDesigns] = useState<LibraryDesign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const files: LibraryDesign[] = []
    let after: string | undefined
    setError('')
    try {
      for (;;) {
        let request = supabase.from('slide_designs').select('*').order('id').limit(PAGE_SIZE)
        if (after) request = request.gt('id', after)
        const { data, error: queryError } = await request
        if (queryError) throw new Error(queryError.message)
        const batch = data as LibraryDesign[]
        files.push(...batch)
        if (batch.length < PAGE_SIZE) break
        after = batch[batch.length - 1].id
      }
      setDesigns(files.sort((left, right) => left.title.localeCompare(right.title, 'th', { numeric: true })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อ่านคลังงานนำเสนอไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const importDesigns = useImportSlideDesigns()

  const saveDesign = useCallback(async ({ id, ...draft }: DesignInput, exists: boolean) => {
    const table = supabase.from('slide_designs')
    const request = exists ? table.update(draft).eq('id', id) : table.insert({ id, ...draft })
    const { data, error: saveError } = await request.select('*').single()
    if (saveError) throw new Error(saveError.message)
    return data as LibraryDesign
  }, [])

  const deleteDesign = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from('slide_designs').delete().eq('id', id).select('id').single()
    if (deleteError) throw new Error(deleteError.message)
  }, [])

  return { designs, loading, error, refresh, importDesigns, saveDesign, deleteDesign }
}

export function usePlaylistTheme() {
  return useCallback(async (playlistId: string, entryId: string, theme: AppliedSlideTheme | null) => {
    const { error } = await supabase.from('playlist_songs')
      .update({ slide_theme: theme })
      .eq('playlist_id', playlistId)
      .eq('id', entryId)
      .select('id')
      .single()
    if (error) throw new Error(error.message)
  }, [])
}
