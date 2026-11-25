/** Reads the binary EWS schedule directory and the payloads it references. */

import { LEGACY_SCHEDULE_HEADER, type EasyWorshipSchedule, type EasyWorshipScheduleAsset, type EasyWorshipScheduleCue } from './easyWorshipSchedule'
import { decodeEasyWorshipText, legacySongCodePage, type LegacySongEncoding } from './easyWorshipEncoding'
import { readEasyWorshipLegacySections } from './easyWorshipLegacyLyrics'
import { importBlobIdentity } from './importIdentity'
import { hasPowerPointCompoundHeader, isLegacyPowerPoint, isPowerPointFilename, maxPackedPowerPointBytes,
  powerPointOpenXmlMime } from './powerPointFilename'
import type { DesignFill, DesignTextRun, SlideDesign } from '../types/slideDesign'
import { presentationWebUrl } from './livePresentation'
import { legacyGradientFill } from './easyWorshipLegacyStyle'
import { canConvertLegacyVideo, legacyVideoSourceMime } from './legacyVideo'
import { recordEasyWorshipExternalMediaLocations } from './easyWorshipExternalMedia'

const FORMATS = new Map([['1.6', { count: 40, width: 848 }], ['3', { count: 48, width: 1528 }], ['5', { count: 56, width: 1816 }]])
const MAX_TEXT = 2 * 1024 * 1024
const MAX_TOTAL_TEXT = 64 * 1024 * 1024
const MAX_ENTRIES = 10_000
const INVALID_TEXT = 'อ่านเนื้อหาที่บีบอัดในตาราง .ews ไม่สำเร็จ'

type MediaKind = 'image' | 'video' | 'audio'

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? ''
}

function textAt(row: Uint8Array, offset: number, length: number, encoding: string): string | null {
  const bytes = row.subarray(offset, offset + length)
  const end = bytes.indexOf(0)
  return decodeEasyWorshipText(end < 0 ? bytes : bytes.subarray(0, end), encoding).trim() || null
}

function color(row: Uint8Array, offset: number): string {
  return '#' + Array.from(row.subarray(offset, offset + 3), (component) => component.toString(16).padStart(2, '0')).join('')
}

function backgroundFill(row: Uint8Array, type: number): DesignFill | undefined {
  if (!row[510] || row[511]) return undefined
  if (type === 0) return { type: 'solid', color: color(row, 516) }
  if (type !== 1) return undefined
  return legacyGradientFill(color(row, 520), color(row, 524), row[528], row[529])
}

function coloredSlide(fill: DesignFill, row: Uint8Array, lines: string[], scripture: boolean, runs?: DesignTextRun[]): SlideDesign {
  const frame = { x: 0, y: 0, width: 1, height: 1 }
  const explicitFont = row[844] === 1 && row.length > 1137
  return {
    aspectRatio: 16 / 9,
    layers: [
      { id: 'background', kind: 'fill', frame, fill },
      {
        id: 'lyrics', kind: 'text', text: lines.join('\n'), frame: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
        ...(scripture ? { slot: 'content' } : {}),
        ...(runs ? { runs } : {}),
        style: {
          color: explicitFont && row[1108] === 0 ? color(row, 1112) : '#ffffff',
          fontSize: Math.min(0.08, 0.6 / Math.max(lines.length, 1)), padding: 0,
          align: explicitFont && row[1136] === 0 ? 'left' : explicitFont && row[1136] === 2 ? 'right' : 'center',
          verticalAlign: explicitFont && row[1137] === 0 ? 'top' : explicitFont && row[1137] === 2 ? 'bottom' : 'center',
          bold: !explicitFont || row[1134] !== 0,
          italic: explicitFont && row[1135] === 1,
        },
      },
    ],
  }
}

async function inflateLyrics(data: Blob, expected: number): Promise<Uint8Array> {
  const stream = data.stream().pipeThrough(new DecompressionStream('deflate')).getReader()
  const output = new Uint8Array(expected)
  let offset = 0
  try {
    while (true) {
      const { value, done } = await stream.read()
      if (done) break
      if (offset + value.length > output.length) throw new Error(INVALID_TEXT)
      output.set(value, offset)
      offset += value.length
    }
    if (offset !== expected) throw new Error(INVALID_TEXT)
    return output
  } catch {
    await stream.cancel().catch(() => undefined)
    throw new Error(INVALID_TEXT)
  } finally {
    stream.releaseLock()
  }
}

