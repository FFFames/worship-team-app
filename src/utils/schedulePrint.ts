/** Builds a text-first report from the saved order and content of a mixed schedule. */

import type { PlaylistCueAsset, PlaylistSong } from '../types/database'
import { CUE_LABELS } from './playlistCues'
import { designTextLines } from './slideDesign'
import { arrangedCueSlides } from './songCueLayout'
import { preparedLibrarySection, songLibrarySections } from './songLibrarySlides'

type PrintSlide = { label: string; lines: string[]; assets: string[] }

function uniqueNames(assets: readonly Pick<PlaylistCueAsset, 'filename'>[]) {
  return [...new Set(assets.map(({ filename }) => filename.trim()).filter(Boolean))]
}

function displayValue(value: unknown) {
  if (typeof value === 'string') return value.trim()
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

export function schedulePrintEntries(entries: readonly PlaylistSong[]) {
  return entries.map(({ id, song, cue, background_asset }, index) => {
    const slides: PrintSlide[] = []
    if (cue) {
      for (const slide of arrangedCueSlides(cue)) {
        const lines = [...slide.lines]
        const seen = new Set(lines.map((line) => line.trim()))
        for (const line of slide.design ? designTextLines(slide.design) : []) {
          if (!line.trim() || seen.has(line.trim())) continue
          lines.push(line)
          seen.add(line.trim())
        }
        const assets = uniqueNames([
          ...(slide.assets ?? []),
          ...(slide.design?.layers.flatMap((layer) => layer.kind === 'media' ? [layer.asset] : []) ?? []),
          ...(slide.design?.soundtracks ?? []),
        ])
        slides.push({ label: slide.label.trim(), lines, assets })
      }
    } else if (song) {
      for (const section of songLibrarySections(song)) {
        for (const { label, lines } of preparedLibrarySection(section)) {
          if (lines.some((line) => line.trim())) slides.push({ label, lines, assets: [] })
        }
      }
    }

    const metadata = cue?.metadata
    return {
      id,
      position: index + 1,
      title: cue?.label.trim() || song?.title.trim() || 'รายการไม่มีชื่อ',
      kind: cue ? CUE_LABELS[cue.kind] : song ? CUE_LABELS.song : 'รายการไม่พร้อมใช้งาน',
      author: displayValue(metadata?.author) || displayValue(song?.artist),
      copyright: displayValue(metadata?.copyright) || displayValue(song?.copyright),
      administrator: displayValue(metadata?.administrator) || displayValue(song?.copyright_administrator),
      reference: displayValue(metadata?.referenceNumber),
      ccli: displayValue(song?.ccli_number),
      assets: uniqueNames([...(cue?.assets ?? []), ...(background_asset ? [background_asset] : [])]),
      slides,
    }
  })
}
