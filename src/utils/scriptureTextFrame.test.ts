/** Verifies that Scripture frames keep edited geometry and portable verse provenance. */

import { describe, expect, it } from 'vitest'
import type { LocatedVerse, ScriptureEditionInfo } from '../types/scripture'
import { validSongSlideLayout } from './playlistPackageManifest'
import { scriptureTextFrame } from './scriptureTextFrame'
import { alternatePresentationDesign } from './defaultThemes'
import type { DesignLayer, SlideDesign } from '../types/slideDesign'

const edition: ScriptureEditionInfo = { id: 'edition-a', name: 'Fixture Edition', abbreviation: 'FE' }
const verse: LocatedVerse = { bookId: '43', bookName: 'ยอห์น', chapter: 3, verse: 16, text: 'ตัวอย่าง  ข้อความ' }

describe('Scripture text frame', () => {
  it('retains the selected source and verifies the portable song layout', () => {
    const frame = scriptureTextFrame(edition, [verse, verse, { ...verse, verse: 17, text: 'ข้อถัดไป' }])!
    expect(frame.kind).toBe('text')
    expect(frame.slot).toBeUndefined()
    expect(frame.text).toBe('ตัวอย่าง ข้อความ\nข้อถัดไป\nยอห์น 3:16–17 · FE')
    expect(frame.scriptureSource).toEqual({ editionId: edition.id, editionName: edition.name, label: 'ยอห์น 3:16–17 · FE',
      verses: [{ bookId: '43', chapter: 3, verse: 16 }, { bookId: '43', chapter: 3, verse: 17 }] })
    const layout = { artwork: { changes: [{ action: 'add', layer: frame }] } }
    expect(validSongSlideLayout(layout, () => false)).toBe(true)
    expect(validSongSlideLayout({ artwork: { changes: [{ action: 'add', layer: {
      ...frame, scriptureSource: { ...frame.scriptureSource, verses: [{ bookId: '43', chapter: 0, verse: 16 }] },
    } }] } }, () => false)).toBe(false)
  })

  it('replaces the passage while preserving the same frame and its style', () => {
    const previous = { ...scriptureTextFrame(edition, [verse])!, frame: { x: .14, y: .2, width: .4, height: .22 }, rotation: 30 }
    const next = scriptureTextFrame({ ...edition, id: 'edition-b', abbreviation: 'FB' }, [{ ...verse, text: 'อีกฉบับ' }], previous)
    expect(next).toMatchObject({ id: previous.id, frame: previous.frame, rotation: 30, style: previous.style,
      text: 'อีกฉบับ\nยอห์น 3:16 · FB', scriptureSource: { editionId: 'edition-b' } })
    expect(scriptureTextFrame(edition, [], previous)).toBeUndefined()
  })

  it('keeps added Scripture frames and uses alternate slots for native Scripture where available', () => {
    const authored = scriptureTextFrame(edition, [verse])!
    const native: DesignLayer = { ...authored, id: 'native', text: 'Imported passage', scriptureSource: undefined, presentationField: 'scripture' }
    const title: DesignLayer = { ...authored, id: 'title', text: 'Imported title', scriptureSource: undefined, presentationField: 'title' }
    const source: SlideDesign = { aspectRatio: 16 / 9, layers: [title, native, authored] }
    const name = { ...title, id: 'alternate-title', text: '' }
    const slot: DesignLayer = { ...native, id: 'alternate-scripture', text: '', frame: { x: .04, y: .15, width: .54, height: .5 } }
    const shared = { ...authored, text: 'Before editing' }
    const alternate = (layers: DesignLayer[]) => alternatePresentationDesign({ 'alternate:presentation': {
      id: 'alt', title: 'Broadcast', slides: [{ id: 'template', template: 'TITLE', label: 'Title', design: { aspectRatio: 16 / 9, layers } }],
    } }, 'TITLE', 'Imported slide', source)

    expect(alternate([name, slot, shared]).layers).toEqual([{ ...name, text: title.text }, { ...slot, text: native.text }, authored])
    expect(alternate([name]).layers).toEqual([{ ...name, text: title.text }, native, authored])
  })
})
