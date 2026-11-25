/** Restores packed or explicitly supplied PowerPoint files referenced by an EasyWorship schedule. */

import type { FileEntry } from '@zip.js/zip.js'
import type { PlaylistCue, PlaylistCueAsset } from '../types/database'
import type { DesignContent } from '../types/slideDesign'
import { importIdentity } from './importIdentity'
import { reviewPowerPoint, savePowerPointContent, type PowerPointDeck } from './powerPoint'
import { isLegacyPowerPoint, isPowerPointFilename, maxPackedPowerPointBytes, modernPowerPointName,
  powerPointFilename } from './powerPointFilename'
import { designTextLines } from './slideDesign'
import { mapScheduleImportIds, type ScheduleImportIds } from './easyWorshipScheduleCues'
import { schedulePowerPointRecovery } from './easyWorshipPowerPointRecovery'
import { createEasyWorshipMediaHashFinder, mediaFileHash } from './easyWorshipMedia'
import { hasPowerPointSlideUpdate } from './powerPoint/layoutReplacement'
import { createPowerPointMediaResolver, suppliedPowerPointMedia, type PowerPointMediaCandidate } from './powerPoint/linkedMedia'
import { scheduleMediaAssets } from './scheduleMedia'
import { matchSuppliedEasyWorshipExternalMedia, suppliedEasyWorshipMediaLocation } from './easyWorshipExternalMedia'

export type SchedulePowerPointAttachment = PlaylistCueAsset & { kind: 'powerpoint' }
type Preview = {
  cues: PlaylistCue[]
  decks: Map<string, PowerPointDeck>
  attachmentKeys: ReadonlyMap<SchedulePowerPointAttachment, string>
  repairableDecks: Set<string>
  unresolved: Map<string, string>
}

function isAttachment(asset: PlaylistCueAsset): asset is SchedulePowerPointAttachment {
  return asset.kind === 'powerpoint' && isPowerPointFilename(asset.filename)
}

function baseAttachmentKey(asset: SchedulePowerPointAttachment): string {
  return asset.archivePath ?? powerPointFilename(asset.filename).toLowerCase()
}

function deckVersion(asset: SchedulePowerPointAttachment) {
  return asset.easyWorshipFileHash ?? (asset.easyWorshipSourceLocationId ? `path:${asset.easyWorshipSourceLocationId}` : undefined)
}

function scheduleAttachmentKeys(cues: PlaylistCue[]) {
  const assets = cues.flatMap((cue) => cue.slides.flatMap(({ assets }) => (assets ?? []).filter(isAttachment)))
  const versions = new Map<string, Set<string | undefined>>()
  for (const asset of assets) {
    const base = baseAttachmentKey(asset)
    const known = versions.get(base) ?? new Set<string | undefined>()
    known.add(deckVersion(asset))
    versions.set(base, known)
  }
  const keys = new Map<SchedulePowerPointAttachment, string>()
  for (const asset of assets) {
    const base = baseAttachmentKey(asset)
    const version = deckVersion(asset)
    // Keep the original import identity unless the same address refers to different source decks.
    keys.set(asset, (versions.get(base)?.size ?? 0) > 1 ? `${base}\0${version ?? 'unverified'}` : base)
  }
  return keys
}

function safePath(value: string): string | undefined {
  const path = value.replace(/\\/g, '/')
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || path.includes('\0')
    || path.split('/').some((part) => !part || part === '.' || part === '..')) return undefined
  return path
}

