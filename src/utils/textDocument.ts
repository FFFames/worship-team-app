/** Reads local text documents and keeps styled runs aligned after splitting into slides. */

import type { DesignLayer, DesignTextRun, SlideDesign } from '../types/slideDesign'
import { displayRunsFromEasyWorshipRtf } from './easyWorship'
import { decodeEasyWorshipText, type LegacySongEncoding } from './easyWorshipEncoding'
import { sliceTextRuns } from './slideDesign'

export type TextDocumentSlide = { text: string; runs?: DesignTextRun[] }

export async function readTextDocument(file: File, encoding: LegacySongEncoding = 'auto'): Promise<TextDocumentSlide> {
  if (!/\.(txt|rtf)$/i.test(file.name)) throw new Error('เลือกไฟล์ .txt หรือ .rtf')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const header = String.fromCharCode(...bytes.subarray(0, 1024))
  const rawRtf = /^\s*\{\\rtf\d/i.test(header)
  const codePage = encoding !== 'auto' ? encoding : rawRtf ? /\\ansicpg(\d+)/.exec(header)?.[1] ?? '1252' : undefined
  const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be'
    : bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'utf-8' : undefined
  let decoded: string
  try {
    decoded = bom || !codePage ? new TextDecoder(bom ?? 'utf-8', { fatal: true }).decode(bytes)
      : decodeEasyWorshipText(bytes, codePage)
  } catch {
    throw new Error('อ่านรหัสอักษรของไฟล์ไม่ได้ ลองเลือกรหัสอักษรของไฟล์ต้นฉบับ')
  }

  const rtf = /^\s*\{\\rtf\d/.test(decoded)
  if (/\.rtf$/i.test(file.name) && !rtf) throw new Error('ไม่พบหัวเอกสาร RTF ในไฟล์นี้')
  if (!rtf && /[\u0000-\u0008\u000b\u000e-\u001f]/.test(decoded)) throw new Error('ไฟล์นี้มีข้อมูลที่ไม่ใช่ข้อความ')
  const document = rtf ? displayRunsFromEasyWorshipRtf(decoded, {}, codePage)
    : { text: decoded.replace(/\r\n?/g, '\n') }
  if (!document.text.trim()) throw new Error('ไฟล์นี้ไม่มีข้อความที่จะเพิ่ม')
  return document
}

export function textDocumentSlides({ text, runs }: TextDocumentSlide, split: boolean): TextDocumentSlide[] {
  if (!split) {
    const trimmed = text.trim()
    const start = text.length - text.trimStart().length
    return [{ text: trimmed.replace(/\f/g, '\n'),
      ...(runs ? { runs: sliceTextRuns(runs, start, start + trimmed.length).map((run) => ({ ...run, text: run.text.replace(/\f/g, '\n') })) } : {}) }]
  }

  const slides: TextDocumentSlide[] = []
  let start = 0
  for (const separator of [...text.matchAll(/\n?\f\n?|\n(?:[ \t]*\n)+/g), { index: text.length, 0: '' }]) {
    const block = text.slice(start, separator.index)
    const content = block.trim()
    if (content) {
      const from = start + block.length - block.trimStart().length
      const fragments = runs && sliceTextRuns(runs, from, from + content.length)
      const firstParagraph = fragments?.find(({ paragraph }) => paragraph)?.paragraph?.index ?? 0
      slides.push({ text: content, ...(fragments ? { runs: fragments.map((run) => run.paragraph
        ? { ...run, paragraph: { ...run.paragraph, index: run.paragraph.index - firstParagraph } } : run) } : {}) })
    }
    start = separator.index + separator[0].length
  }
  return slides
}

/** Writes into a blank text layer while preserving the slide's background and other layers. */
export function withDocumentText(design: SlideDesign, { text, runs }: TextDocumentSlide, targetKind: 'slide' | 'static' = 'slide'): SlideDesign {
  const staticText = targetKind === 'static'
  const blankLayers = design.layers.filter((layer): layer is Extract<DesignLayer, { kind: 'text' }> =>
    layer.kind === 'text' && !layer.text.trim() && (staticText
      ? !layer.slot && !layer.presentationField && !layer.scriptureSource
      : layer.slot !== 'reference'))
  const target = blankLayers.find((layer) => layer.slot === 'content') ?? blankLayers[0]
  const layer: DesignLayer = target ? { ...target, text, runs } : {
    kind: 'text', id: crypto.randomUUID(), text, runs,
    ...(staticText ? {} : { slot: 'content' }),
    frame: staticText ? { x: 0.08, y: 0.87, width: 0.84, height: 0.11 } : { x: 0.08, y: 0.14, width: 0.84, height: 0.72 },
    style: { align: 'center', verticalAlign: 'center', fitText: true },
  }
  return { ...design, layers: target ? design.layers.map((existing) => existing === target ? layer : existing) : [...design.layers, layer] }
}
