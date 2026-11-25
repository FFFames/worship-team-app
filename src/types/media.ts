/** Browser-local media assets and their library records. */

export type MediaKind = 'image' | 'video' | 'audio'
export type MediaMetadata = Record<string, string | number | boolean | null>
export const mediaInfoFields = ['author', 'copyright', 'description', 'tags'] as const
export type MediaInfo = Record<(typeof mediaInfoFields)[number], string>
export type VideoAlphaMode = 'top-bottom' | 'side-by-side'
export type MediaClip = { startSeconds?: number; endSeconds?: number; endTrimSeconds?: number }
export type MediaFit = 'auto' | 'contain' | 'fill' | 'cover'
export type MediaUsage = 'auto' | 'foreground' | 'background'
export type MediaPlayback = { volume?: number; muted?: boolean; fit?: MediaFit }
export type LibraryMediaPlayback = MediaPlayback & { repeat?: boolean; usage?: MediaUsage }
export type MediaCatalogReference = { id: string; name: string }

export type MediaLibraryItem = {
  id: string
  assetId: string
  name: string
  filename: string
  kind: MediaKind
  size: number
  mediaType: string
  addedAt: string
  metadata?: MediaMetadata
  clip?: MediaClip
  clipEdited?: true
  posterSeconds?: number
  posterEdited?: true
  alphaMode?: VideoAlphaMode
  alphaModeEdited?: true
  playback?: LibraryMediaPlayback
  playbackEdited?: true
  usageEdited?: true
  /** A fallback entry for an asset referenced by a slide design. */
  generatedReference?: true
}