function projectPowerPointCues(cues: PlaylistCue[], decks: Map<string, DesignContent>,
  { unresolved, attachmentKeys }: Pick<Preview, 'unresolved' | 'attachmentKeys'>): PlaylistCue[] {
  const attachmentKey = (asset: SchedulePowerPointAttachment) => attachmentKeys.get(asset) ?? baseAttachmentKey(asset)
  return cues.map((cue) => {
    const attachments = cue.slides.flatMap((slide) => (slide.assets ?? []).filter(isAttachment))
    if (!attachments.length) return cue

    const stills = cue.metadata?.presentationPreview === true
    if (stills && !attachments.some((asset) => decks.has(attachmentKey(asset)))) return cue
    const onlyPowerPoint = stills || cue.slides.every((slide) => !slide.lines.some((line) => line.trim())
      && !(slide.assets ?? []).some((asset) => !isAttachment(asset))
      && !slide.design?.layers.some((layer) => layer.kind === 'text' && layer.text.trim() || layer.kind === 'media'))
    const kind = onlyPowerPoint && cue.kind !== 'song' && cue.kind !== 'scripture' ? 'powerpoint' : cue.kind
    const warnings = new Set(cue.warnings)
    if (stills) warnings.delete('แสดงภาพสไลด์ที่บันทึกมากับตาราง')
    if (kind === 'powerpoint' && cue.kind === 'unknown') {
      for (const warning of warnings) {
        if (warning.startsWith('ชนิดกำหนดการ EasyWorship ')) warnings.delete(warning)
      }
    }
    const expanded = new Set<string>()
    const slides: PlaylistCue['slides'] = []
    for (const slide of cue.slides) {
      const references = (slide.assets ?? []).filter(isAttachment)
      const available = references.filter((asset) => decks.has(attachmentKey(asset)))
      if (!stills && (!available.length || !onlyPowerPoint || available.length < references.length)) slides.push(slide)

      for (const asset of references) {
        const key = attachmentKey(asset)
        const deck = decks.get(key)
        if (!deck) {
          warnings.add(unresolved.get(key) ?? `ไม่พบไฟล์ ${powerPointFilename(asset.filename)}`)
          continue
        }
        if (onlyPowerPoint && expanded.has(key)) continue
        expanded.add(key)
        for (const warning of deck.warnings ?? []) warnings.add(`${powerPointFilename(asset.filename)} · ${warning}`)
        warnings.delete(`ไม่พบไฟล์ ${asset.filename} ใน .ewsx`)
        for (const imported of deck.slides) {
          const slideSource = key === baseAttachmentKey(asset) ? asset.filename : `${asset.filename}:${asset.easyWorshipFileHash}`
          slides.push({
            label: imported.label,
            lines: designTextLines(imported.design),
            design: imported.design,
            ...(imported.speakerNotes !== undefined ? { speakerNotes: imported.speakerNotes } : {}),
            sourceId: `${slide.sourceId ?? slides.length}:${slideSource}:${imported.id}`,
            sourceOrder: slide.sourceOrder,
            ...(imported.advanceMs ? { advanceMs: imported.advanceMs } : {}),
            ...(imported.transition ? { transition: imported.transition } : {}),
          })
        }
      }
    }
    const attachment = attachmentKey(attachments[0])
    const sourceUid = kind === 'powerpoint' && onlyPowerPoint && attachments.every((asset) => attachmentKey(asset) === attachment)
      ? decks.get(attachment)?.source?.uid : undefined
    return {
      ...cue, kind, slides, warnings: [...warnings],
      ...(stills || sourceUid ? { metadata: { ...cue.metadata, ...(stills ? { presentationPreview: false } : {}),
        ...(sourceUid ? { powerPointImportKey: sourceUid } : {}) } } : {}),
    }
  })
}

