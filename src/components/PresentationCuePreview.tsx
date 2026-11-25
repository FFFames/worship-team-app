import type { Ref } from 'react'
import type { PlaylistCueAsset } from '../types/database'
import type { DesignLayer, SlideDesign } from '../types/slideDesign'
import { LayeredSlide } from './LayeredSlide'
import type { PlaylistSlide } from '../utils/playlistCues'
import { withDesignBackground, withoutCanvasBackground } from '../utils/slideDesign'
import { scriptureOutputDesign, scriptureOutputLayout } from '../utils/scriptureOutput'
import type { ScriptureOutputSettings } from '../utils/outputSettings'
import { mediaObjectFit } from '../utils/mediaPlayback'
import { powerPointDesignAtStep } from '../utils/powerPoint/buildNavigation'
import { visibleNote } from '../utils/speakerNotes'

function previewDesign(block: PlaylistSlide, background: PlaylistCueAsset | undefined): SlideDesign {
  const visual = block.assets?.find((asset) => (asset.kind === 'image' || asset.kind === 'video')
    && (asset.archivePath || asset.libraryId || asset.dvd))
  const overlay = block.defaultTheme && visual && visual !== background
  if (block.design && !overlay) return background ? withDesignBackground(block.design, background) : block.design

  const layers: DesignLayer[] = []
  if (visual?.kind === 'image' || visual?.kind === 'video') {
    layers.push({ id: 'preview-media', kind: 'media', frame: { x: 0, y: 0, width: 1, height: 1 },
      fit: mediaObjectFit(visual.playback, visual.role === 'background') ?? (visual.role === 'background' ? 'cover' : 'contain'),
      asset: { kind: visual.kind, filename: visual.filename, archivePath: visual.archivePath, libraryId: visual.libraryId,
        clip: visual.clip, posterSeconds: visual.posterSeconds, alphaMode: visual.alphaMode, dvd: visual.dvd } })
  }
  if (block.design) return { ...block.design, layers: [...layers, ...withoutCanvasBackground(block.design).layers] }
  if (block.lines.length || block.subtitle) {
    layers.push({ id: 'preview-lyrics', kind: 'text', frame: { x: .06, y: .05, width: .88, height: .9 },
      text: block.lyricRuns ? block.lines.join('\n') : [...block.lines, block.subtitle].filter(Boolean).join('\n'), runs: block.lyricRuns,
      ...(block.scripture ? { slot: 'content', text: block.lines.join('\n') } : {}),
      style: { fitText: true, fontSize: .085, shadow: Boolean(visual) } })
  }
  return { aspectRatio: 16 / 9, layers }
}

export function PresentationCuePreview({ title, blocks, index, playlistId, background, cueNotes, scriptureSettings, headingRef, onSlide, onGoLive, onClear }: {
  title?: string
  blocks: PlaylistSlide[]
  index: number
  playlistId?: string
  background?: PlaylistCueAsset
  cueNotes?: string
  scriptureSettings: ScriptureOutputSettings
  headingRef: Ref<HTMLHeadingElement>
  onSlide: (index: number) => void
  onGoLive: () => void
  onClear: () => void
}) {
  const block = blocks[index]
  const staged = block && previewDesign(block, background)
  const base = staged && powerPointDesignAtStep(staged, 0)
  const design = base && block.scripture ? scriptureOutputDesign(base, scriptureOutputLayout(block.scripture, scriptureSettings)) : base
  const assets = [...new Set(block?.assets?.map((asset) => asset.filename).filter(Boolean))]
  const speakerNotes = visibleNote(block?.speakerNotes)

  return (
    <section aria-labelledby="staged-cue-heading" className="mb-5! rounded-xl border border-[var(--border-standard)] bg-[var(--bg-secondary)] p-3! sm:p-4!">
      <h2 id="staged-cue-heading" ref={headingRef} tabIndex={-1} className="text-base font-semibold">ตัวอย่างก่อนขึ้นจอ</h2>
      {!title ? <p className="mt-2! text-sm text-[var(--fg-secondary)]">เลือกรายการจากตารางเพื่อดูตัวอย่าง</p>
        : !block ? <p className="mt-2! wrap-anywhere text-sm text-[var(--fg-secondary)]">{title} · ไม่มีสไลด์ให้ขึ้นจอ</p>
          : <div className="mt-3! grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="aspect-video overflow-hidden rounded-lg bg-black" aria-label="ภาพตัวอย่างสไลด์">
              {design?.layers.length ? <LayeredSlide design={design} playlistId={playlistId} preview />
                : <div className="grid h-full place-content-center p-3! text-center text-sm wrap-anywhere text-white/80">{assets[0] || block.sectionLabel}</div>}
            </div>
            <div className="grid min-w-0 gap-3">
              <p className="min-w-0 wrap-anywhere font-medium">{title}</p>
              <div className="grid min-w-0 gap-1 text-sm">
                <label htmlFor="staged-cue-slide">สไลด์ที่จะขึ้นจอ</label>
                <select id="staged-cue-slide" className="input-field min-w-0" value={index} onChange={(event) => onSlide(Number(event.target.value))}>
                  {blocks.map((item, position) => <option value={position} key={position}>{position + 1}. {item.sectionLabel}{item.lines[0] ? ` · ${item.lines[0]}` : ''}</option>)}
                </select>
              </div>
              {assets.length > 0 && <p className="wrap-anywhere text-xs text-[var(--fg-secondary)]">{assets.join(' · ')}</p>}
              {(speakerNotes || cueNotes) && <dl aria-label="โน้ตทีมงานในตัวอย่าง" tabIndex={0}
                className="grid max-h-44 gap-1.5 overflow-y-auto pr-2! text-sm wrap-anywhere focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                {speakerNotes && <div><dt className="font-medium">โน้ตผู้บรรยาย</dt><dd className="whitespace-pre-wrap">{speakerNotes}</dd></div>}
                {cueNotes && <div><dt className="font-medium">บันทึกรายการ</dt><dd className="whitespace-pre-wrap">{cueNotes}</dd></div>}
              </dl>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={onGoLive}>ขึ้นจอ</button>
                <button type="button" className="btn-ghost" onClick={onClear}>ล้างตัวอย่าง</button>
              </div>
            </div>
          </div>}
    </section>
  )
}
