/** Checks list migration, authoring continuity and recovery on existing cues. */

import { describe, expect, it } from 'vitest'
import type { PlaylistCue } from '../types/database'
import type { DesignParagraphList, DesignTextRun } from '../types/slideDesign'
import { displayRunsFromEasyWorshipRtf, displayTextFromEasyWorshipRtf } from './easyWorship'
import { fillScheduleFormatting, recoverableScheduleFormatting } from './easyWorshipScheduleCues'
import { validDesignTextRun } from './playlistPackageManifest'
import { editTextRuns } from './slideDesign'
import { paragraphListMarkers } from './slideParagraphLists'
import { lyricParagraphs, recoverMissingParagraphLists } from './songParagraphFormatting'

describe('slide paragraph lists', () => {
  it('restores native list controls and standard RTF marker groups without inserting them into lyrics', () => {
    const rtf = String.raw`{\rtf1\ansi\uc1{\pard\sdparawysiwghidden Verse 1\par}
{\pard\sdbullettype1\sdlistlevel1{\*\sdbullettext \u9670?} One\line soft\par}
{\pard\sdbullettype10\sdewparalistindexstart4 Two\par}
{\pard\sdbullettype10 Three\par}
{\pard\ilvl2{\listtext{\b A.}\tab}Four\par}
{\pard{\pntext\bullet\tab}Five\par}
{\pard plain}}`
    const { text, runs } = displayRunsFromEasyWorshipRtf(rtf, {})
    expect(text).toBe('One\nsoft\nTwo\nThree\nFour\nFive\nplain')
    expect(displayTextFromEasyWorshipRtf(rtf)).toBe(text)
    expect(lyricParagraphs(text, runs).map(({ format }) => format.list)).toEqual([
      { style: 'bullet', level: 1, text: '◆' },
      { style: 'lower-roman', punctuation: 'parentheses', start: 4 },
      { style: 'lower-roman', punctuation: 'parentheses' },
      { style: 'literal', text: 'A.', level: 2 },
      { style: 'literal', text: '•' },
      undefined,
    ])
    expect(runs?.every(validDesignTextRun)).toBe(true)
  })

  it('continues outer numbering over a nested list and restarts after a paragraph without a marker', () => {
    const decimal: DesignParagraphList = { style: 'decimal' }
    const nested: DesignParagraphList = { style: 'decimal', level: 1 }
    const alternate: DesignParagraphList = { style: 'lower-alpha', level: 1, punctuation: 'parenthesis' }
    expect(paragraphListMarkers([{ ...decimal, start: 9 }, nested, nested, decimal, alternate, decimal, false, decimal]))
      .toEqual(['9.', '1.', '2.', '10.', 'a)', '1.', undefined, '1.'])
    expect(paragraphListMarkers([{ style: 'upper-roman', start: 14, punctuation: 'parentheses' }])).toEqual(['(XIV)'])
  })

  it('fills a missing list on a matching schedule layer without replacing local formatting or a removed marker', () => {
    const style: DesignParagraphList = { style: 'upper-alpha', punctuation: 'period' }
    const text = 'Alpha\nBeta'
    const source: DesignTextRun[] = [{ text: 'Alpha\n', paragraph: { index: 0, list: style } },
      { text: 'Beta', paragraph: { index: 1, list: style } }]
    const saved: DesignTextRun[] = [{ text: 'Alpha\n', paragraph: { index: 0, list: false } },
      { text: 'Beta', style: { italic: true }, paragraph: { index: 1, leftIndent: 1 } }]
    const cue = (runs: DesignTextRun[]): PlaylistCue => ({
      kind: 'presentation', label: 'Local title', sourceId: 'native', slides: [{
        label: 'Local slide name', sourceId: '001', lines: text.split('\n'),
        design: { aspectRatio: 16 / 9, layers: [{ id: 'frame', kind: 'text', text, runs,
          frame: { x: .1, y: .1, width: .8, height: .8 } }] },
      }],
    })
    const merged = recoverMissingParagraphLists(text, saved, source)
    expect(merged).toEqual([saved[0], { ...saved[1], paragraph: { ...saved[1].paragraph, list: style } }])
    const candidates = recoverableScheduleFormatting([cue(source)])
    const updated = fillScheduleFormatting(cue(saved), candidates)
    expect(updated).toEqual({ count: 1, cue: cue(merged!) })
    expect(fillScheduleFormatting(updated!.cue, candidates)).toBeUndefined()
  })

  it('continues a numbered list when editing creates a paragraph', () => {
    const runs: DesignTextRun[] = [{ text: 'Alpha', paragraph: { index: 0, list: { style: 'decimal', start: 4 } } }]
    const edited = editTextRuns(runs, 'Alpha', 'Alpha\nBeta')
    expect(paragraphListMarkers(lyricParagraphs('Alpha\nBeta', edited).map(({ format }) => format.list))).toEqual(['4.', '5.'])
  })
})