export async function reviewSchedulePowerPoint(
  file: File,
  cues: PlaylistCue[],
  supplied: readonly File[],
  { resolveFromProfile, packedMedia, mediaCandidates = [], linkedFiles = [], externalMediaLocations }: {
    resolveFromProfile?: (asset: SchedulePowerPointAttachment, converted: boolean, requiresExact: boolean) => Promise<File | undefined>
    packedMedia?: ReadonlyMap<string, Blob>
    mediaCandidates?: readonly PowerPointMediaCandidate[]
    linkedFiles?: readonly File[]
    externalMediaLocations?: ReadonlyMap<string, string>
  } = {},
): Promise<Preview> {
  const decks = new Map<string, PowerPointDeck>()
  const repairableDecks = new Set<string>()
  const unresolved = new Map<string, string>()
  const attachmentKeys = scheduleAttachmentKeys(cues)
  const attachments = new Map([...attachmentKeys].map(([asset, key]) => [key, asset]))
  if (!attachments.size) return { cues, decks, attachmentKeys, repairableDecks, unresolved }
  const versionsByName = new Map<string, Set<string>>()
  for (const [key, asset] of attachments) {
    const name = powerPointFilename(asset.filename).toLowerCase()
    const versions = versionsByName.get(name) ?? new Set<string>()
    versions.add(deckVersion(asset) ?? key)
    versionsByName.set(name, versions)
  }
  const suppliedPowerPoints = supplied.filter((file) => file.size && isPowerPointFilename(file.name)
    && (!file.webkitRelativePath || suppliedEasyWorshipMediaLocation(file)))
  const matchLocation = matchSuppliedEasyWorshipExternalMedia(suppliedPowerPoints)
  const findByHash = createEasyWorshipMediaHashFinder<File>(mediaFileHash)
  async function suppliedDeck(asset: SchedulePowerPointAttachment, converted: boolean, requiresExact: boolean) {
    const name = (converted ? modernPowerPointName(asset.filename) : powerPointFilename(asset.filename)).toLowerCase()
    const named = suppliedPowerPoints.filter((file) => file.name.toLowerCase() === name)
    const hash = converted ? undefined : asset.easyWorshipFileHash
    if (hash) {
      const legacy = isLegacyPowerPoint(name)
      const alternatives = suppliedPowerPoints.filter((file) => isLegacyPowerPoint(file.name) === legacy)
      const likely = alternatives.filter((file) => !asset.easyWorshipFileSize || file.size === asset.easyWorshipFileSize)
      return await findByHash(hash, new Set([...named, ...likely])) ?? findByHash(hash, alternatives)
    }
    const location = asset.easyWorshipSourceLocationId && externalMediaLocations?.get(asset.easyWorshipSourceLocationId)
    const found = location ? matchLocation(converted ? location.replace(/\.ppt$/i, '.pptx') : location) : undefined
    if (requiresExact && !found) return undefined
    const candidates = found?.candidates ?? (asset.easyWorshipSourceLocationId ? named.filter((file) => !file.webkitRelativePath) : named)
    if (candidates.length > 1) throw new Error(`พบไฟล์แนบชื่อ ${name} มากกว่าหนึ่งไฟล์ที่ตรงกับตาราง`)
    const [candidate] = candidates
    if (candidate && !converted && asset.easyWorshipFileSize && asset.easyWorshipFileSize !== candidate.size) {
      throw new Error(`ขนาดไฟล์ ${name} ไม่ตรงกับตาราง EasyWorship`)
    }
    return candidate
  }

  const { BlobReader, BlobWriter, ZipReader } = await import('@zip.js/zip.js')
  const sources = [suppliedDeck, ...(resolveFromProfile ? [resolveFromProfile] : [])]
  const wanted = new Set([...attachments.values()].flatMap((asset) => asset.archivePath ? [asset.archivePath] : []))
  const mediaByPath = new Map<string, PlaylistCueAsset[]>()
  for (const asset of scheduleMediaAssets(cues)) {
    if (!asset.archivePath || (asset.kind !== 'audio' && asset.kind !== 'video')) continue
    const same = mediaByPath.get(asset.archivePath) ?? []
    same.push(asset)
    mediaByPath.set(asset.archivePath, same)
  }
  const reader = !packedMedia && (wanted.size || mediaByPath.size) ? new ZipReader(new BlobReader(file)) : undefined
  try {
    const entries = new Map<string, FileEntry | null>()
    if (reader) {
      for await (const entry of reader.getEntriesGenerator()) {
        if (entry.directory) continue
        const path = safePath(entry.filename)
        if (path && (wanted.has(path) || mediaByPath.has(path))) entries.set(path, entries.has(path) ? null : entry)
      }
    }
    const packedLinks: PowerPointMediaCandidate[] = []
    for (const [path, assets] of mediaByPath) {
      const part = entries.get(path)
      const blob = packedMedia?.get(path)
      if ((!part && !blob) || part?.encrypted || (part?.uncompressedSize ?? blob?.size ?? 0) > maxPackedPowerPointBytes) continue
      const hashes = new Set(assets.flatMap(({ easyWorshipFileHash }) => easyWorshipFileHash ?? []))
      if (hashes.size > 1) continue
      const [expectedHash] = hashes
      const names = new Set(assets.map(({ filename }) => powerPointFilename(filename)))
      let content: Promise<Blob> | undefined
      const readFile = () => content ??= blob ? Promise.resolve(blob) : part!.getData(new BlobWriter(), { checkSignature: true })
      for (const filename of names) packedLinks.push({ path: path.replace(/[^/]+$/, () => filename), filename, expectedHash, readFile })
    }
    const resolveMedia = createPowerPointMediaResolver([...suppliedPowerPointMedia(linkedFiles), ...mediaCandidates, ...packedLinks])

    for (const [key, asset] of attachments) {
      const name = powerPointFilename(asset.filename)
      const hash = asset.easyWorshipFileHash
      const legacy = isLegacyPowerPoint(name)
      const reusedName = (versionsByName.get(name.toLowerCase())?.size ?? 0) > 1
      const allowConverted = legacy && !reusedName
      const requiresExact = !hash && reusedName
      const packed = asset.archivePath ? entries.get(asset.archivePath) : undefined
      const embedded = asset.archivePath ? packedMedia?.get(asset.archivePath) : undefined
      let error = ''
      if ((packed || embedded) && (hash || key === baseAttachmentKey(asset))) {
        try {
          if (packed?.encrypted || (embedded?.size ?? packed?.uncompressedSize ?? 0) > maxPackedPowerPointBytes) {
            throw new Error('ไฟล์บรรจุมีรหัสผ่านหรือขนาดเกิน 128 MB')
          }
          const blob = embedded ?? await packed?.getData(new BlobWriter(), { checkSignature: true })
          if (blob) {
            if (hash && await mediaFileHash(blob) !== hash) throw new Error('เนื้อหา PowerPoint ที่บรรจุมาไม่ตรงกับข้อมูลในตาราง')
            const deck = await reviewPowerPoint(new File([blob], name), undefined, resolveMedia)
            decks.set(key, deck)
            if (legacy || deck.content.slides.some(hasPowerPointSlideUpdate)) repairableDecks.add(key)
            continue
          }
        } catch (cause) {
          error = cause instanceof Error ? cause.message : 'เปิดไฟล์ที่บรรจุมาไม่สำเร็จ'
        }
      }

      for (const converted of allowConverted ? [false, true] : [false]) {
        for (const findDeck of sources) {
          try {
            const copy = await findDeck(asset, converted, requiresExact)
            if (!copy) continue
            decks.set(key, await reviewPowerPoint(copy, undefined, resolveMedia))
            repairableDecks.add(key)
            break
          } catch (cause) {
            error = cause instanceof Error ? cause.message : 'เปิดไฟล์ที่แนบไม่สำเร็จ'
          }
        }
        if (decks.has(key)) break
      }
      if (!decks.has(key)) {
        if (!error && requiresExact) error = 'พบ PowerPoint ชื่อเดียวกันหลายฉบับ กรุณาแนบโฟลเดอร์ที่มีพาธเดิม'
        const remedy = legacy ? allowConverted ? 'แนบไฟล์ .ppt ต้นฉบับใน Desktop หรือ .pptx ที่แปลงแล้วและใช้ชื่อเดิม'
          : 'แนบไฟล์ .ppt ต้นฉบับที่มีข้อมูลตรงกับตาราง'
          : hash ? 'แนบไฟล์ .pptx ต้นฉบับที่มีข้อมูลตรงกับตาราง' : 'แนบไฟล์ .pptx ต้นฉบับเพื่อคืนสไลด์'
        unresolved.set(key, `${name} · ${error ? `${error} · ` : ''}${remedy}`)
      }
    }
  } finally {
    await reader?.close()
  }

  return {
    cues: projectPowerPointCues(cues, new Map([...decks].map(([key, deck]) => [key, deck.content])), { unresolved, attachmentKeys }),
    decks, attachmentKeys, repairableDecks,
    unresolved,
  }
}

