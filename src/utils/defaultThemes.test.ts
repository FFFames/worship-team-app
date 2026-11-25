import { describe, expect, it } from 'vitest'
import type { PlaylistSong } from '../types/database'
import type { PresentationField, SlideDesign } from '../types/slideDesign'
import { alternatePresentationDesign, chooseDefaultTheme, decodeDefaultThemes, type DefaultTheme } from './defaultThemes'
import { getPlaylistSlides } from './playlistCues'
import { applyPresentationBackground } from './slideDesign'

const frame = { x: 0, y: 0, width: 1, height: 1 }
const fill = (color: string) => ({ kind: 'fill' as const, id: color, frame, fill: { type: 'solid' as const, color } })
const content = { kind: 'text' as const, id: 'body', frame, slot: 'content' as const, text: 'default text' }
const standard: SlideDesign = { aspectRatio: 16 / 9, layers: [fill('#242266'), content] }
const verse: SlideDesign = { ...standard, layers: [fill('#226624'), content] }
const candidate: DefaultTheme = {
  id: 'defaults', title: 'Default',
  slides: [
    { id: 'chorus', label: 'Chorus', design: standard },
    { id: 'verse', label: 'Verse', design: verse },
  ],
}

describe('Default output themes', () => {
  it('selects a content layout by section and keeps an explicit reset distinguishable from an unset slot', () => {
    const defaults = decodeDefaultThemes(JSON.stringify({ 'live:song': candidate, 'alternate:song': null }))
    expect(chooseDefaultTheme(defaults, 'live', 'song', 'Verse 2')).toEqual(verse)
    expect(chooseDefaultTheme(defaults, 'alternate', 'song')).toBeUndefined()
    expect(defaults['alternate:song']).toBeNull()
    expect(defaults['live:scripture']).toBeUndefined()
    expect(decodeDefaultThemes('{"live:song":{"id":"bad","title":"bad","slides":[null]}}')).toEqual({})
  })

  it('uses the fallback for plain lyrics and preserves a saved cue design or playlist override', () => {
    const cue = { kind: 'song' as const, label: 'Theme verification', slides: [{ label: 'Verse 2', lines: ['เนื้อเพลง'] }] }
    const entry: PlaylistSong = { id: 'item', playlist_id: 'playlist', song_id: null, transpose: 0, order: 1, created_at: '', cue }
    const defaults = { 'live:song': candidate } as const
    const [fallback] = getPlaylistSlides(entry, 4, defaults)
    expect(fallback.defaultTheme).toBe(true)
    expect(fallback.design?.layers).toEqual([fill('#226624'), { ...content, text: 'เนื้อเพลง' }])
    const [authored] = getPlaylistSlides({ ...entry, cue: { ...cue, slides: [{ ...cue.slides[0], design: standard }] } }, 4, defaults)
    expect(authored.design).toBe(standard)
    const [override] = getPlaylistSlides({ ...entry, slide_theme: { title: 'Custom', design: standard } }, 4, defaults)
    expect(override.defaultTheme).toBeUndefined()
    expect(override.design?.layers).toEqual([fill('#242266'), { ...content, text: 'เนื้อเพลง' }])
  })

  it('retains authored artwork on the audience display and substitutes a legacy presentation backdrop on alternate output', () => {
    expect(applyPresentationBackground(verse, standard, false)).toBe(standard)
    expect(applyPresentationBackground(verse, standard, true).layers).toEqual([
      { ...fill('#226624'), id: 'default:#226624' }, content,
    ])
  })

  it('maps native presentation fields by role and preserves theme decorations', () => {
    const field = (presentationField: PresentationField, text: string, x: number) => ({
      ...content, id: presentationField, presentationField, text, frame: { ...frame, x },
    })
    const decoration = { ...content, id: 'logo', slot: undefined, text: 'WorshipTeam' }
    const source = { ...standard, layers: [field('subtitle', 'รายละเอียด', 0.1), decoration, field('title', 'ประกาศ', 0.2)] }
    const title = { ...standard, layers: [fill('#333333'), field('title', 'example', 0.8), field('subtitle', 'example', 0.7), decoration] }
    const blank = { ...standard, layers: [fill('#666666')] }
    const themes = { 'alternate:presentation': { ...candidate, slides: [
      { id: 'title', label: 'Cover', template: 'TITLE', design: title },
      { id: 'blank', label: 'Blank', template: 'BLANK', design: blank },
    ] } }

    expect(alternatePresentationDesign(themes, 'TITLE', 'Slide 1', source).layers).toEqual([
      fill('#333333'), field('title', 'ประกาศ', 0.8), field('subtitle', 'รายละเอียด', 0.7), decoration,
    ])
    expect(alternatePresentationDesign(themes, 'BLANK', 'Slide 2', standard)).toEqual(blank)
    expect(alternatePresentationDesign({}, 'TITLE', 'Slide 1', source)).toBe(source)
    const mediaSlide: SlideDesign = { ...standard, layers: [fill('#333333'), {
      kind: 'media', id: 'video', frame, asset: { kind: 'video', filename: 'Welcome.mp4' },
    }] }
    expect(alternatePresentationDesign(themes, 'BLANK', 'Media', mediaSlide)).toBe(mediaSlide)
  })
})