function mediaFormat(header: Uint8Array, kind: MediaKind): { extension: string; mime: string } | undefined {
  const ascii = new TextDecoder('windows-1252').decode(header)
  if (kind === 'image') {
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return { extension: 'jpg', mime: 'image/jpeg' }
    if (header[0] === 0x89 && ascii.slice(1, 4) === 'PNG') return { extension: 'png', mime: 'image/png' }
    if (ascii.startsWith('BM')) return { extension: 'bmp', mime: 'image/bmp' }
    if (ascii.startsWith('GIF8')) return { extension: 'gif', mime: 'image/gif' }
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return { extension: 'webp', mime: 'image/webp' }
  }
  if (ascii.slice(4, 8) === 'ftyp' && kind !== 'image') {
    return kind === 'video' ? { extension: 'mp4', mime: 'video/mp4' } : { extension: 'm4a', mime: 'audio/mp4' }
  }
  if (kind === 'video' && canConvertLegacyVideo()) {
    const asf = [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]
    if (asf.every((byte, index) => header[index] === byte)) return { extension: 'wmv', mime: legacyVideoSourceMime }
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'AVI ') return { extension: 'avi', mime: legacyVideoSourceMime }
    if (header[0] === 0 && header[1] === 0 && header[2] === 1 && (header[3] === 0xba || header[3] === 0xb3)) {
      return { extension: 'mpg', mime: legacyVideoSourceMime }
    }
  }
  if (kind === 'audio') {
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') return { extension: 'wav', mime: 'audio/wav' }
    if (ascii.startsWith('ID3') || (header[0] === 0xff && (header[1] & 0xe6) === 0xe2)) return { extension: 'mp3', mime: 'audio/mpeg' }
  }
  return undefined
}

