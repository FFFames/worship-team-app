import type { MediaClip, MediaFit, MediaPlayback } from './media'

export const dvdTextFields = ['author', 'copyright', 'description', 'tags'] as const
export type DvdMetadata = Partial<Record<(typeof dvdTextFields)[number], string>>
export type DvdFit = MediaFit
export type DvdPlayback = MediaPlayback

/** A DVD segment created locally or read from an EasyWorship record. */
export type DvdClip = {
  id: string
  name: string
  discName?: string
  discUid?: string
  sourceFolder?: string
  title?: number
  chapter?: number
  lastChapter?: number | null
  angle?: number
  audioTrack?: number
  subtitleTrack?: number
  /** One-based subtitle track baked into a portable video, or null for no subtitles. */
  subtitleSelection?: number | null
  segmentStart?: number
  segmentDuration?: number
  frameRateFlag?: number
  repeat?: boolean
  clip?: MediaClip
  thumbnail?: string | null
  metadata?: DvdMetadata
  playback?: DvdPlayback
}
