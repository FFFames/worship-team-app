/** Covers native styled text, slot substitution, and safe plain-text editing. */

import { describe, expect, it } from 'vitest'
import { displayRunsFromEasyWorshipRtf, displayTextFromEasyWorshipRtf, songLabelFromEasyWorshipRtf } from './easyWorship'
import { applyPresentationLayout, applyThemeText, editDesignText } from './slideDesign'
import { backfillImportedLayoutDetails, easyWorshipDesignIdentityContent } from './slideDesignAssets'
import { validDesignTextRun } from './playlistPackageManifest'
import { reflowSongCueSlide, splitSongCueSlide } from './songCueLayout'
import type { DesignLayer, SlideDesign } from '../types/slideDesign'

const sample = String.raw`{\rtf1\ansi\deff0\uc1
{\fonttbl{\f0 Tahoma;}{\f1\fnil Courier New;}}
{\colortbl ;\red216\green37\blue52;\red10\green70\blue125;}
{\pard\sdparawysiwghidden\b Hidden label\par}
{\pard\plain\fs48 Plain {\b\cf1\u3585?\u3634?\u3619?} {\i\ul\cf2\f1\fs24 Small} far\line end\par}
}`

describe('EasyWorship rich text', () => {
  it('reads native labels separately from the visible lyrics and handles Unicode fallbacks', () => {
    const value = '{\\rtf1\\ansi\\ansicpg874\\uc1'
      + "{\\pard\\sdparawysiwghidden\\fs48 \\'a1\\u3657? 1\\par}"
      + '{\\pard\\sdparawysiwghidden1 Chorus\\par}'
      + '{\\pard\\sdparawysiwghidden0 Keep this lyric\\par}}'
    expect(songLabelFromEasyWorshipRtf(value)).toBe('ก้ 1 · Chorus')
    expect(displayTextFromEasyWorshipRtf(value)).toBe('Keep this lyric')
    expect(songLabelFromEasyWorshipRtf('Words')).toBeUndefined()
  })

  it('keeps editable paragraph spacing, indentation and soft breaks through song reflow and splits', () => {
    const rtf = '{\\rtf1\\ansi{\\pard\\ql\\li600\\ri240\\fi-120\\sb120\\sa240\\sl360\\slmult1\\fs48 First {\\b bold}\\line Soft\\par}'
      + '{\\pard\\fs48 Plain\\par}{\\pard\\sl-480\\slmult0\\fs48 Exact\\par}{\\pard\\sl720\\fs48 Minimum\\par}}'
    const formatted = displayRunsFromEasyWorshipRtf(rtf, {})
    const paragraph = { index: 0, leftIndent: 1.25, rightIndent: 0.5, firstLineIndent: -0.25,
      spaceBefore: 0.25, spaceAfter: 0.5, lineSpacing: { mode: 'multiple', value: 1.5 } }
    expect(formatted.text).toBe('First bold\nSoft\nPlain\nExact\nMinimum')
    expect(formatted.runs).toMatchObject([
      { text: 'First ', align: 'left', paragraph },
      { text: 'bold', style: { bold: true }, paragraph },
      { text: '\nSoft\n', paragraph },
      { text: 'Plain\n', paragraph: { index: 1 } },
      { text: 'Exact\n', paragraph: { index: 2, lineSpacing: { mode: 'exact', value: 1 } } },
      { text: 'Minimum', paragraph: { index: 3, lineSpacing: { mode: 'minimum', value: 1.5 } } },
    ])
    expect(formatted.runs?.every(validDesignTextRun)).toBe(true)
    expect(validDesignTextRun({ text: 'Invalid', paragraph: { index: 0, lineSpacing: { mode: 'other', value: 1 } } })).toBe(false)
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const layer = { kind: 'text', id: 'copy', frame, slot: 'content', ...formatted } as const
    const slide = { label: 'Verse', lines: formatted.text.split('\n'), design: { aspectRatio: 1, layers: [layer] } }
    const [reflowed] = reflowSongCueSlide(slide, 2)
    expect(reflowed.design?.layers[0]).toMatchObject({ text: 'First bold\nSoft', runs: [
      { text: 'First ', paragraph }, { text: 'bold', paragraph }, { text: '\n', paragraph }, { text: 'Soft', paragraph },
    ] })
    const parts = splitSongCueSlide(slide, formatted.text.indexOf('\nPlain'))!
    expect(parts[1].design?.layers[0]).toMatchObject({ text: 'Plain\nExact\nMinimum', runs: [
      { paragraph: { index: 1 } }, { paragraph: { index: 2 } }, { paragraph: { index: 3 } },
    ] })
    expect(editDesignText(layer, formatted.text.replace('Soft', 'New')).runs?.some((run) =>
      run.text === 'New' && run.paragraph?.index === 0)).toBe(true)
  })

  it('updates an earlier imported text box with paragraph data and keeps local formatting edits', () => {
    const legacy = { text: 'First\nSecond', runs: [{ text: 'First\n' }, { text: 'Second', align: 'right' as const }] }
    const latest = displayRunsFromEasyWorshipRtf('{\\rtf1\\pard\\li480 First\\par\\pard\\qr Second}', {})
    const content = (format: typeof latest) => ({
      source: { format: 'easyworship' as const, uid: 'layout' },
      slides: [{ id: 'slide', label: 'Title', design: { aspectRatio: 1, layers: [{
        id: 'text', kind: 'text' as const, frame: { x: 0, y: 0, width: 1, height: 1 }, ...format,
      }] } }],
    })
    expect(backfillImportedLayoutDetails(content(legacy), content(latest))).toEqual(content(latest))
    const edited = content({ ...legacy, runs: [{ text: 'First\n', style: { bold: true } }, legacy.runs[1]] })
    expect(backfillImportedLayoutDetails(edited, content(latest))).toBe(edited)
  })

  it('keeps visible Unicode, grouped styles, colors, font changes and relative sizes', () => {
    const result = displayRunsFromEasyWorshipRtf(sample, { fontFamily: 'Tahoma', bold: true })
    expect(result.text).toBe('Plain การ Small far\nend')
    expect(result.text).toBe(displayTextFromEasyWorshipRtf(sample))
    expect(result.runs).toEqual([
      { text: 'Plain ', style: { bold: false } },
      { text: 'การ', style: { color: '#d82534', bold: true } },
      { text: ' ', style: { bold: false } },
      { text: 'Small', style: { fontFamily: 'Courier New', color: '#0a467d', sizeScale: 0.5, bold: false, italic: true, underline: true } },
      { text: ' far\nend', style: { bold: false } },
    ])
  })

  it('honors plain resets, explicit style off, and a nonempty color at index zero', () => {
    const source = String.raw`{\rtf1{\colortbl\red45\green60\blue90;}\b\cf0 One \b0 Two \plain Three}`
    expect(displayRunsFromEasyWorshipRtf(source, {}).runs).toEqual([
      { text: 'One ', style: { color: '#2d3c5a', bold: true } },
      { text: 'Two ', style: { color: '#2d3c5a', bold: false } },
      { text: 'Three' },
    ])
    expect(displayRunsFromEasyWorshipRtf(String.raw`{\rtf1\b Already bold}`, { bold: true }))
      .toEqual({ text: 'Already bold' })
  })

  it('reuses the source style for matching slots and keeps unaffected formatting during edits', () => {
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const base: Extract<DesignLayer, { kind: 'text' }> = {
      kind: 'text', id: 'copy', frame, ...displayRunsFromEasyWorshipRtf(sample, { fontFamily: 'Tahoma' }),
    }
    const song: SlideDesign = { aspectRatio: 1, layers: [{ ...base, text: '', slot: 'content' }] }
    const matched = applyThemeText(song, 'Small far\nend').layers[0]
    expect(matched).toMatchObject({ text: 'Small far\nend', runs: [{ text: 'Small', style: { italic: true } }, { text: ' far\nend' }] })
    expect(applyThemeText(song, 'Plain กา\nร Small\nfar end').layers[0])
      .toMatchObject({ runs: [{ text: 'Plain' }, { text: ' กา\nร', style: { color: '#d82534' } }, { text: ' Small', style: { italic: true } }, { text: '\nfar end' }] })
    expect(applyThemeText(song, 'New words').layers[0]).not.toHaveProperty('runs')
    expect(editDesignText(base, 'New words')).not.toHaveProperty('runs')
    const edited = editDesignText(base, base.text.replace('Small', 'New'))
    expect(edited.runs?.find((run) => run.text === 'New')?.style).toMatchObject({ italic: true, underline: true })
    expect(edited.runs?.find((run) => run.text === 'การ')?.style).toMatchObject({ color: '#d82534' })

    const source: SlideDesign = { aspectRatio: 1, layers: [{ ...base, presentationField: 'title' }] }
    const theme: SlideDesign = { aspectRatio: 2, layers: [{ ...base, text: '', presentationField: 'title' }] }
    expect(applyPresentationLayout(theme, source).layers[0]).toMatchObject({ text: base.text, runs: base.runs })
    const normalized = easyWorshipDesignIdentityContent({ slides: [{ id: 'slide', label: 'Title', design: source }] })
    expect(normalized.slides[0].design.layers[0]).not.toHaveProperty('runs')
  })
})