export async function readEasyWorshipLegacySchedule(
  file: File, encoding: LegacySongEncoding = 'auto',
): Promise<EasyWorshipSchedule> {
  const head = await file.slice(0, 62).arrayBuffer()
  const versionText = new TextDecoder().decode(head.slice(0, 38))
  const version = versionText.slice(LEGACY_SCHEDULE_HEADER.length).trim()
  const format = versionText.startsWith(LEGACY_SCHEDULE_HEADER) && FORMATS.get(version)
  if (!format) throw new Error('ไม่รู้จักรุ่นของไฟล์ตาราง .ews')
  const directoryStart = format.count + 6
  if (head.byteLength < directoryStart) throw new Error('ส่วนหัวของตาราง .ews ไม่ครบ')
  const header = new DataView(head)
  const count = header.getUint32(format.count, true)
  const width = header.getUint16(format.count + 4, true)
  const directoryEnd = directoryStart + count * width
  if (count > MAX_ENTRIES || width !== format.width || directoryEnd > file.size) throw new Error('รายการในตาราง .ews ไม่ครบหรืออ่านไม่ได้')
  const data = new Uint8Array(await file.slice(directoryStart, directoryEnd).arrayBuffer())
  const page = legacySongCodePage(0, encoding)
  const packedMedia = new Map<string, Blob>()
  const packedCache = new Map<string, Promise<string | undefined>>()
  const unsupported: EasyWorshipSchedule['unsupported'] = []
  let totalText = 0

  const validRange = (start: number, length: number) => start >= directoryEnd && length > 0 && start + length <= file.size
  async function readText(pointer: number) {
    if (!validRange(pointer, 14)) throw new Error(INVALID_TEXT)
    const size = new DataView(await file.slice(pointer, pointer + 4).arrayBuffer()).getUint32(0, true)
    if (size < 16 || size > MAX_TEXT || !validRange(pointer, 4 + size)) throw new Error(INVALID_TEXT)
    const end = pointer + 4 + size
    const footer = new DataView(await file.slice(end - 10, end).arrayBuffer())
    const expected = footer.getUint32(4, true)
    if (footer.getUint32(0) !== 0x514b0304 || !expected || expected > MAX_TEXT || totalText + expected > MAX_TOTAL_TEXT) {
      throw new Error(INVALID_TEXT)
    }
    totalText += expected
    return inflateLyrics(file.slice(pointer + 4, end - 10), expected)
  }

  async function packed(start: number, length: number, kind: MediaKind): Promise<string | undefined> {
    if (!validRange(start, length)) return undefined
    const signature = new Uint8Array(await file.slice(start, start + Math.min(length, 12)).arrayBuffer())
    const format = mediaFormat(signature, kind)
    if (!format) return undefined
    const path = `legacy/${start}-${length}.${format.extension}`
    packedMedia.set(path, file.slice(start, start + length, format.mime))
    return path
  }

  async function readMedia(pointer: number, kind: MediaKind) {
    if (!validRange(pointer, 4)) return undefined
    const key = `${pointer}:${kind}`
    const cached = packedCache.get(key)
    if (cached) return cached
    const result = file.slice(pointer, pointer + 8).arrayBuffer().then(async (header) => {
      const prefix = new DataView(header)
      const size = prefix.getUint32(0, true)
      const direct = await packed(pointer + 4, size, kind)
      return direct ?? (kind === 'video' && header.byteLength === 8 && prefix.getUint32(4, true) === 0
        ? packed(pointer + 8, size, kind) : undefined)
    })
    packedCache.set(key, result)
    return result
  }

  async function presentationSlides(pointer: number, cueId: string, length: number) {
    const slides: EasyWorshipScheduleCue['slides'] = []
    if (!validRange(pointer, 52)) return slides
    const head = new Uint8Array(await file.slice(pointer, pointer + 52).arrayBuffer())
    if (textAt(head, 4, 16, page) !== '$ezwppstream$') return slides
    const view = new DataView(head.buffer)
    const count = view.getUint32(44, true)
    if (!count || count > 500 || count !== view.getUint32(48, true)) return slides
    const relative = view.getUint32(0, true) === 48
    const width = relative ? 16 : 20
    const end = relative && length ? pointer + length : file.size
    const tableEnd = pointer + 52 + count * width
    if (tableEnd > end || end > file.size) return slides
    const contents = new DataView(await file.slice(pointer + 52, tableEnd).arrayBuffer())
    for (let index = 0; index < count; index++) {
      const offset = contents.getUint32(index * width, true)
      const start = relative ? pointer + offset : offset
      const label = `Slide ${index + 1}`
      const slide: EasyWorshipScheduleCue['slides'][number] = {
        id: `${cueId}:${index}`, order: index, label, lines: [], assets: [], warnings: [],
      }
      const bytes = validRange(start, 5) && (!relative || (start >= tableEnd && start + 5 <= end))
        ? new DataView(await file.slice(start, start + 5).arrayBuffer()) : undefined
      const size = bytes?.getUint8(0) === 1 ? bytes.getUint32(1, true) : 0
      const image = size && start + 5 + size <= end ? await packed(start + 5, size, 'image') : undefined
      if (image) slide.assets.push({ kind: 'image', filename: label + '.jpg', archivePath: image, role: 'foreground' })
      else slide.warnings.push(`อ่านภาพของ ${label} ไม่สำเร็จ`)
      slides.push(slide)
    }
    return slides
  }

  async function embeddedPresentation(pointer: number, filename: string) {
    if (!validRange(pointer, 12)) return undefined
    const header = new DataView(await file.slice(pointer, pointer + 12).arrayBuffer())
    const size = header.getUint32(0, true)
    const offset = header.getUint32(4, true) === 0 ? 8 : 4
    const start = pointer + offset
    if (size < 4 || !validRange(start, size)) return undefined
    const zip = header.getUint32(offset, true) === 0x04034b50
    const legacy = isLegacyPowerPoint(filename)
    const compound = legacy && size >= 512 && hasPowerPointCompoundHeader(new Uint8Array(await file.slice(start, start + 8).arrayBuffer()))
    if (isPowerPointFilename(filename) && size <= maxPackedPowerPointBytes && (legacy ? compound : zip)) {
      const archivePath = `legacy/${start}-${size}.${legacy ? 'ppt' : 'pptx'}`
      packedMedia.set(archivePath, file.slice(start, start + size,
        legacy ? 'application/vnd.ms-powerpoint' : powerPointOpenXmlMime))
      return { preview: start + size, archivePath }
    }
    return { preview: start + size }
  }

  const { paths: externalMediaLocations, locate } = recordEasyWorshipExternalMediaLocations()
  function sourceLocation(original: string) {
    const id = locate(original)
    return id ? { easyWorshipSourceLocationId: id } : {}
  }
  const cues: EasyWorshipScheduleCue[] = []
  for (let index = 0; index < count; index++) {
    const row = data.subarray(index * width, (index + 1) * width)
    const view = new DataView(row.buffer, row.byteOffset, row.byteLength)
    const text = (offset: number, length: number) => textAt(row, offset, length, page)
    const uint32At = (offset: number) => offset + 4 <= row.length ? view.getUint32(offset, true) : 0
    const id = String(index + 1)
    const type = uint32At(820)
    const title = text(0, 50)
    const resource = text(51, 255)
    const author = text(307, 50)
    const pointer = uint32At(800)
    const mediaPointer = uint32At(1496)
    const kind = type === 1 ? 'song' : type === 2 ? 'scripture' : type === 3 ? 'presentation'
      : type === 4 ? 'video' : type === 5 ? 'camera' : type === 7 ? 'image' : type === 8 ? 'audio' : type === 9 ? 'web' : 'unknown'
    const label = title ?? (kind === 'scripture' ? author : resource && baseName(resource)) ?? `รายการ ${id}`
    const scripturePassage = kind === 'scripture' ? author ?? label : undefined
    const warnings: string[] = []
    let slides: EasyWorshipScheduleCue['slides'] = []
    let presentationPreview = false
    const addSlide = (label: string, lines: string[] = [], assets: EasyWorshipScheduleAsset[] = [], design?: SlideDesign) => {
      const order = slides.length
      slides.push({ id: `${id}:${order}`, order, label, lines, assets, design, warnings: [] })
    }
    async function media(kind: MediaKind, name: string, offset: number, role: 'background' | 'foreground') {
      const fileName = baseName(name) || label
      const stored = await readMedia(offset, kind)
      if (!stored) warnings.push(`ไม่พบไฟล์ ${fileName} ที่เล่นได้ใน .ews`)
      return { kind, filename: fileName, archivePath: stored, role, ...sourceLocation(name) }
    }

    if (kind === 'song' || kind === 'scripture') {
      try {
        const lyrics = readEasyWorshipLegacySections(await readText(pointer), page)
        const customBackground = row[511] !== 1 ? text(536, 255) : null
        const backgroundType = uint32At(512)
        const background: EasyWorshipScheduleAsset | undefined = customBackground
          ? backgroundType === 5 ? { kind: 'camera', filename: customBackground, role: 'background' }
            : (backgroundType === 2 || backgroundType === 3 || backgroundType === 4)
              ? await media(backgroundType === 4 ? 'video' : 'image', customBackground, mediaPointer, 'background') : undefined
          : undefined
        const fill = backgroundFill(row, backgroundType)
        for (const section of lyrics) {
          addSlide(scripturePassage ?? section.label, section.lines, background ? [background] : [],
            fill ? coloredSlide(fill, row, section.lines, kind === 'scripture', section.lyricRuns) : undefined)
          if (!fill && section.lyricRuns) slides[slides.length - 1].lyricRuns = section.lyricRuns
        }
      } catch {
        warnings.push(INVALID_TEXT)
      }
    } else if (kind === 'presentation') {
      const name = baseName(resource ?? title ?? '')
      const embedded = (mediaPointer && mediaPointer !== pointer ? await embeddedPresentation(mediaPointer, name) : undefined)
        ?? await embeddedPresentation(pointer, name)
      const length = uint32At(840)
      slides = await presentationSlides(embedded?.preview ?? pointer, id, length)
      if (embedded && !slides.length && embedded.preview !== pointer) slides = await presentationSlides(pointer, id, length)
      const attachment: EasyWorshipScheduleAsset | undefined = name && isPowerPointFilename(name)
        ? { kind: 'powerpoint', filename: name, role: 'foreground', ...sourceLocation(resource ?? ''),
          ...(embedded?.archivePath ? { archivePath: embedded.archivePath } : {}) }
        : undefined
      if (slides.some((slide) => slide.assets.length)) {
        presentationPreview = true
        warnings.push('แสดงภาพสไลด์ที่บันทึกมากับตาราง')
        if (attachment) slides[0].assets.push(attachment)
      } else if (attachment) {
        slides = []
        addSlide(label, [], [attachment])
      } else {
        warnings.push('ไม่พบภาพสไลด์หรือไฟล์ PowerPoint ที่อ้างอิง')
      }
    } else if (kind === 'image' || kind === 'video' || kind === 'audio') {
      addSlide(label, [], [await media(kind, resource ?? label, mediaPointer || pointer, 'foreground')])
    } else if (kind === 'camera') {
      addSlide(label, [], [{ kind: 'camera', filename: resource ?? label, role: 'foreground' }])
    } else if (kind === 'web') {
      const url = presentationWebUrl(resource ?? undefined)
      if (url) addSlide(label, [], [{ kind: 'web', filename: url, url, role: 'foreground' }])
      else warnings.push('ที่อยู่เว็บนี้ใช้ไม่ได้ กรุณาใช้ URL แบบ HTTPS หรือ HTTP')
    } else {
      warnings.push(`ชนิดกำหนดการ EasyWorship ${type} ยังไม่รองรับ`)
    }
    if (slides.length === 0) warnings.push('กำหนดการนี้ไม่มีสไลด์ที่อ่านได้')
    for (const message of warnings) unsupported.push({ cueId: id, message })
    cues.push({
      id, order: index, kind, label, slides, warnings,
      metadata: {
        presentationUid: null, type,
        author, copyright: text(358, 100), administrator: text(459, 50),
        referenceNumber: text(1410, 10), notes: text(1155, 160), groupLevel: null,
        ...(scripturePassage ? { scripturePassage, abbreviation: text(358, 100) } : {}),
        ...(presentationPreview ? { presentationPreview } : {}),
      },
    })
  }
  const hasCamera = cues.some((cue) => cue.slides.some((slide) => slide.assets.some((asset) => asset.kind === 'camera')))
  const importId = await importBlobIdentity([hasCamera ? 'easyworship-legacy-schedule-with-feeds' : 'easyworship-legacy-schedule', page], file)
  return { source: { filename: file.name, version, importId }, cues, unsupported, packedMedia,
    ...(externalMediaLocations.size ? { externalMediaLocations } : {}) }
}
