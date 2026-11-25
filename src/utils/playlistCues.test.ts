/** Keeps imported slide boundaries and media references intact for live output. */

import { describe, expect, it } from 'vitest'
import type { PlaylistSong } from '../types/database'
import type { OutputDefaultThemes } from './defaultThemes'
import { getPlaylistSlides } from './playlistCues'
import { cutSlideTransition } from './slideTransitions'
import { defaultScriptureOutputSettings } from './outputSettings'
import { scriptureOutputDesign, scriptureOutputLayout } from './scriptureOutput'

const entry: PlaylistSong = {
  id: 'entry', playlist_id: 'playlist', song_id: null, transpose: 0, order: 0, created_at: '',
}

describe('getPlaylistSlides', () => {
  it('uses the selected theme slide effect, with local parameters and cuts taking priority', () => {
    const design = { aspectRatio: 16 / 9, layers: [{ id: 'content', kind: 'text' as const, slot: 'content' as const,
      frame: { x: 0, y: 0, width: 1, height: 1 }, text: '' }] }
    const blend = { uid: 'sdDXBlend', values: { Duration: '500' } }
    const push = { uid: 'sdDXPush', values: { Duration: '750', 'Value-Direction': '2' } }
    const duration = { values: { Duration: '1200' } }
    const defaults: OutputDefaultThemes = { 'live:song': { id: 'theme', title: 'Song theme', slides: [
      { id: 'verse', label: 'Verse', design, transition: blend },
      { id: 'chorus', label: 'Chorus', design, transition: push },
    ] } }
    const song: PlaylistSong = { ...entry, cue: { kind: 'song', label: 'Song', slides: [
      { label: 'Verse', lines: ['First'] },
      { label: 'Chorus 1', lines: ['Second'], transition: duration },
      { label: 'Verse 2', lines: ['Third'], transition: cutSlideTransition },
      { label: 'Verse 3', lines: ['Fourth'], design },
    ] } }
    const slides = getPlaylistSlides(song, 4, defaults)
    expect(slides.map((slide) => slide.transition)).toEqual([
      blend, { uid: push.uid, values: { ...push.values, Duration: '1200' } }, cutSlideTransition, undefined,
    ])
    expect(slides.map((slide) => slide.localTransition)).toEqual([undefined, duration, cutSlideTransition, undefined])
    const withTheme = getPlaylistSlides({ ...song, slide_theme: { title: 'Selected', design, transition: push } }, 4, defaults)
    expect(withTheme[0].transition).toEqual(push)
    expect(withTheme[2].transition).toEqual(cutSlideTransition)
    expect(song.cue?.slides[0].transition).toBeUndefined()
  })

  it('keeps the original lines and media together even when library reflow is one line', () => {
    const assets = [{ kind: 'video', filename: 'clip.mp4', archivePath: 'media/clip.mp4', role: 'background' }] as const
    const slides = getPlaylistSlides({
      ...entry,
      cue: {
        kind: 'song', label: 'เพลงทดสอบ',
        slides: [
          { label: 'Verse 1', lines: ['หนึ่ง', 'สอง'], assets: [...assets] },
          { label: 'Verse 1', lines: ['สาม', 'สี่'] },
        ],
      },
    }, 1)

    expect(slides).toHaveLength(2)
    expect(slides[0]).toMatchObject({ sectionLabel: 'Verse 1', lines: ['หนึ่ง', 'สอง'], assets })
    expect(slides[1].lines).toEqual(['สาม', 'สี่'])
  })

  it('exposes standalone media as a slide with no text', () => {
    const assets = [{ kind: 'image', filename: 'notice.jpg', archivePath: 'media/notice.jpg' }] as const
    const slides = getPlaylistSlides({ ...entry, cue: { kind: 'image', label: 'ประกาศ', slides: [], assets: [...assets] } }, 4)
    expect(slides).toEqual([{ sectionType: 'verse', sectionLabel: 'ประกาศ', lines: [], assets }])
  })

  it('prefers an assigned background and keeps the original assets and scripture references', () => {
    const original = { kind: 'video', filename: 'clip.mp4', archivePath: 'media/clip.mp4', role: 'background' } as const
    const assigned = { kind: 'image', filename: 'still.jpg', libraryId: 'lib-id', role: 'background' } as const
    const slides = getPlaylistSlides({
      ...entry,
      background_asset: assigned,
      cue: {
        kind: 'scripture', label: 'John 3:16–17',
        slides: [
          { label: 'John 3:16', lines: ['Original lines'], assets: [original] },
          { label: 'John 3:17', lines: ['More lines'], assets: [] },
        ],
      },
    }, 4)

    expect(slides[0]).toMatchObject({ subtitle: 'John 3:16', assets: [assigned, original] })
    expect(slides[1]).toMatchObject({ subtitle: 'John 3:17', assets: [assigned] })
  })

  it('substitutes scripture text and its reference into a theme while keeping the original template', () => {
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const theme = {
      title: 'Lower third',
      design: {
        aspectRatio: 16 / 9,
        layers: [
          { id: 'body', kind: 'text' as const, frame, slot: 'content' as const, text: '' },
          { id: 'reference', kind: 'text' as const, frame, slot: 'reference' as const, text: '' },
        ],
      },
    }
    const slides = getPlaylistSlides({
      ...entry,
      slide_theme: theme,
      cue: { kind: 'scripture', label: 'สดุดี 1:1', slides: [{ label: 'สดุดี 1:1', lines: ['พระพร'] }] },
    }, 4)
    expect(slides[0].design?.layers).toMatchObject([{ text: 'พระพร' }, { text: '' }])
    const layout = scriptureOutputLayout(slides[0].scripture!, defaultScriptureOutputSettings)
    expect(scriptureOutputDesign(slides[0].design!, layout).layers).toMatchObject([{ text: 'พระพร' }, { text: 'สดุดี 1:1' }])
    expect(theme.design.layers.map((layer) => layer.text)).toEqual(['', ''])
  })

  it('separates a previously appended reference from the text and preserves native runs', () => {
    const frame = { x: .1, y: .1, width: .8, height: .8 }
    const source = { aspectRatio: 16 / 9, layers: [{ id: 'body', kind: 'text' as const, slot: 'content' as const, frame,
      text: 'Words\nJohn 1:1 (KJV)', runs: [{ text: 'Words', style: { color: '#ff0000' } }, { text: '\nJohn 1:1 (KJV)' }] }] }
    const slides = getPlaylistSlides({ ...entry, cue: {
      kind: 'scripture', label: 'Reading', metadata: { scripturePassage: 'John 1:1-2 (KJV)' },
      slides: [{ label: 'John 1:1 (KJV)', lines: ['Words'], design: source,
        scriptureRange: { translationId: 17, book: 43, chapter: 1, firstVerse: 1, lastVerse: 1 } },
      { label: 'John 1:2 (KJV)', lines: ['More words'] }],
    } }, 4)
    const [first, last] = slides
    expect(first.design?.layers[0]).toMatchObject({ text: 'Words', runs: [{ text: 'Words', style: { color: '#ff0000' } }] })
    const layout = scriptureOutputLayout(first.scripture!, { reference: 'before-slide', completePassage: true })
    expect(scriptureOutputDesign(first.design!, layout).layers[0]).toMatchObject({ text: 'John 1:1-2 (KJV)\nWords', frame })
    const end = { reference: 'after-passage' as const, completePassage: false }
    expect(scriptureOutputLayout(first.scripture!, end).reference).toBe('')
    expect(scriptureOutputLayout(last.scripture!, end).reference).toBe('John 1:1-2 (KJV)')
    const only = scriptureOutputLayout(first.scripture!, { reference: 'reference-only', completePassage: false })
    expect(scriptureOutputDesign(first.design!, only).layers[0]).toMatchObject({ text: 'John 1:1 (KJV)', frame })
    expect(source.layers[0].text).toBe('Words\nJohn 1:1 (KJV)')
  })

  it('puts an older binary schedule reference under the output settings without altering the saved cue', () => {
    const source = { aspectRatio: 16 / 9, layers: [{ id: 'lyrics', kind: 'text' as const,
      frame: { x: .05, y: .05, width: .9, height: .9 }, text: 'Text\nJohn 1:1 (KJV)' }] }
    const [slide] = getPlaylistSlides({ ...entry, cue: { kind: 'scripture', label: 'John 1:1',
      metadata: { type: 2, presentationUid: null, author: 'John 1:1 (KJV)' },
      slides: [{ label: 'John 1:1 (KJV)', lines: ['Text'], design: source }],
    } }, 4)
    expect(slide.scripture?.passage).toBe('John 1:1 (KJV)')
    const hidden = scriptureOutputLayout(slide.scripture!, { reference: 'hidden', completePassage: false })
    expect(scriptureOutputDesign(slide.design!, hidden).layers).toMatchObject([{ slot: 'content', text: 'Text' }])
    expect(source.layers[0].text).toBe('Text\nJohn 1:1 (KJV)')
  })
})
