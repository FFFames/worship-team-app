import { describe, expect, it } from 'vitest'
import type { SlideDesign } from '../types/slideDesign'
import { applyPresentationLayout, applyThemeText } from './slideDesign'
import { readTextDocument, textDocumentSlides, withDocumentText } from './textDocument'

describe('text document import', () => {
  it('keeps Thai and English text from UTF-16 and preserves explicit slide boundaries', async () => {
    const text = 'ยินดีต้อนรับ\r\nพร้อมแล้ว\r\n\r\nService notes\fNext page'
    const utf16 = Uint8Array.from([0xff, 0xfe, ...Array.from(text).flatMap((letter) => {
      const code = letter.charCodeAt(0)
      return [code & 255, code >> 8]
    })])
    const doc = await readTextDocument(new File([utf16], 'Sunday.txt'))
    expect(textDocumentSlides(doc, true).map(({ text }) => text)).toEqual(['ยินดีต้อนรับ\nพร้อมแล้ว', 'Service notes', 'Next page'])
    expect(textDocumentSlides(doc, false)).toEqual([{ text: 'ยินดีต้อนรับ\nพร้อมแล้ว\n\nService notes\nNext page' }])
  })

  it('requires a declared encoding for legacy plain text and accepts Windows-874', async () => {
    const file = new File([Uint8Array.of(0xca, 0xc7, 0xd1, 0xca, 0xb4, 0xd5)], 'Thai.txt')
    await expect(readTextDocument(file)).rejects.toThrow('รหัสอักษร')
    expect(await readTextDocument(file, '874')).toEqual({ text: 'สวัสดี' })
    await expect(readTextDocument(new File(['   '], 'Empty.txt'))).rejects.toThrow('ไม่มีข้อความ')
  })

  it('retains RTF styles and rebases paragraph formatting after splitting', async () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg874\ql\li240 \'ca\'c7\'d1\'ca\'b4\'d5 {\b Welcome}\par\par\pard\qc {\i Service notes}\page Final page}`
    const doc = await readTextDocument(new File([rtf], 'Service.rtf'))
    const slides = textDocumentSlides(doc, true)
    expect(slides.map(({ text }) => text)).toEqual(['สวัสดี Welcome', 'Service notes', 'Final page'])
    expect(slides[0].runs?.some((run) => run.text === 'Welcome' && run.style?.bold)).toBe(true)
    expect(slides[0].runs?.[0].paragraph).toMatchObject({ index: 0, leftIndent: 1 })
    expect(slides[1].runs?.[0]).toMatchObject({ text: 'Service notes', align: 'center', style: { italic: true }, paragraph: { index: 0 } })
    const single = textDocumentSlides(doc, false)[0]
    expect(single.runs?.map(({ text }) => text).join('')).toBe(single.text)
  })

  it('fills an existing empty content layer and preserves the surrounding design', () => {
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const design = { aspectRatio: 16 / 9, layers: [
      { id: 'fill', kind: 'fill', frame, fill: { type: 'solid', color: '#000000' } },
      { id: 'title', kind: 'text', frame, slot: 'reference', text: 'Keep' },
      { id: 'content', kind: 'text', frame, slot: 'content', text: '' },
    ] } as const
    const applied = withDocumentText({ ...design, layers: [...design.layers] }, { text: 'Imported', runs: [{ text: 'Imported', style: { bold: true } }] })
    expect(applied.layers.slice(0, 2)).toEqual(design.layers.slice(0, 2))
    expect(applied.layers[2]).toMatchObject({ id: 'content', text: 'Imported', runs: [{ text: 'Imported', style: { bold: true } }] })
  })

  it('keeps imported theme text and formatting when the display supplies live text in reserved frames', () => {
    const frame = { x: .1, y: .1, width: .8, height: .6 }
    const design: SlideDesign = { aspectRatio: 16 / 9, layers: [
      { id: 'content', kind: 'text', frame, slot: 'content', text: '' },
      { id: 'reference', kind: 'text', frame, slot: 'reference', text: '' },
      { id: 'title', kind: 'text', frame, presentationField: 'title', text: '' },
    ] }
    const text = { text: 'นมัสการร่วมกัน', runs: [{ text: 'นมัสการร่วมกัน', style: { bold: true } }] }
    const next = withDocumentText(design, text, 'static')
    expect(next.layers.slice(0, 3)).toEqual(design.layers)
    const imported = next.layers[3]
    expect(imported).toMatchObject(text)
    expect(imported).not.toHaveProperty('slot')
    expect(applyThemeText(next, 'เนื้อเพลง', 'สดุดี 136:1').layers).toEqual([
      { ...design.layers[0], text: 'เนื้อเพลง' }, { ...design.layers[1], text: 'สดุดี 136:1' }, design.layers[2], imported,
    ])
    const title: SlideDesign = { ...design, layers: [{ id: 'title', kind: 'text', frame, presentationField: 'title', text: 'หัวข้องาน' }] }
    expect(applyPresentationLayout(next, title).layers.slice(-2)).toEqual([title.layers[0], imported])
    const emptyCaption: SlideDesign = { ...design, layers: [...design.layers, { id: 'caption', kind: 'text', frame, text: '' }] }
    expect(withDocumentText(emptyCaption, text, 'static').layers[3]).toEqual({ ...emptyCaption.layers[3], ...text })
  })
})
