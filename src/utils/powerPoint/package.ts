/** Browser-local, bounded OOXML PowerPoint package reader. */

import type { FileEntry } from '@zip.js/zip.js'
import { isPowerPointMediaMime, powerPointAssetMime, powerPointAssetName, type PowerPointAsset } from './assets'

const MAX_ENTRIES = 2_000
const MAX_PART_BYTES = 64 * 1024 * 1024
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024

export type PowerPointRelationship = { id: string; type: string; targetPath?: string; external: boolean; externalTarget?: string }
export type PowerPointSlidePart = { id: string; partPath: string; relationshipId: string }
export type PowerPointPackage = {
  title?: string
  author?: string
  description?: string
  looping?: boolean
  tableStylesPath?: string
  size: { widthEmu: number; heightEmu: number; aspectRatio: number }
  slides: PowerPointSlidePart[]
  getPart: (partPath: string) => Promise<Uint8Array>
  getRelationships: (partPath: string) => Promise<PowerPointRelationship[]>
  resolveRelationship: (partPath: string, relationshipId: string) => Promise<string | undefined>
  readAsset: (partPath: string) => Promise<PowerPointAsset | undefined>
  getAsset: (partPath: string, relationshipId: string) => Promise<PowerPointAsset | undefined>
  close: () => Promise<void>
}

function packagePath(path: string): string {
  if (!path || path.includes('\\') || /%2f|%5c/i.test(path)) throw new Error('ไฟล์ PPTX มีพาธแพ็กเกจที่ไม่ปลอดภัย')
  let decoded: string
  try { decoded = decodeURIComponent(path) } catch { throw new Error('ไฟล์ PPTX มีพาธแพ็กเกจที่ไม่ถูกต้อง') }
  if (decoded.includes('\\') || decoded.startsWith('/') || decoded.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('ไฟล์ PPTX มีพาธแพ็กเกจที่ไม่ปลอดภัย')
  }
  return decoded
}

function relationshipPart(partPath: string): string {
  const pieces = partPath.split('/')
  const filename = pieces.pop() ?? ''
  return [...pieces, '_rels', filename + '.rels'].join('/')
}

function resolveTarget(basePart: string, target: string): string | undefined {
  if (!target || target.includes('\\') || /%2f|%5c/i.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined
  if (target.startsWith('/')) {
    try { return packagePath(target.slice(1)) } catch { return undefined }
  }
  const base = basePart.split('/')
  base.pop()
  const parts = target.split('/')
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') { if (!base.length) return undefined; base.pop() } else base.push(part)
  }
  try { return packagePath(base.join('/')) } catch { return undefined }
}

