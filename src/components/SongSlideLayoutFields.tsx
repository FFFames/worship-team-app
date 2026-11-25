/** Edits the background and lyric frame inherited by a song slide. */

import { useId } from 'react'
import type { PlaylistCue } from '../types/database'
import type { DvdClip } from '../types/dvdClip'
import type { MediaLibraryItem } from '../types/media'
import type { LiveFeed } from '../types/liveFeed'
import type { DesignFrame, DesignTextStyle, SongSlideLayout } from '../types/slideDesign'
import { songCueLyrics } from '../utils/songCueLayout'
import { applySongSlideLayout, defaultSongFrame, defaultSongText, editableSongArtwork, updateSongArtworkFrame, updateSongElementEffects } from '../utils/songSlideLayout'
import { libraryMediaVisual } from '../utils/mediaLibrary'
import { dvdDesignAsset } from '../utils/dvdReplacement'
import { liveFeedAsset } from '../utils/livePresentation'
import { SongArtworkFields } from './SongArtworkFields'
import { SlideLayoutPreview } from './SlideLayoutPreview'

const labelClass = 'grid min-w-0 gap-1 text-sm'
const frameLabels = { x: 'ตำแหน่งซ้าย', y: 'ตำแหน่งบน', width: 'ความกว้าง', height: 'ความสูง' } as const

