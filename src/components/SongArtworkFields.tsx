/** Edits positioned text and media in the active song layout. */

import { useId, useState } from 'react'
import type { PlaylistCue } from '../types/database'
import type { DvdClip } from '../types/dvdClip'
import type { MediaLibraryItem } from '../types/media'
import type { LiveFeed } from '../types/liveFeed'
import type { SongArtwork, SongArtworkChange, SongArtworkLayer } from '../types/slideDesign'
import { songCueLyrics } from '../utils/songCueLayout'
import { editDesignText, isCanvasBackground } from '../utils/slideDesign'
import { editableSongArtwork, songArtworkChangeId, updateSongArtworkFrame, updateSongArtworkLayer } from '../utils/songSlideLayout'
import { libraryMediaVisual } from '../utils/mediaLibrary'
import { dvdDesignAsset } from '../utils/dvdReplacement'
import { mediaObjectFit } from '../utils/mediaPlayback'
import { positionedFeedLayer } from '../utils/livePresentation'
import { ScriptureFrameButton } from './ScriptureFrameButton'
import { InsertSlideShape, ShapeFrameFields } from './ShapeFrameFields'
import { authoredShapeGroup, shapePresets } from '../utils/slideShapePresets'
import { changeElementShape, editShapeCaption, moveSlideElement } from '../utils/slideElementEffects'

const field = 'grid min-w-0 gap-1 text-sm'
const frameFields = [['x', 'ตำแหน่งซ้ายของชั้น (%)'], ['y', 'ตำแหน่งบนของชั้น (%)'],
  ['width', 'ความกว้างของชั้น (%)'], ['height', 'ความสูงของชั้น (%)']] as const

function layerTitle(layer: SongArtworkLayer) {
  if (layer.kind === 'fill') return layer.presetShape ? shapePresets[layer.presetShape.preset] : 'รูปทรง'
  return layer.kind === 'text' ? layer.scriptureSource?.label || layer.text.trim().split('\n')[0] || 'กล่องข้อความว่าง' : layer.asset.filename
}