function localName(element: Element): string { return element.localName || element.tagName.split(':').pop() || '' }
function xml(bytes: Uint8Array, path: string): Document {
  if (typeof DOMParser === 'undefined') throw new Error('เบราว์เซอร์นี้ไม่รองรับการอ่าน XML ของ PPTX')
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
  const source = new TextDecoder(encoding).decode(bytes)
  if (/<!doctype/i.test(source)) throw new Error('XML ของ PPTX มี DOCTYPE ที่ไม่รองรับ: ' + path)
  const document = new DOMParser().parseFromString(source, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('XML ของ PPTX ไม่ถูกต้อง: ' + path)
  return document
}

/** Opens only the OOXML central directory; every part is later read from the original File. */
export async function openPowerPointPackage(file: File): Promise<PowerPointPackage> {
  const { BlobReader, BlobWriter, ZipReader } = await import('@zip.js/zip.js')
  const index = new Map<string, FileEntry>()
  const reader = new ZipReader(new BlobReader(file))
  try {
    let count = 0
    let expanded = 0
    for await (const entry of reader.getEntriesGenerator()) {
      if (++count > MAX_ENTRIES) throw new Error('PPTX มีจำนวนไฟล์ภายในมากเกินไป')
      if (entry.directory) continue
      const path = packagePath(entry.filename)
      if (index.has(path)) throw new Error('PPTX มีชื่อไฟล์ภายในซ้ำกัน')
      const size = entry.uncompressedSize
      if (size > MAX_PART_BYTES) throw new Error('PPTX มีส่วนข้อมูลขนาดเกินขีดจำกัด')
      expanded += size
      if (expanded > MAX_EXPANDED_BYTES) throw new Error('PPTX มีข้อมูลเมื่อคลายเกินขีดจำกัด')
      if (/^ppt\/vbaProject\.bin$/i.test(path)) throw new Error('PPTX ที่มีแมโครไม่รองรับ')
      index.set(path, entry as FileEntry)
    }
  } catch (error) { await reader.close(); throw error }
  const canonicalPath = (path: string) => index.has(path) ? path : packagePath(path)
  const getPart = async (partPath: string): Promise<Uint8Array> => {
    const path = canonicalPath(partPath)
    const entry = index.get(path)
    if (!entry) throw new Error('ไม่พบส่วนข้อมูล PPTX: ' + path)
    if (entry.encrypted) throw new Error('ไฟล์ PPTX มีส่วนข้อมูลที่ต้องใช้รหัสผ่าน')
    const blob = await entry.getData(new BlobWriter(), { checkSignature: true })
    if (blob.size > MAX_PART_BYTES) throw new Error('PPTX มีส่วนข้อมูลขนาดเกินขีดจำกัด')
    return new Uint8Array(await blob.arrayBuffer())
  }
  const relationships = new Map<string, PowerPointRelationship[]>()
  const getRelationships = async (partPath: string): Promise<PowerPointRelationship[]> => {
    const source = canonicalPath(partPath)
    const cached = relationships.get(source)
    if (cached) return cached
    const relPath = relationshipPart(source)
    if (!index.has(relPath)) { relationships.set(source, []); return [] }
    const document = xml(await getPart(relPath), relPath)
    const result: PowerPointRelationship[] = []
    const ids = new Set<string>()
    for (const item of document.documentElement.children) {
      if (localName(item) !== 'Relationship') continue
      const id = item.getAttribute('Id')
      const type = item.getAttribute('Type')
      if (!id || !type) continue
      if (ids.has(id)) throw new Error('PPTX มีรหัสอ้างอิงภายในสไลด์ซ้ำกัน')
      ids.add(id)
      const external = (item.getAttribute('TargetMode') ?? '').toLowerCase() === 'external'
      const target = item.getAttribute('Target') ?? ''
      const targetPath = external ? undefined : resolveTarget(source, target)
      result.push({ id, type, external, ...(external && target ? { externalTarget: target } : {}),
        ...(targetPath && index.has(targetPath) ? { targetPath } : {}) })
    }
    relationships.set(source, result)
    return result
  }
  let presentationPart = 'ppt/presentation.xml'
  if (index.has('_rels/.rels')) {
    const rootRels = xml(await getPart('_rels/.rels'), '_rels/.rels')
    const office = Array.from(rootRels.documentElement.children).find((item) => localName(item) === 'Relationship'
      && /\/officeDocument$/i.test(item.getAttribute('Type') ?? '') && item.getAttribute('TargetMode')?.toLowerCase() !== 'external')
    const target = resolveTarget('_root_', office?.getAttribute('Target') ?? '')
    if (target) presentationPart = target
  }
  if (!index.has(presentationPart)) throw new Error('ไม่พบส่วน presentation ของ PPTX')
  const presentation = xml(await getPart(presentationPart), presentationPart)
  if (localName(presentation.documentElement) !== 'presentation') throw new Error('ไฟล์ไม่ได้เป็นงานนำเสนอ PowerPoint')
  const size = Array.from(presentation.getElementsByTagName('*')).find((item) => localName(item) === 'sldSz')
  const widthEmu = Number(size?.getAttribute('cx')); const heightEmu = Number(size?.getAttribute('cy'))
  if (!Number.isFinite(widthEmu) || !Number.isFinite(heightEmu) || widthEmu <= 0 || heightEmu <= 0) throw new Error('PPTX ไม่มีขนาดสไลด์ที่รองรับ')
  const rels = await getRelationships(presentationPart)
  const tableStylesPath = rels.find((relation) => relation.type.endsWith('/tableStyles'))?.targetPath
  const slideRelIds = Array.from(presentation.getElementsByTagName('*')).filter((item) => localName(item) === 'sldId').map((item) => item.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? item.getAttributeNS('http://purl.oclc.org/ooxml/officeDocument/relationships', 'id') ?? Array.from(item.attributes).find((attribute) => attribute.localName === 'id' && /relationships/i.test(attribute.namespaceURI ?? ''))?.value ?? '')
  const slides = slideRelIds.map((relationshipId, index) => {
    const relation = rels.find((item) => item.id === relationshipId)
    if (!relation?.targetPath || relation.external || !/\/slide$/i.test(relation.type)) throw new Error('PPTX มีความสัมพันธ์สไลด์ที่ไม่รองรับ')
    return { id: String(index + 1), partPath: relation.targetPath, relationshipId }
  })
  if (!slides.length) throw new Error('PPTX ไม่มีสไลด์ที่อ่านได้')
  let title: string | undefined
  let author: string | undefined
  let description: string | undefined
  if (index.has('docProps/core.xml')) {
    const core = xml(await getPart('docProps/core.xml'), 'docProps/core.xml')
    const props = Array.from(core.documentElement.children)
    const property = (name: string) => props.find((item) => localName(item) === name)?.textContent?.trim() || undefined
    title = property('title')
    author = property('creator')
    description = property('description')
  }
  const props = rels.find((rel) => rel.type.endsWith('/presProps'))?.targetPath
  const show = props ? xml(await getPart(props), props).getElementsByTagNameNS('*', 'showPr')[0] : undefined
  const looping = ['1', 'true'].includes(show?.getAttribute('loop') ?? '')
  const readAsset = async (partPath: string): Promise<PowerPointAsset | undefined> => {
    const path = canonicalPath(partPath)
    const mime = powerPointAssetMime(path)
    if (!mime || !isPowerPointMediaMime(mime) || !index.has(path)) return undefined
    return { sourcePath: path, filename: powerPointAssetName(path), mime, bytes: await getPart(path) }
  }
  const resolveRelationship = async (partPath: string, id: string) => (await getRelationships(partPath)).find((item) => item.id === id && !item.external)?.targetPath
  return { title, author, description, looping, tableStylesPath, size: { widthEmu, heightEmu, aspectRatio: widthEmu / heightEmu }, slides, getPart, getRelationships,
    resolveRelationship,
    readAsset,
    getAsset: async (partPath, id) => {
      const target = await resolveRelationship(partPath, id)
      return target ? readAsset(target) : undefined
    },
    close: () => reader.close(),
  }
}