export function SongSlideLayoutFields({ layout, effective, media, feeds, dvds, playlistId, onChange }: {
  layout?: SongSlideLayout
  effective?: PlaylistCue['slides'][number]
  media: MediaLibraryItem[]
  feeds: LiveFeed[]
  dvds: DvdClip[]
  playlistId?: string
  onChange: (layout: SongSlideLayout | undefined) => void
}) {
  const id = useId()
  const body = effective && songCueLyrics(effective)?.layer
  const preview = effective && (body ? effective : applySongSlideLayout(effective, {}))
  const lyricId = preview && songCueLyrics(preview)?.layer?.id
  const frame = body?.frame ?? defaultSongFrame
  const style = body ? body.style ?? {} : defaultSongText
  const background = layout?.background
  const backgroundDvd = background?.kind === 'media' ? background.asset.dvd : undefined
  const color = background?.kind === 'fill' && background.fill.type === 'solid' ? background.fill.color : '#000000'

  function updateStyle(patch: SongSlideLayout['style']) {
    onChange({ ...layout, style: { ...layout?.style, ...patch } })
  }

  function chooseBackground(id: string) {
    const item = media.find((file) => file.id === id)
    const visual = item && libraryMediaVisual(item, true)
    if (!visual) return
    const { asset, loop } = visual
    onChange({ ...layout, background: { kind: 'media', asset, ...(loop !== undefined ? { loop } : {}) } })
  }

  return <div className="grid min-w-0 gap-3">
    {preview?.design && <SlideLayoutPreview design={preview.design} playlistId={playlistId}
      editableIds={new Set(preview.design.layers.filter((layer) => layer.id === lyricId || editableSongArtwork(layer, lyricId)).map(({ id }) => id))}
      normalizeFrame={(layerId, next) => layerId === lyricId ? {
        x: Math.max(0, next.x), y: Math.max(0, next.y), width: Math.min(1, Math.max(.01, next.width)), height: Math.min(1, Math.max(.01, next.height)),
      } : next}
      onFrameChange={(layerId, frame) => {
        if (layerId === lyricId) onChange({ ...layout, frame })
        else {
          const layer = preview.design?.layers.find(({ id }) => id === layerId)
          if (preview.design && layer && editableSongArtwork(layer, lyricId)) {
            onChange({ ...layout, artwork: updateSongArtworkFrame(layout?.artwork, preview.design.layers, { ...layer, frame }) })
          }
        }
      }} onElementEffectsChange={(layerId, effects) => onChange({
        ...layout, elementEffects: updateSongElementEffects(layout?.elementEffects, layerId === lyricId ? undefined : layerId, effects),
      })} />}
    <div className="grid min-w-0 grid-cols-2 gap-2">
      {(Object.keys(frameLabels) as (keyof DesignFrame)[]).map((key) => {
        const minimum = key === 'width' || key === 'height' ? 1 : 0
        return <div className={labelClass} key={key}>
          <label htmlFor={`${id}-${key}`}>{frameLabels[key]} (%)</label>
          <input className="input-field min-w-0" id={`${id}-${key}`} type="number" step="any"
            value={Number((frame[key] * 100).toFixed(2))} onChange={(event) => {
              const amount = event.currentTarget.valueAsNumber
              if (Number.isFinite(amount) && amount >= minimum && amount <= 100) {
                onChange({ ...layout, frame: { ...layout?.frame, [key]: amount / 100 } })
              }
            }} />
        </div>
      })}
      <div className={labelClass}>
        <label htmlFor={`${id}-horizontal`}>จัดแนวนอน</label>
        <select className="input-field min-w-0" id={`${id}-horizontal`} value={style.align ?? 'center'}
          onChange={(event) => updateStyle({ align: event.currentTarget.value as DesignTextStyle['align'] })}>
          <option value="left">ซ้าย</option><option value="center">กลาง</option><option value="right">ขวา</option>
        </select>
      </div>
      <div className={labelClass}>
        <label htmlFor={`${id}-vertical`}>จัดแนวตั้ง</label>
        <select className="input-field min-w-0" id={`${id}-vertical`} value={style.verticalAlign ?? 'center'}
          onChange={(event) => updateStyle({ verticalAlign: event.currentTarget.value as DesignTextStyle['verticalAlign'] })}>
          <option value="top">บน</option><option value="center">กลาง</option><option value="bottom">ล่าง</option>
        </select>
      </div>
      <div className={labelClass}>
        <label htmlFor={`${id}-size`}>ขนาดตัวอักษร (% ความสูงจอ)</label>
        <input id={`${id}-size`} className="input-field min-w-0" type="number" step="any"
          value={Number(((style.fontSize ?? 0.045) * 100).toFixed(2))} onChange={(event) => {
            const size = event.currentTarget.valueAsNumber
            if (size >= 1 && size <= 30) updateStyle({ fontSize: size / 100 })
          }} />
      </div>
      <label className="flex min-w-0 items-center gap-2 text-sm">
        <input type="checkbox" checked={body?.textLayout?.sizing ? body.textLayout.sizing === 'fit' : Boolean(style.fitText)}
          onChange={(event) => updateStyle({ fitText: event.currentTarget.checked })} />พอดีกับกรอบ
      </label>
    </div>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      <div className={labelClass}>
        <label htmlFor={`${id}-background`}>สีพื้นหลังของสไลด์</label>
        <div className="flex min-w-0 items-center gap-2">
          <input id={`${id}-background`} type="color" className="h-9 w-12 shrink-0" value={/^#[\da-f]{6}$/i.test(color) ? color : '#000000'}
            onChange={(event) => onChange({ ...layout, background: { kind: 'fill', fill: { type: 'solid', color: event.currentTarget.value } } })} />
          <button type="button" className="btn-ghost" onClick={() => onChange({ ...layout, background: { kind: 'fill', fill: { type: 'solid', color } } })}>ใช้สีพื้นหลัง</button>
        </div>
      </div>
      <div className={labelClass}>
        <label htmlFor={`${id}-media`}>ภาพหรือวิดีโอพื้นหลัง</label>
        <select id={`${id}-media`} className="input-field min-w-0" value="" onChange={(event) => chooseBackground(event.currentTarget.value)}>
          <option value="">{background?.kind === 'media' && !backgroundDvd ? background.asset.filename : 'เลือกจากคลังสื่อ'}</option>
          {media.filter((item) => item.kind !== 'audio').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      {(dvds.length > 0 || backgroundDvd) && <div className={labelClass}>
        <label htmlFor={`${id}-dvd`}>คลิป DVD พื้นหลัง</label>
        <select id={`${id}-dvd`} className="input-field min-w-0" value="" onChange={(event) => {
          const dvd = dvds.find((item) => item.id === event.currentTarget.value)
          if (dvd) onChange({ ...layout, background: { kind: 'media', asset: dvdDesignAsset(dvd), loop: Boolean(dvd.repeat) } })
        }}>
          <option value="">{backgroundDvd?.name ?? 'เลือกคลิปจากคลัง DVD'}</option>
          {dvds.map((dvd) => <option key={dvd.id} value={dvd.id}>{dvd.name}</option>)}
        </select>
      </div>}
      {feeds.length > 0 && <div className={labelClass}>
        <label htmlFor={`${id}-feed`}>สัญญาณสดพื้นหลัง</label>
        <select id={`${id}-feed`} className="input-field min-w-0" value="" onChange={(event) => {
          const feed = feeds.find((item) => item.id === event.currentTarget.value)
          if (feed) onChange({ ...layout, background: { kind: 'camera', asset: liveFeedAsset(feed, 'background') } })
        }}>
          <option value="">{background?.kind === 'camera' ? background.asset.filename : 'เลือกสัญญาณจากคลัง'}</option>
          {feeds.map((feed) => <option key={feed.id} value={feed.id}>{feed.name}</option>)}
        </select>
      </div>}
    </div>
    <SongArtworkFields artwork={layout?.artwork} slide={effective} media={media} feeds={feeds} dvds={dvds} onChange={(artwork) => {
      const { artwork: _artwork, ...rest } = layout ?? {}
      onChange(artwork ? { ...rest, artwork } : Object.keys(rest).length ? rest : undefined)
    }} />
    {layout && <button type="button" className="btn-ghost justify-self-start" onClick={() => onChange(undefined)}>คืนเค้าโครงที่สืบทอด</button>}
  </div>
}
