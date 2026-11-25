/** Reads only the speaker's body placeholder from a PresentationML notes page. */

import { validOptionalSpeakerNotes } from '../speakerNotes'
import { attr, child, paragraphText, parseXml } from './xml'

function noteShapes(root: Element | undefined) {
  return Array.from(child(child(root, 'cSld'), 'spTree')?.children ?? []).filter((shape) => shape.localName === 'sp')
}

function placeholder(shape: Element) {
  return child(child(child(shape, 'nvSpPr'), 'nvPr'), 'ph')
}

function paragraphs(shape: Element) {
  return Array.from(child(shape, 'txBody')?.children ?? []).filter((element) => element.localName === 'p')
}

export function readPowerPointNotes(notesXml: string, masterXml?: string, legacy = false): string | undefined {
  const notes = parseXml(notesXml)
  if (notes?.localName !== 'notes') throw new Error('อ่านไฟล์โน้ต PowerPoint ไม่สำเร็จ')
  const master = parseXml(masterXml)
  const inheritedBodyIds = new Set(noteShapes(master).flatMap((shape) => {
    const ph = placeholder(shape)
    return attr(ph, 'type') === 'body' ? [attr(ph, 'idx') ?? '0'] : []
  }))
  const shapes = noteShapes(notes)
  const bodyText = shapes.flatMap((shape) => {
    const ph = placeholder(shape)
    const type = attr(ph, 'type')
    if (!ph || (type !== 'body' && (type !== undefined || !inheritedBodyIds.has(attr(ph, 'idx') ?? '0')))) return []
    return paragraphs(shape).map(paragraphText)
  }).join('\n')
  let notesText = bodyText.replace(/\n+$/, '')
  if (legacy && !notesText.trim()) {
    // LibreOffice can export a legacy notes body as an unnamed text box alongside a numeric field.
    const boxes = shapes.filter((shape) => !placeholder(shape) && !attr(child(child(shape, 'nvSpPr'), 'cNvPr'), 'name'))
      .map(paragraphs).filter((lines) => lines.some((line) => child(line, 'r')) && !lines.some((line) => child(line, 'fld')))
      .map((lines) => lines.map(paragraphText).join('\n').replace(/\n+$/, '')).filter((text) => text.trim())
    if (boxes.length > 1) throw new Error('พบกล่องข้อความหลายช่องในหน้าโน้ตแบบเดิม')
    notesText = boxes[0] ?? notesText
  }
  if (!validOptionalSpeakerNotes(notesText)) throw new Error('โน้ตยาวเกินขนาดที่รองรับ')
  return notesText.trim() ? notesText : undefined
}
