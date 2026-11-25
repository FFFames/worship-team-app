/** Protects inherited song layouts across appearance, breaks, and playlist copies. */

import { describe, expect, it } from 'vitest'
import type { PlaylistSong, Section, Song } from '../types/database'
import type { SlideDesign, SongArtworkLayer, SongSlideLayout } from '../types/slideDesign'
import { getPlaylistSlides, getSongPresentationSlides } from './playlistCues'
import { preparedLibrarySection, reparseLibrarySong } from './songLibrarySlides'
import { songSlideLyricRuns } from './songCueLayout'
import { validPreparedSongLayouts, validSlideAsset, validSongSlideLayout } from './playlistPackageManifest'
import { applySongElementEffects, applySongSlideLayout, carrySongArtwork, updateSongElementEffects } from './songSlideLayout'
import { withDesignBackground } from './slideDesign'
import { readElementEffects } from './slideElementEffects'

const frame = { x: .1, y: .2, width: .8, height: .6 }
const base: SlideDesign = { aspectRatio: 16 / 9, layers: [
  { id: 'backdrop', kind: 'fill', frame: { x: 0, y: 0, width: 1, height: 1 }, fill: { type: 'solid', color: '#ffffff' } },
  { id: 'heading', kind: 'text', text: 'Song title', frame },
  { id: 'lyrics', kind: 'text', slot: 'content', text: '', frame, textLayout: { sizing: 'fixed' }, style: { fontSize: .045 } },
] }
const master: SongSlideLayout = { frame: { x: .16 }, style: { fitText: true, align: 'right' }, background: { kind: 'fill', fill: { type: 'solid', color: '#112233' } } }
const override: SongSlideLayout = { frame: { y: .4 }, style: { align: 'left' } }
const section: Section = { type: 'verse', label: 'Verse 1', marker: '', lines: [{ lyrics: 'First second', chords: 'C     Am' }],
  slideBreaks: [6], slideLayouts: [{ start: 6, layout: override }], lyricRuns: [{ text: 'First ' }, { text: 'second', style: { italic: true } }] }

