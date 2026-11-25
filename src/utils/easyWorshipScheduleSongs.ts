/** Recovers library songs and reusable slide appearances from EasyWorship schedules. */

import type { PlaylistCue, PlaylistCueAsset, Song } from '../types/database'
import type { DesignAsset, DesignLayer, DesignSoundtrack, SlideDesign } from '../types/slideDesign'
import { formatLyricsOnly, getSectionDisplayLabel, parseChordLyrics } from './chordParser'
import type { EasyWorshipSong } from './easyWorship'
import { easyWorshipSongIdentity, scheduleSongSourceUid } from './easyWorshipSongIdentity'
import { playlistMediaFilename } from './scheduleMedia'
import { applySongSlideLayout, mergeSongSlideLayout } from './songSlideLayout'
import { songTagsFromText } from './songTags'
import { songSlideLyricRuns } from './songCueLayout'
import { mediaObjectFit } from './mediaPlayback'

type CueSlide = PlaylistCue['slides'][number]
type ScheduleSongVersion = {
  song: EasyWorshipSong
  positions: number[]
  files: PlaylistCueAsset[]
}
export type ScheduleSong = ScheduleSongVersion & {
  id: string
  playbackVersions?: ScheduleSongVersion[]
}
export type ScheduleSongCatalogEntry = Pick<Song, 'id' | 'title' | 'artist' | 'copyright' | 'ccli_number' | 'sections' | 'raw_content' | 'easyworship_uid'>
  & { looping?: boolean | null }

const fullFrame = { x: 0, y: 0, width: 1, height: 1 }
const lyricsFrame = { x: .05, y: .05, width: .9, height: .9 }

function optionalString(value: unknown): string | null {
  return (typeof value === 'string' || typeof value === 'number') ? String(value).trim() || null : null
}

export function contentLines(slide: CueSlide) {
  if (slide.lines.some((line) => line.trim())) return slide.lines
  return slide.design?.layers.flatMap((layer) => layer.kind === 'text' && layer.slot === 'content' && layer.text.trim()
    ? layer.text.split('\n') : []) ?? []
}

function reusableAsset<T extends DesignAsset | DesignSoundtrack>(asset: T): T {
  const { archivePath, ...rest } = asset
  if (!archivePath || asset.libraryId) return rest as T
  return { ...rest, filename: playlistMediaFilename(asset), sourcePath: archivePath } as T
}

function visualLayer(asset: PlaylistCueAsset, index: number): DesignLayer | undefined {
  if (asset.kind !== 'image' && asset.kind !== 'video') return undefined
  return {
    kind: 'media', id: `schedule-media:${index}`, frame: fullFrame, role: asset.role,
    asset: reusableAsset({ kind: asset.kind, filename: asset.filename, archivePath: asset.archivePath,
      libraryId: asset.libraryId, clip: asset.clip, posterSeconds: asset.posterSeconds, alphaMode: asset.alphaMode, playback: asset.playback }),
    fit: mediaObjectFit(asset.playback, asset.role === 'background') ?? (asset.role === 'background' ? 'cover' : 'contain'),
    ...(asset.kind === 'video' && asset.repeat !== undefined ? { loop: asset.repeat } : {}),
  }
}

function soundtrack(asset: PlaylistCueAsset): DesignSoundtrack | undefined {
  if (asset.kind !== 'audio') return undefined
  return reusableAsset({
    kind: 'audio', filename: asset.filename, role: asset.role ?? 'foreground', repeat: asset.repeat,
    archivePath: asset.archivePath, libraryId: asset.libraryId, clip: asset.clip, playback: asset.playback,
  })
}

