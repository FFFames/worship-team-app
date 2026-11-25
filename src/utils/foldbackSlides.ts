import type { PlaylistSong } from '../types/database'
import type { FoldbackNext } from './foldbackChannel'
import { getPlaylistSlides, playlistCueLooping, type PlaylistSlide } from './playlistCues'
import type { LyricLayout } from './slideBuilder'
import { getSlideAdvance } from './slidePlayback'

export function getFoldbackNext(
  blocks: PlaylistSlide[], index: number, entry: PlaylistSong | undefined, schedule: PlaylistSong[], layout: LyricLayout,
): FoldbackNext | null {
  const nextBlock = blocks[index + 1] ?? blocks[getSlideAdvance(blocks, index, playlistCueLooping(entry))?.index ?? -1]
  if (nextBlock) return {
    label: nextBlock.subtitle || nextBlock.sectionLabel,
    lines: nextBlock.lines.filter((line) => line.trim()).slice(0, 2),
  }

  const position = schedule.findIndex((item) => item.id === entry?.id)
  if (position < 0) return null
  for (const item of schedule.slice(position + 1)) {
    if (getPlaylistSlides(item, layout).length > 0) {
      const label = item.cue?.label || item.song?.title
      if (label) return { label }
    }
  }
  return null
}