describe('song slide layout authoring', () => {
  it('keeps local effect overrides on the native lyric element and carries those edits to another output theme', () => {
    const oldShadow = { color: '#000000', opacity: .6, blur: 0, offset: .01, angle: 315 }
    const border = { color: '#112233', opacity: .7, width: .02, position: 'outer', join: 'bevel' } as const
    const reflection = { opacity: .5, size: .6, distance: .02, blur: .01 }
    const native: SlideDesign = { ...base, layers: [
      { ...base.layers[0], id: '41-background', frame },
      { ...base.layers[2], id: '41-foreground', elementShadow: { ...oldShadow, group: '41' } },
      base.layers[1],
    ] }
    const master: SongSlideLayout = { elementEffects: updateSongElementEffects(undefined, undefined, { elementBorder: border, elementReflection: reflection }) }
    const changes = updateSongElementEffects(undefined, undefined, { elementShadow: false })
    const entry = { cue: { kind: 'song', label: 'Version', slideLayout: master,
      slides: [{ label: 'Verse', lines: ['Alpha'], design: native, slideLayout: { elementEffects: changes } }] } } as PlaylistSong
    const [slide] = getPlaylistSlides(entry, 'stanza')
    expect(slide.design?.layers[0]).toMatchObject({ elementShadow: false, elementReflection: { ...reflection, group: '41' } })
    expect(slide.design?.layers[1]).toMatchObject({ elementBorder: border, elementShadow: false, elementReflection: { ...reflection, group: '41' } })
    expect(slide.design?.layers[2]).toBe(base.layers[1])
    expect(readElementEffects(slide.design!.layers, '41-background')).toEqual({ elementBorder: border, elementShadow: false, elementReflection: reflection })
    expect(applySongElementEffects(base.layers, slide.songElementEffects)[2]).toMatchObject({
      elementBorder: border, elementShadow: false, elementReflection: { ...reflection, group: 'lyrics' },
    })
    expect(native.layers[1].elementShadow).toEqual({ ...oldShadow, group: '41' })
    expect(validSongSlideLayout(master, validSlideAsset)).toBe(true)
    expect(validSongSlideLayout({ elementEffects: [{ effects: { elementReflection: { ...reflection, opacity: 3 } } }] }, validSlideAsset)).toBe(false)
  })

  it('supports a master, local changes, and native layers without changing the chord chart', () => {
    const [first, second] = preparedLibrarySection(section, base, master)
    expect(first.lines).toEqual(['First '])
    expect(second.chords).toEqual(['Am'])
    expect(second.design?.layers[0]).toMatchObject({ kind: 'fill', fill: { color: '#112233' } })
    expect(second.design?.layers[1]).toEqual(base.layers[1])
    expect(first.design?.layers[2]).toMatchObject({ frame: { x: .16, y: .2 }, style: { align: 'right' }, textLayout: { sizing: 'fit' } })
    expect(second.design?.layers[2]).toMatchObject({ frame: { x: .16, y: .4 }, style: { align: 'left' } })
    expect(songSlideLyricRuns(second)).toEqual([{ text: 'second', style: { italic: true } }])
    expect(base.layers[2]).toMatchObject({ frame, textLayout: { sizing: 'fixed' } })
  })

  it('moves a prepared slide layout with its boundary after editing the chart', () => {
    const parsed = reparseLibrarySong('[Verse 1]\nNow First second', { sections: [section] }).sections[0]
    expect(parsed.slideBreaks).toEqual([10])
    expect(parsed.slideLayouts).toEqual([{ start: 10, layout: override }])
    expect(preparedLibrarySection(parsed, undefined, master)[1].design?.layers[1]).toMatchObject({ frame: { x: .16, y: .4 }, text: 'second' })
    expect(validPreparedSongLayouts(parsed.slideLayouts, 'Now First second'.length, () => true)).toBe(true)
    expect(validPreparedSongLayouts([{ start: 10, layout: { frame: { y: 20 } } }], 17, () => true)).toBe(false)
    const automatic = { ...section, slideBreaks: null, slideLayouts: [{ start: 0, layout: override }] }
    expect(preparedLibrarySection(automatic, base, master)[0].design?.layers[2]).toMatchObject({ frame: { y: .2 }, style: { align: 'right' } })
  })

  it('applies a saved occurrence master and its slide override after reflow', () => {
    const song = { id: 'song', title: 'Song', raw_content: '', sections: [section], appearance: { slideLayout: master } } as Song
    const linked = getSongPresentationSlides(song, 4)
    expect(linked[0].design?.layers[1]).toMatchObject({ frame: { x: .16 } })
    const first = { label: 'Verse 1', lines: ['Alpha', 'Beta'], slideLayout: override }
    const cue = { kind: 'song' as const, label: 'Version', lyricLayout: 1 as const, slideLayout: master, slides: [first, { label: 'Verse 2', lines: ['Gamma'] }] }
    const occurrence = getPlaylistSlides({ song, cue } as PlaylistSong, 4)
    expect(occurrence.map(({ design }) => design?.layers[1])).toMatchObject([
      { text: 'Alpha', frame: { y: .4 }, style: { align: 'left' } },
      { text: 'Beta', frame: { y: .4 }, style: { align: 'left' } },
      { text: 'Gamma', frame: { x: .16 }, style: { align: 'right' } },
    ])
  })

  it('composes artwork and ordering without changing the lyrics, draft source, or background', () => {
    const art: SongArtworkLayer = { id: 'logo', kind: 'media', frame: { x: 0, y: 0, width: 1, height: 1 },
      asset: { kind: 'image', filename: 'Logo.png', libraryId: 'library-logo' } }
    const updated = { ...art, rotation: 30, opacity: .85 }
    const master: SongSlideLayout = { artwork: { changes: [{ action: 'add', layer: art }] } }
    const override: SongSlideLayout = { artwork: { changes: [{ action: 'update', layer: updated }, { action: 'hide', id: 'heading' }],
      order: ['logo', 'lyrics'] } }
    const [first, second] = preparedLibrarySection({ ...section, slideLayouts: [{ start: 6, layout: override }] }, base, master)
    expect(first.design?.layers.map((layer) => layer.id)).toEqual(['backdrop', 'heading', 'lyrics', 'logo'])
    expect(second.design?.layers.map((layer) => layer.id)).toEqual(['backdrop', 'logo', 'lyrics'])
    expect(second.design?.layers[1]).toEqual({ ...updated, songArtwork: true })
    expect(second.design?.layers[2]).toMatchObject({ text: 'second' })
    expect(second.chords).toEqual(['Am'])
    expect(withDesignBackground(second.design!, { kind: 'image', filename: 'Background.png', libraryId: 'background' }).layers
      .map((layer) => layer.id)).toEqual(['playlist-background', 'logo', 'lyrics'])
    const alternate = { ...base, layers: [{ ...base.layers[0], id: 'alternate-background' }, { ...base.layers[2], id: 'broadcast-lyric' }] }
    expect(carrySongArtwork(alternate, second.design).layers.map((layer) => layer.id)).toEqual(['alternate-background', 'logo', 'broadcast-lyric'])
    expect(base.layers.map((layer) => layer.id)).toEqual(['backdrop', 'heading', 'lyrics'])
    expect(validSongSlideLayout(override, () => true)).toBe(true)
    expect(validSongSlideLayout({ artwork: { changes: [{ action: 'hide', id: 'logo' }, { action: 'add', layer: art }] } }, () => true)).toBe(false)
  })

  it('retains native and authored Feed positions and keeps the broadcast theme background', () => {
    const native: SongArtworkLayer = { kind: 'camera', id: 'native-camera', frame: { x: .62, y: .1, width: .3, height: .25 },
      asset: { kind: 'camera', filename: 'Native booth', role: 'foreground', feedVideo: { width: 640, height: 480, fit: 'contain' } } }
    const authored: SongArtworkLayer = { ...native, id: 'authored-camera', songArtwork: true, frame: { x: .1, y: .65, width: .3, height: .25 } }
    const layout: SongSlideLayout = { background: { kind: 'camera', asset: { ...native.asset, role: 'background' } },
      artwork: { changes: [{ action: 'add', layer: authored }] } }
    expect(validSongSlideLayout(layout, validSlideAsset)).toBe(true)
    const source = { label: 'Verse', lines: ['Lyric'], design: { ...base, layers: [base.layers[0], native, base.layers[2]] } }
    const slide = applySongSlideLayout(source, layout)
    expect(slide.design?.layers.map(({ id }) => id)).toEqual(['song-layout-background', 'native-camera', 'lyrics', 'authored-camera'])
    expect(slide.design?.layers[0]).toMatchObject({ kind: 'camera', asset: { role: 'background' } })
    expect(carrySongArtwork(base, slide.design).layers.map(({ id }) => id)).toEqual(['backdrop', 'heading', 'native-camera', 'lyrics', 'authored-camera'])
    expect(carrySongArtwork(base, slide.design).layers[2]).toBe(native)
  })

  it('retains positioned DVD clips, playback marks, and ordering with a separate broadcast theme', () => {
    const native: Extract<SongArtworkLayer, { kind: 'media' }> = { id: 'native-dvd', kind: 'media', role: 'foreground',
      frame: { x: .65, y: .12, width: .25, height: .3 }, asset: { kind: 'video', filename: 'Native clip', dvd: {
        id: 'native-clip', name: 'Native clip', title: 1, chapter: 2, clip: { startSeconds: 1, endSeconds: 3 },
      } } }
    const asset = { kind: 'video' as const, filename: 'Master clip', dvd: {
      id: 'master-clip', name: 'Master clip', playback: { fit: 'contain' as const },
    } }
    const authored = { ...native, id: 'authored-dvd', asset }
    const layout: SongSlideLayout = { background: { kind: 'media', asset, loop: false },
      artwork: { changes: [{ action: 'add', layer: authored }] } }
    const source = { label: 'Verse', lines: ['Lyric'], design: { ...base, layers: [base.layers[0], native, base.layers[2]] } }
    const slide = applySongSlideLayout(source, layout)
    expect(validSongSlideLayout(layout, validSlideAsset)).toBe(true)
    expect(slide.design?.layers[0]).toMatchObject({ asset, fit: 'contain', loop: false })
    const broadcast = carrySongArtwork(base, slide.design)
    expect(broadcast.layers.map(({ id }) => id)).toEqual(['backdrop', 'heading', 'native-dvd', 'lyrics', 'authored-dvd'])
    expect(broadcast.layers[2]).toEqual(native)
    expect(broadcast.layers[4]).toEqual({ ...authored, songArtwork: true })
  })
})