export function songSlideAppearance(slide: CueSlide): SlideDesign | undefined {
  const original = slide.design
  const runs = songSlideLyricRuns(slide)
  const fallbackMedia = (slide.assets ?? []).flatMap((asset, index) => visualLayer(asset, index) ?? [])
  const attachedTracks = (slide.assets ?? []).flatMap((asset) => soundtrack(asset) ?? [])
  const tracks = attachedTracks.length ? attachedTracks : original?.soundtracks?.map(reusableAsset) ?? []
  if (!original && !fallbackMedia.length && !tracks.length) return undefined

  const layers = (original?.layers ?? []).map((layer): DesignLayer => {
    if (layer.kind === 'media') return { ...layer, asset: reusableAsset(layer.asset) }
    if (layer.kind === 'text' && (layer.slot === 'content' || (!layer.slot && layer.id === 'lyrics'))) {
      return { ...layer, slot: 'content', text: '', ...(layer.runs || !runs ? {} : { runs }), style: { ...layer.style, fitText: true } }
    }
    return layer
  })
  if (!layers.some((layer) => layer.kind === 'media')) layers.unshift(...fallbackMedia)
  if (!layers.some((layer) => layer.kind === 'text' && layer.slot === 'content')) {
    layers.push({ id: 'schedule-lyrics', kind: 'text', text: '', slot: 'content', frame: lyricsFrame,
      ...(runs ? { runs } : {}), style: { color: '#ffffff', bold: true, fitText: true } })
  }
  return { ...original, aspectRatio: original?.aspectRatio ?? 16 / 9, layers, ...(tracks.length ? { soundtracks: tracks } : {}) }
}

function appearanceFiles(design: SlideDesign): PlaylistCueAsset[] {
  return [
    ...design.layers.flatMap((layer) => layer.kind === 'media' ? [{ ...layer.asset, archivePath: layer.asset.sourcePath }] : []),
    ...(design.soundtracks ?? []).map((asset) => ({ ...asset, archivePath: asset.sourcePath })),
  ]
}

export function songCuePlayback(slide: CueSlide): EasyWorshipSong['sections'][number]['playback'] {
  const { playback, advanceMs } = slide
  if (advanceMs === undefined) return playback
  return { ...playback, mode: playback?.mode ?? 'timer', delayMs: playback?.delayMs ?? advanceMs }
}

function playbackSignature(playback: EasyWorshipSong['sections'][number]['playback']) {
  const mode = playback?.mode ?? 'manual'
  return JSON.stringify([mode, mode === 'manual' ? 0 : playback?.delayMs ?? 0, playback?.loop === true, playback?.restart === true])
}