function recoverablePowerPoint(cues: PlaylistCue[], restored: PlaylistCue[], ids: ScheduleImportIds,
  review: Preview, decks: ReadonlyMap<string, PowerPointDeck>) {
  const candidates = new Map<string, { asset: SchedulePowerPointAttachment; key: string }>()
  for (const cue of cues) {
    if (!cue.sourceId) continue
    const matches = new Map(cue.slides.flatMap((slide) => (slide.assets ?? []).filter(isAttachment))
      .map((asset) => [review.attachmentKeys.get(asset) ?? baseAttachmentKey(asset), asset]))
    if (matches.size !== 1) continue
    const [[key, asset]] = matches
    const deck = decks.get(key)
    if (deck) candidates.set(cue.sourceId, { asset, key: deck.content.source.uid })
  }
  return schedulePowerPointRecovery(ids, projectPowerPointCues(cues, new Map(), review), restored, candidates)
}

function repairableScheduleDecks(review: Preview, uids?: ReadonlySet<string>) {
  return new Map([...review.decks].filter(([key, deck]) => review.repairableDecks.has(key) && (!uids || uids.has(deck.content.source.uid))))
}

export function previewAppendedPowerPointRecovery(cues: PlaylistCue[], review: Preview, ids: ScheduleImportIds) {
  return recoverablePowerPoint(cues, review.cues, ids, review, repairableScheduleDecks(review))
}

export async function storeSchedulePowerPoint(cues: PlaylistCue[], review: Preview, ids: ScheduleImportIds, repairUids?: ReadonlySet<string>) {
  const decks = repairUids ? repairableScheduleDecks(review, repairUids) : review.decks
  if (!decks.size) return { cues: review.cues, ids, recovery: undefined }
  const stored = new Map<string, DesignContent>()
  const byContent = new Map<string, DesignContent>()
  for (const [key, deck] of decks) {
    const uid = deck.content.source.uid
    const content = byContent.get(uid) ?? await savePowerPointContent(deck)
    byContent.set(uid, content)
    stored.set(key, content)
  }
  const references = [...decks].map(([key, deck]) => [key, deck.content.source.uid]).sort()
  const restored = projectPowerPointCues(cues, stored, review)
  return {
    cues: restored,
    ids: await mapScheduleImportIds(ids, (id) => importIdentity(['easyworship-schedule-powerpoint-v1', id, references])),
    recovery: recoverablePowerPoint(cues, restored, ids, review, decks),
  }
}