export function SongArtworkFields({ artwork, slide, media, feeds, dvds, onChange }: {
  artwork?: SongArtwork
  slide?: PlaylistCue['slides'][number]
  media: MediaLibraryItem[]
  feeds: LiveFeed[]
  dvds: DvdClip[]
  onChange: (artwork?: SongArtwork) => void
}) {
  const id = useId()
  const [selected, setSelected] = useState('')
  const stack = slide?.design?.layers.filter((layer) => !isCanvasBackground(layer)) ?? []
  const body = slide && songCueLyrics(slide)?.layer
  const layers = stack.filter((layer): layer is SongArtworkLayer => editableSongArtwork(layer, body?.id))
  const layer = layers.find((layer) => layer.id === selected) ?? layers[layers.length - 1]
  const changes = artwork?.changes ?? []
  const local = changes.find((change) => songArtworkChangeId(change) === layer?.id)
  const hidden = changes.filter((change) => change.action === 'hide')
  const owner = layer && (layer.kind === 'fill' || layer.kind === 'media') && authoredShapeGroup(layer.id) === layer.id ? layer : undefined
  const caption = owner && stack.find((item) => item.id === `${owner.id}:text`)
  const back = layer && moveSlideElement(stack, layer.id, -1)
  const front = layer && moveSlideElement(stack, layer.id, 1)

  function save(next: SongArtworkChange[], order = artwork?.order) {
    onChange(next.length || order?.length ? {
      ...(next.length ? { changes: next } : {}), ...(order?.length ? { order } : {}),
    } : undefined)
  }

  function store(change: SongArtworkChange) {
    const layerId = songArtworkChangeId(change)
    const index = changes.findIndex((item) => songArtworkChangeId(item) === layerId)
    save(index < 0 ? [...changes, change] : changes.map((item, position) => position === index ? change : item))
  }

  function addLayer(layer: SongArtworkLayer) {
    store({ action: 'add', layer })
    setSelected(layer.id)
  }

  function add(textOrMedia?: MediaLibraryItem) {
    const visual = textOrMedia && libraryMediaVisual(textOrMedia)
    if (textOrMedia && !visual) return
    const layerId = 'song-art:' + crypto.randomUUID()
    const next: SongArtworkLayer = visual ? {
      id: layerId, kind: 'media', frame: { x: .67, y: .06, width: .26, height: .25 }, ...visual,
    } : { id: layerId, kind: 'text', text: '', frame: { x: .08, y: .78, width: .84, height: .16 },
      style: { align: 'center', fontSize: .045, fitText: true } }
    addLayer(next)
  }

  function update(next: SongArtworkLayer) {
    onChange(updateSongArtworkFrame(artwork, stack, next))
  }

  function remove(ids: string[]) {
    const hidden = ids.filter((id) => !changes.some((change) => change.action === 'add' && change.layer.id === id))
    save([...changes.filter((change) => !ids.includes(songArtworkChangeId(change))), ...hidden.map((id) => ({ action: 'hide' as const, id }))],
      artwork?.order?.filter((id) => !ids.includes(id)))
  }

  function captionText(text: string) {
    if (!owner) return
    const next = editShapeCaption(stack, owner, text)
    const id = `${owner.id}:text`
    const changed = next.find((item) => item.id === id)
    if (changed?.kind !== 'text') { remove([id]); return }
    const localCaption = changes.find((item) => songArtworkChangeId(item) === id)
    const saved: SongArtworkChange = { action: localCaption?.action === 'add' || (!caption && !localCaption) ? 'add' : 'update', layer: changed }
    save([...changes.filter((item) => songArtworkChangeId(item) !== id), saved], next.map(({ id }) => id))
  }

  return <details className="min-w-0 rounded-md border border-[var(--border-subtle)] p-3">
    <summary className="cursor-pointer font-medium">ข้อความและสื่อซ้อน</summary>
    <div className="mt-3 grid min-w-0 gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => add()}>เพิ่มกล่องข้อความ</button>
        <InsertSlideShape onAdd={addLayer} />
        <ScriptureFrameButton onChange={addLayer} />
        <div className={field}>
          <label htmlFor={`${id}-add-media`}>เพิ่มภาพหรือวิดีโอซ้อน</label>
          <select id={`${id}-add-media`} className="input-field min-w-0" value="" onChange={(event) => {
            const item = media.find((asset) => asset.id === event.currentTarget.value)
            if (item) add(item)
          }}>
            <option value="">เลือกจากคลังสื่อ</option>
            {media.filter(({ kind }) => kind !== 'audio').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        {dvds.length > 0 && <div className={field}>
          <label htmlFor={`${id}-add-dvd`}>เพิ่มกรอบคลิป DVD ในเพลง</label>
          <select id={`${id}-add-dvd`} className="input-field min-w-0" value="" onChange={(event) => {
            const dvd = dvds.find((item) => item.id === event.currentTarget.value)
            if (dvd) addLayer({ kind: 'media', id: 'song-art:' + crypto.randomUUID(),
              frame: { x: .67, y: .06, width: .26, height: .25 }, asset: dvdDesignAsset(dvd),
              fit: mediaObjectFit(dvd.playback) ?? 'contain', loop: Boolean(dvd.repeat) })
          }}>
            <option value="">เลือกคลิปจากคลัง DVD</option>
            {dvds.map((dvd) => <option key={dvd.id} value={dvd.id}>{dvd.name}</option>)}
          </select>
        </div>}
        {feeds.length > 0 && <div className={field}>
          <label htmlFor={`${id}-add-feed`}>เพิ่มกรอบสัญญาณสดในเพลง</label>
          <select id={`${id}-add-feed`} className="input-field min-w-0" value="" onChange={(event) => {
            const feed = feeds.find((item) => item.id === event.currentTarget.value)
            if (feed) addLayer(positionedFeedLayer(feed))
          }}>
            <option value="">เลือกสัญญาณจากคลัง</option>
            {feeds.map((feed) => <option key={feed.id} value={feed.id}>{feed.name}</option>)}
          </select>
        </div>}
      </div>
      {layer && <>
        <div className={field}>
          <label htmlFor={`${id}-layer`}>ชั้นที่จะจัดวาง</label>
          <select id={`${id}-layer`} className="input-field min-w-0" value={layer.id} onChange={(event) => setSelected(event.currentTarget.value)}>
            {layers.map((item) => <option key={item.id} value={item.id}>{layerTitle(item)}</option>)}
          </select>
        </div>
        {layer.kind === 'text' ? <>
          {layer.scriptureSource && <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{layer.scriptureSource.label}</span>
            <ScriptureFrameButton frame={layer} className="chip-btn" onChange={update} />
          </div>}
          <div className={field}>
            <label htmlFor={`${id}-text`}>ข้อความในกล่อง</label>
            <textarea id={`${id}-text`} className="input-field min-w-0" rows={2} value={layer.text}
              onChange={(event) => update(editDesignText(layer, event.currentTarget.value))} />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <div className={field}>
              <label htmlFor={`${id}-align`}>จัดแนวข้อความในกล่อง</label>
              <select id={`${id}-align`} className="input-field min-w-0" value={layer.style?.align ?? 'center'}
                onChange={(event) => {
                  const align = event.currentTarget.value
                  if (align === 'left' || align === 'center' || align === 'right') update({ ...layer, style: { ...layer.style, align } })
                }}>
                <option value="left">ซ้าย</option><option value="center">กลาง</option><option value="right">ขวา</option>
              </select>
            </div>
            <label className={field}>ขนาดตัวอักษรในกล่อง (%)
              <input className="input-field min-w-0" type="number" step="any" value={(layer.style?.fontSize ?? .045) * 100}
                onChange={(event) => {
                  const size = event.currentTarget.valueAsNumber
                  if (size >= 1 && size <= 30) update({ ...layer, style: { ...layer.style, fontSize: size / 100 } })
                }} />
            </label>
          </div>
        </> : layer.kind === 'media' ? <div className={field}>
          <label htmlFor={`${id}-fit`}>การจัดขนาดสื่อในกรอบ</label>
          <select id={`${id}-fit`} className="input-field min-w-0" value={layer.fit ?? 'contain'} onChange={(event) => {
            const fit = event.currentTarget.value
            if (fit === 'contain' || fit === 'cover' || fit === 'fill') update({ ...layer, fit })
          }}>
            <option value="contain">เห็นทั้งภาพ</option><option value="cover">เต็มกรอบแบบตัดขอบ</option><option value="fill">ยืดเต็มกรอบ</option>
          </select>
        </div> : layer.kind === 'camera' ? <div className={field}>
          <label htmlFor={`${id}-feed-fit`}>การจัดขนาดสัญญาณสดในกรอบ</label>
          <select id={`${id}-feed-fit`} className="input-field min-w-0" value={layer.asset.feedVideo?.fit ?? 'auto'} onChange={(event) => {
            const fit = event.currentTarget.value
            if (fit === 'auto' || fit === 'contain' || fit === 'cover' || fit === 'fill') {
              update({ ...layer, asset: { ...layer.asset, feedVideo: { ...layer.asset.feedVideo, fit } } })
            }
          }}>
            <option value="auto">อัตโนมัติ</option>
            <option value="contain">เห็นทั้งภาพ</option>
            <option value="cover">เต็มกรอบแบบตัดขอบ</option>
            <option value="fill">ยืดเต็มกรอบ</option>
          </select>
        </div> : null}
        <ShapeFrameFields layer={layer} media={media} showTransform={false}
          onShapeChange={(settings) => onChange(changeElementShape(stack, layer.id, settings).reduce((artwork, changed, index) =>
            changed !== stack[index] && editableSongArtwork(changed, body?.id) ? updateSongArtworkLayer(artwork, changed) : artwork, artwork))}
          onChange={(changed) => {
            if (editableSongArtwork(changed, body?.id)) update(changed)
          }} />
        {owner && owner.presetShape && owner.presetShape.preset !== 'line' && <label className={field}>ข้อความในรูปทรง
          <textarea rows={2} className="input-field min-w-0" value={caption?.kind === 'text' ? caption.text : ''}
            onChange={(event) => captionText(event.currentTarget.value)} />
        </label>}
        <div className="grid min-w-0 grid-cols-2 gap-2">
          {frameFields.map(([key, label]) => {
            const size = key === 'width' || key === 'height'
            return <label className={field} key={key}>{label}
              <input className="input-field min-w-0 tabular-nums" type="number" step="any" value={Number((layer.frame[key] * 100).toFixed(2))}
                onChange={(event) => {
                  const amount = event.currentTarget.valueAsNumber
                  if (amount >= (size ? 1 : -100) && amount <= (size ? 200 : 100)) update({ ...layer, frame: { ...layer.frame, [key]: amount / 100 } })
                }} />
            </label>
          })}
          <label className={field}>หมุนชั้น (องศา)
            <input className="input-field min-w-0 tabular-nums" type="number" step="any" value={layer.rotation ?? 0} onChange={(event) => {
              const rotation = event.currentTarget.valueAsNumber
              if (rotation >= -360 && rotation <= 360) update({ ...layer, rotation })
            }} />
          </label>
          <label className={field}>ความทึบของชั้น (%)
            <input className="input-field min-w-0 tabular-nums" type="number" step="any" value={Number(((layer.opacity ?? 1) * 100).toFixed(2))}
              onChange={(event) => {
                const amount = event.currentTarget.valueAsNumber
                if (amount >= 0 && amount <= 100) update({ ...layer, opacity: amount / 100 })
              }} />
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className="chip-btn" disabled={front === stack} onClick={() => save(changes, front?.map(({ id }) => id))}>เลื่อนชั้นไปด้านหน้า</button>
          <button type="button" className="chip-btn" disabled={back === stack} onClick={() => save(changes, back?.map(({ id }) => id))}>เลื่อนชั้นไปด้านหลัง</button>
          <button type="button" className="btn-ghost"
            onClick={() => remove(caption ? [layer.id, caption.id] : [layer.id])}>{local?.action === 'add' ? 'ลบชั้นที่เลือก' : 'ซ่อนชั้นที่เลือก'}</button>
          {local?.action === 'update' && <button type="button" className="btn-ghost"
            onClick={() => save(changes.filter((change) => change !== local))}>คืนรูปแบบของชั้น</button>}
        </div>
      </>}
      {hidden.length > 0 && <button type="button" className="btn-ghost justify-self-start"
        onClick={() => save(changes.filter((change) => change.action !== 'hide'))}>แสดงชั้นที่ซ่อนไว้ ({hidden.length})</button>}
      {artwork && <button type="button" className="btn-ghost justify-self-start" onClick={() => onChange()}>คืนการจัดชั้นที่สืบทอด</button>}
    </div>
  </details>
}