export async function recoverEasyWorshipScheduleSongs(cues: readonly (PlaylistCue | null | undefined)[]) {
  const songs = new Map<string, { positions: number[]; versions: Map<string, ScheduleSongVersion> }>()
  const skipped: { position: number; title: string }[] = []
  for (const [index, cue] of cues.entries()) {
    if (cue?.kind !== 'song') continue
    const sections: EasyWorshipSong['sections'] = []
    const styled: NonNullable<NonNullable<EasyWorshipSong['appearance']>['sections']> = []
    const files: PlaylistCueAsset[] = []
    const warnings = new Set<string>()
    for (const slide of cue.slides) {
      const lines = contentLines(slide)
      if (!lines.some((line) => line.trim())) continue
      const label = slide.label.trim() || `Verse ${sections.length + 1}`
      const prepared = applySongSlideLayout(slide, mergeSongSlideLayout(cue.slideLayout, slide.slideLayout))
      const design = songSlideAppearance(prepared)
      const runs = songSlideLyricRuns(prepared)
      const playback = songCuePlayback(slide)
      if (design) {
        styled.push({ index: sections.length, label, design })
        for (const asset of appearanceFiles(design)) {
          if (asset.archivePath) files.push(asset)
          else if (!asset.libraryId) warnings.add(`ไม่พบไฟล์ ${asset.filename} สำหรับสไลด์เพลง`)
        }
      }
      sections.push({ label, lines, ...(!design && runs ? { lyricRuns: runs } : {}),
        ...(slide.transition ? { transition: slide.transition } : {}), ...(playback ? { playback } : {}) })
    }
    if (!sections.length) {
      skipped.push({ position: index + 1, title: cue.label })
      continue
    }
    const administrator = optionalString(cue.metadata?.administrator)
    const description = optionalString(cue.metadata?.description)
    const tags = songTagsFromText(optionalString(cue.metadata?.tags) ?? '')
    const sourceUid = scheduleSongSourceUid(cue)
    const song: EasyWorshipSong = {
      // Presentation row IDs change from one schedule to another. The importer
      // already hashes the title, credits and exact chart together with this key.
      sourceId: 'schedule-song-v1',
      ...(sourceUid ? { sourceUid } : {}),
      title: cue.label.trim(),
      author: optionalString(cue.metadata?.author),
      copyright: optionalString(cue.metadata?.copyright),
      ...(administrator ? { administrator } : {}),
      ...(description ? { description } : {}),
      ...(tags.length ? { tags } : {}),
      ccli: optionalString(cue.metadata?.referenceNumber),
      sections,
      ...(styled.length || cue.looping !== undefined ? { appearance: {
        ...(styled.length ? { sections: styled } : {}), ...(cue.looping !== undefined ? { looping: cue.looping } : {}),
        ...(warnings.size ? { warnings: [...warnings] } : {}),
      } } : {}),
    }
    const id = await easyWorshipSongIdentity(song)
    const group = songs.get(id) ?? { positions: [], versions: new Map<string, ScheduleSongVersion>() }
    const signature = JSON.stringify([song.appearance?.looping === true, sections.map(({ playback }) => playbackSignature(playback))])
    group.positions.push(index + 1)
    const previous = group.versions.get(signature)
    if (previous) {
      previous.positions.push(index + 1)
      const first = previous.song
      if (files.length > previous.files.length) {
        previous.song = song
        previous.files = files
      }
      previous.song.administrator = first.administrator ?? song.administrator
      previous.song.description = first.description ?? song.description
      previous.song.tags = first.tags ?? song.tags
      // A shared chart can come from different native songs. Keep the original ID only when all occurrences agree.
      if (first.sourceUid !== song.sourceUid) delete previous.song.sourceUid
    } else group.versions.set(signature, { song, positions: [index + 1], files })
    songs.set(id, group)
  }
  return { songs: [...songs].map(([id, { positions, versions }]): ScheduleSong => {
    const [first, ...other] = versions.values()
    return { id, ...first, positions, ...(other.length ? { playbackVersions: [first, ...other] } : {}) }
  }), skipped }
}

export function scheduleSongMatchesChart(source: EasyWorshipSong, existing: ScheduleSongCatalogEntry): boolean {
  const normalize = (text: string) => text.normalize('NFC').trim()
  function sameKnown(incoming: string | null, current?: string | null) {
    return incoming === null || (current != null && normalize(incoming) === normalize(current))
  }
  const matchedSource = source.sourceUid && existing.easyworship_uid && source.sourceUid === existing.easyworship_uid
  if ((source.sourceUid && existing.easyworship_uid && !matchedSource)
    || (!matchedSource && !sameKnown(source.title, existing.title)) || !sameKnown(source.author, existing.artist)
    || !sameKnown(source.copyright, existing.copyright) || !sameKnown(source.ccli, existing.ccli_number)) return false

  const incoming = parseChordLyrics(formatLyricsOnly(source.sections)).sections
  const saved = existing.sections ?? parseChordLyrics(existing.raw_content).sections
  if ((source.appearance?.looping !== undefined && source.appearance.looping !== (existing.looping === true))
    || source.sections.some(({ playback }, index) => playback && playbackSignature(playback) !== playbackSignature(saved[index]?.playback))) return false
  const chart = (sections: typeof incoming) => sections.map((section) => [
    normalize(getSectionDisplayLabel(section)),
    section.lines.map((line) => normalize(line.lyrics)).filter(Boolean),
  ])
  return JSON.stringify(chart(incoming)) === JSON.stringify(chart(saved))
}
