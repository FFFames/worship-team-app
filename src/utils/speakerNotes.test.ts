import { describe, expect, it } from 'vitest'
import type { DesignContent } from '../types/slideDesign'
import { presentationCue } from './slideDesign'
import { presentationContentFromCue } from './playlistPresentationReconciliation'
import { restorePowerPointSlides } from './powerPoint/layoutReplacement'
import { maxSpeakerNotesLength, validOptionalSpeakerNotes, visibleNote } from './speakerNotes'

const layout = { aspectRatio: 16 / 9, layers: [] }
const note = 'โน้ตบรรทัดแรก\nบรรทัดสอง'
const source = { format: 'powerpoint' as const, uid: 'same-deck' }

describe('Speaker notes', () => {
  it('recovers notes only for matching slides without a saved note', () => {
    const incoming: DesignContent = { source, slides: [
      { id: 'one', label: 'Original title', design: layout, speakerNotes: note },
      { id: 'two', label: 'Original next title', design: layout, speakerNotes: note },
    ] }
    const saved: DesignContent = { source, slides: [
      { id: 'one', label: 'Local title', design: layout },
      { id: 'two', label: 'Second slide', design: layout, speakerNotes: '' },
    ] }
    const restored = restorePowerPointSlides(saved, incoming)
    expect(restored.slides).toEqual([{ ...saved.slides[0], speakerNotes: note }, saved.slides[1]])
    expect(restorePowerPointSlides(restored, incoming)).toBe(restored)
    expect(restorePowerPointSlides(saved, { ...incoming, source: { ...source, uid: 'different-deck' } })).toBe(saved)
  })

  it('copies written and explicitly cleared notes between the library and a schedule', () => {
    const content: DesignContent = { source, slides: [
      { id: 'one', label: 'Note', design: layout, speakerNotes: note },
      { id: 'two', label: 'Blank', design: layout, speakerNotes: '' },
    ] }
    const cue = presentationCue({ id: 'design', title: 'Deck', kind: 'presentation', content, created_at: '' })
    expect(cue.slides.map(({ speakerNotes }) => speakerNotes)).toEqual([note, ''])
    expect(cue.slides.every(({ design }) => !Object.prototype.hasOwnProperty.call(design, 'speakerNotes'))).toBe(true)
    expect(presentationContentFromCue({ ...cue, kind: 'powerpoint' }).slides.map(({ speakerNotes }) => speakerNotes)).toEqual([note, ''])
  })

  it('accepts bounded plain text and skips blank notes for display', () => {
    expect(validOptionalSpeakerNotes(undefined)).toBe(true)
    expect(validOptionalSpeakerNotes('')).toBe(true)
    expect(validOptionalSpeakerNotes('abc\0def')).toBe(false)
    expect(validOptionalSpeakerNotes('a'.repeat(maxSpeakerNotesLength + 1))).toBe(false)
    expect(visibleNote(' \n ')).toBeUndefined()
    expect(visibleNote(note)).toBe(note)
  })
})
