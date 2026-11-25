import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MediaLibraryItem } from '../types/media'
import { reviewPlaylistMediaUpdates, type PlaylistMediaRow } from '../utils/playlistMediaUpdate'

type Change = ReturnType<typeof reviewPlaylistMediaUpdates>[number]

async function loadPlaylistMediaRows(playlistId: string): Promise<PlaylistMediaRow[]> {
  const rows: PlaylistMediaRow[] = []
  const pageSize = 500
  let after: string | undefined
  for (;;) {
    let request = supabase.from('playlist_songs')
      .select('id, order, cue, background_asset, slide_theme, song:songs(title)')
      .eq('playlist_id', playlistId).order('id').limit(pageSize)
    if (after) request = request.gt('id', after)
    const { data, error } = await request.returns<PlaylistMediaRow[]>()
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < pageSize) return rows
    after = data[data.length - 1].id
  }
}

export function LibraryScheduleUpdate({ playlistId, item, records, disabled }: {
  playlistId: string; item: MediaLibraryItem; records: readonly MediaLibraryItem[]; disabled: boolean
}) {
  const [review, setReview] = useState<{ item: MediaLibraryItem; changes: Change[] }>()
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [action, setAction] = useState<'review' | 'apply'>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const changes = review?.item === item ? review.changes : undefined
  const busy = disabled || action !== undefined

  async function check() {
    if (busy) return
    setAction('review')
    setError('')
    setNotice('')
    setReview(undefined)
    try {
      const rows = await loadPlaylistMediaRows(playlistId)
      const plan = reviewPlaylistMediaUpdates(rows, item, records).sort((a, b) => a.order - b.order)
      setReview({ item, changes: plan })
      setChosen(new Set(plan.map(({ update }) => update.entry_id)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ตรวจรายการสื่อในเพลย์ลิสต์ไม่สำเร็จ')
    } finally { setAction(undefined) }
  }

  async function apply() {
    if (busy || !changes || !chosen.size) return
    setAction('apply')
    setError('')
    const plan = changes.filter(({ update }) => chosen.has(update.entry_id)).map(({ update }) => update)
    try {
      const { error: failure } = await supabase.rpc('update_playlist_media', { p_playlist_id: playlistId, p_updates: plan })
      if (failure?.code === '40001') {
        setReview(undefined)
        throw new Error('เพลย์ลิสต์ถูกแก้ไขจากอีกหน้าต่างแล้ว กรุณาตรวจรายการล่าสุดอีกครั้ง')
      }
      if (failure) throw new Error(failure.message)
      setReview(undefined)
      setNotice(`อัปเดตสื่อในเพลย์ลิสต์แล้ว ${plan.length} รายการ`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อัปเดตสื่อในเพลย์ลิสต์ไม่สำเร็จ')
    } finally { setAction(undefined) }
  }

  return <details className="w-full min-w-0 text-sm">
    <summary className="cursor-pointer font-medium">อัปเดตสื่อในเพลย์ลิสต์</summary>
    <div className="mt-2! grid min-w-0 gap-3">
      <p className="text-[var(--fg-secondary)]">นำช่วงเล่น การตั้งค่าวิดีโอ และชื่อจากคลังไปใช้กับรายการที่เลือกในเพลย์ลิสต์นี้</p>
      <button type="button" className="btn-secondary justify-self-start" disabled={busy} onClick={() => void check()}>
        {action === 'review' ? 'กำลังตรวจรายการ…' : 'ตรวจรายการที่จะอัปเดต'}
      </button>
      {review && !changes && <p role="status">ข้อมูลสื่อเปลี่ยนแล้ว กรุณาตรวจรายการอีกครั้ง</p>}
      {changes?.length === 0 && <p role="status">ไม่พบรายการที่จับคู่กับสื่อนี้ได้และต้องอัปเดต</p>}
      {changes && changes.length > 0 && <fieldset className="grid min-w-0 gap-2" disabled={busy}>
        <legend>รายการที่จะอัปเดต</legend>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {changes.map(({ label, order, update }) => <label key={update.entry_id} className="flex min-w-0 items-start gap-2 py-1!">
            <input type="checkbox" className="mt-1! shrink-0" checked={chosen.has(update.entry_id)}
              onChange={(event) => {
                const next = new Set(chosen)
                if (event.currentTarget.checked) next.add(update.entry_id)
                else next.delete(update.entry_id)
                setChosen(next)
              }} />
            <span className="wrap-anywhere">{order + 1}. {label}</span>
          </label>)}
        </div>
        <button type="button" className="btn-primary justify-self-start" disabled={!chosen.size} onClick={() => void apply()}>
          {action === 'apply' ? 'กำลังอัปเดต…' : `อัปเดต ${chosen.size} รายการ`}
        </button>
      </fieldset>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
    </div>
  </details>
}
