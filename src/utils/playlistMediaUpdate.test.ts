import { describe, expect, it } from 'vitest'
import type { PlaylistCue, PlaylistCueAsset } from '../types/database'
import type { MediaLibraryItem } from '../types/media'
import { fillImportedCueMediaPlayback } from './easyWorshipMediaPlaybackRecovery'
import { libraryMediaCueAsset } from './mediaLibrary'
import { reviewPlaylistMediaUpdates } from './playlistMediaUpdate'
import { validSlideAsset } from './playlistPackageManifest'

const assetId = '00000000-0000-4000-8000-000000000010'
const old: MediaLibraryItem = {
  id: '00000000-0000-4000-8000-000000000011', assetId, kind: 'video', filename: 'loop.mp4', name: 'First',
  size: 100, mediaType: 'video/mp4', addedAt: '', playback: { repeat: true, muted: true }, posterSeconds: 2,
}
const other = { ...old, id: '00000000-0000-4000-8000-000000000012', name: 'Second' }
const updated: MediaLibraryItem = { ...old, name: 'New title', clip: { startSeconds: .5 }, playback: { repeat: false, fit: 'contain' }, posterSeconds: 0 }
const foreground = libraryMediaCueAsset(old, 'foreground')
const background = libraryMediaCueAsset(old, 'background')
const cue = (asset: PlaylistCueAsset): PlaylistCue => ({
  kind: 'video', label: 'First', metadata: { notes: 'Local note' },
  slides: [{ label: 'First', lines: [], assets: [asset] }, { label: 'Local slide title', labelEdited: true, lines: [], assets: [asset] }],
})

describe('updating schedule media from a catalog record', () => {
  it('updates linked occurrences and backgrounds, leaving the other record on the same bytes alone', () => {
    const rows = [
      { id: '1', order: 0, cue: cue(foreground) },
      { id: '2', order: 1, cue: cue(libraryMediaCueAsset(other, 'foreground')) },
      { id: '3', order: 2, background_asset: background, song: { title: 'Song' } },
    ]
    const plan = reviewPlaylistMediaUpdates(rows, updated, [updated, other])
    expect(plan.map(({ update }) => update.entry_id)).toEqual(['1', '3'])
    const currentCue = plan[0].update.cue!
    expect(currentCue).toMatchObject({ label: 'New title', metadata: { notes: 'Local note' }, slides: [
      { label: 'New title', assets: [{ libraryId: assetId, posterSeconds: 0, clip: { startSeconds: .5 }, repeat: false }] },
      { label: 'Local slide title' },
    ] })
    expect(plan[1].update.background).toMatchObject({ role: 'background', repeat: false, mediaCatalog: { id: old.id } })
    expect(validSlideAsset(currentCue.slides[0].assets?.[0], ['video'])).toBe(true)
    expect(reviewPlaylistMediaUpdates([{ ...rows[0], cue: JSON.parse(JSON.stringify(currentCue)) }], updated, [updated, other])).toEqual([])
  })

  it('matches a native packed reference by hash and original name, keeps its placement, and skips ambiguity', () => {
    const hash = 'a'.repeat(64)
    const packed = { kind: 'video' as const, filename: 'Intro.wmv', archivePath: 'media/clip.mp4', easyWorshipFileHash: hash,
      playback: { muted: true } }
    const row = { id: '1', order: 0, cue: { ...cue(packed), kind: 'presentation' as const, slides: [{ label: 'Layout', lines: [],
      design: { aspectRatio: 16 / 9, layers: [{ id: 'layer', kind: 'media' as const,
        frame: { x: .2, y: .1, width: .4, height: .5 }, rotation: 20, loop: true, asset: packed }] } }] } }
    const converted = { ...updated, metadata: { catalogFilename: 'intro.wmv', legacyVideoSourceHash: hash } }
    const distinct = { ...other, metadata: { catalogFilename: 'Other.wmv', legacyVideoSourceHash: hash } }
    const [change] = reviewPlaylistMediaUpdates([row], converted, [converted, distinct])
    expect(change.update.cue?.slides[0].design?.layers[0]).toMatchObject({ loop: false, fit: 'contain', rotation: 20,
      frame: { x: .2, y: .1, width: .4, height: .5 },
      asset: { archivePath: 'media/clip.mp4', mediaCatalog: { id: old.id }, posterSeconds: 0, playback: { fit: 'contain' } },
    })
    expect(reviewPlaylistMediaUpdates([row], converted, [converted, { ...distinct, metadata: converted.metadata }])).toEqual([])
    const cleared = { ...packed, playback: undefined, mediaCatalog: { id: old.id, name: 'New title' } }
    expect(fillImportedCueMediaPlayback([cleared], [packed])).toEqual([cleared])
  })
})
