/** Reads and saves editable and rendered PowerPoint slides from local files. */

import type { DesignInput } from '../hooks/useSlideDesigns'
import type { DesignContent, DesignSlide, SlideDesign } from '../types/slideDesign'
import { importBlobIdentity, importIdentity } from './importIdentity'
import type { EasyWorshipPowerPointEntry } from './easyWorshipDesigns'
import { libraryMediaMime, mediaLibraryAssetId } from './mediaLibrary'
import { hasPowerPointCompoundHeader, isLegacyPowerPoint, maxPackedPowerPointBytes, modernPowerPointName,
  powerPointFilename, powerPointOpenXmlMime } from './powerPointFilename'
import { storeSlideDesignAssets } from './slideDesignAssets'
import { powerPointBuildNotice, powerPointLayoutKey, powerPointRenderedNotice, withoutPowerPointTableLayers } from './powerPoint/layoutReplacement'
import { openPowerPointPackage } from './powerPoint/package'
import { parsePowerPointSlides, type PowerPointSlideInput } from './powerPoint/slides'
import { isPowerPointVideoLayer } from './powerPoint/embeddedMedia'
import { powerPointOnlineVideoUrl } from './powerPoint/onlineVideo'
import { readPowerPointNotes } from './powerPoint/notes'
import { createPowerPointMediaResolver, linkedPowerPointMediaNotice, linkedPowerPointMediaPrefix, powerPointFileLink, powerPointOnlineVideoNotice,
  type PowerPointMediaLinkResolver } from './powerPoint/linkedMedia'

export type PowerPointDeck = {
  file: File
  title: string
  content: DesignContent & { source: NonNullable<DesignContent['source']> & { format: 'powerpoint' } }
  renderedImages?: Map<string, Blob>
  linkedFiles?: Map<string, Blob>
  unresolvedMedia?: string[]
}

declare global {
  interface Window {
    worshipPowerPoint?: {
      convertLegacy: (bytes: Uint8Array) => Promise<Uint8Array<ArrayBuffer>>
      renderPdf?: (bytes: Uint8Array, legacy: boolean) => Promise<Uint8Array<ArrayBuffer>>
    }
  }
}

function converterError(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': Error:\s*/, '') : fallback
}

async function powerPointPackageFile(file: File): Promise<File> {
  if (!isLegacyPowerPoint(file.name)) return file
  const converter = typeof window !== 'undefined' && window.worshipPowerPoint
  if (!converter) throw new Error('เปิดไฟล์ .ppt ใน WorshipTeam Desktop ที่ติดตั้ง LibreOffice Impress หรือแนบไฟล์ .pptx ที่แปลงแล้ว')
  if (file.size < 512 || file.size > maxPackedPowerPointBytes || !hasPowerPointCompoundHeader(new Uint8Array(await file.slice(0, 8).arrayBuffer()))) {
    throw new Error('ไฟล์นี้ไม่ใช่ PowerPoint .ppt ที่อ่านได้ หรือมีขนาดเกิน 128 MB')
  }
  const bytes = await converter.convertLegacy(new Uint8Array(await file.arrayBuffer())).catch((cause: unknown) => {
    throw new Error(converterError(cause, 'แปลง PowerPoint .ppt ไม่สำเร็จ'))
  })
  return new File([bytes], modernPowerPointName(file.name), { type: powerPointOpenXmlMime })
}

type ReadPowerPointAsset = Awaited<ReturnType<typeof openPowerPointPackage>>['readAsset']

function powerPointLayoutIdentity(readAsset: ReadPowerPointAsset) {
  const assetIds = new Map<string, Promise<string | undefined>>()
  return async (design: SlideDesign) => {
    const layers = await Promise.all(design.layers.map(async (layer) => {
      if (layer.kind !== 'media' || !layer.asset.sourcePath) return layer
      const { sourcePath, ...asset } = layer.asset
      let identity = assetIds.get(sourcePath)
      if (!identity) {
        identity = readAsset(sourcePath).then((file) => file && mediaLibraryAssetId(new Blob([new Uint8Array(file.bytes)], { type: file.mime })))
          .catch(() => undefined)
        assetIds.set(sourcePath, identity)
      }
      const libraryId = await identity
      return libraryId ? { ...layer, asset: { ...asset, libraryId } } : layer
    }))
    const { powerPointBuild: _build, ...layout } = design
    return powerPointLayoutKey({ ...layout, layers })
  }
}

async function restoreSlideGraphics(file: File, slides: DesignSlide[], visualWarnings: Map<number, Set<string>>, warnings: Set<string>,
  editableLayoutId: (design: SlideDesign) => Promise<string>, layoutsBeforeMedia: ReadonlyMap<number, SlideDesign>) {
  if (!visualWarnings.size) return undefined
  const converter = typeof window !== 'undefined' && window.worshipPowerPoint?.renderPdf
  if (converter && file.size <= maxPackedPowerPointBytes) {
    try {
      const pdf = await converter(new Uint8Array(await file.arrayBuffer()), isLegacyPowerPoint(file.name))
      const { renderPowerPointSlides } = await import('./powerPoint/rendered')
      const images = await renderPowerPointSlides(pdf, slides, visualWarnings.keys())
      const renderedImages = new Map<string, Blob>()
      const replacements = new Map<number, DesignSlide>()
      for (const [index, image] of images) {
        const slide = slides[index]
        const { powerPointBuild, powerPointTablesImported: _tables, ...editableDesign } = slide.design
        const filename = `slide-${index + 1}.png`
        const sourcePath = `/rendered-powerpoint/${filename}`
        const background = slide.design.layers.find((layer) => layer.kind === 'fill' && layer.id === `${slide.id}:background`)
        const powerPointLayoutBeforeRendering = await editableLayoutId(layoutsBeforeMedia.get(index) ?? editableDesign)
        const videoLayers = slide.design.layers.filter(isPowerPointVideoLayer)
        const playableIds = new Set([...videoLayers.map((layer) => layer.id), ...slide.design.soundtracks?.flatMap((track) => track.powerPointMediaId ?? []) ?? []])
        const mediaBuild = powerPointBuild?.map((step) => step.filter(({ layerId }) => playableIds.has(layerId))).filter((step) => step.length)
        if (powerPointBuild?.some((step) => step.some(({ layerId }) => !playableIds.has(layerId)))) {
          warnings.add(`สไลด์ ${index + 1} ใช้ภาพนิ่ง จึงแสดงองค์ประกอบพร้อมกัน`)
        }
        replacements.set(index, { ...slide, design: { ...editableDesign, powerPointLayoutBeforeRendering,
          ...(mediaBuild?.length ? { powerPointBuild: mediaBuild } : {}), layers: [
          ...(background?.kind === 'fill' ? [{ ...background, role: 'background' as const }] : []),
          {
            id: `${slide.id}:rendered`, kind: 'media', role: 'foreground', frame: { x: 0, y: 0, width: 1, height: 1 },
            fit: 'fill', asset: { kind: 'image', filename, sourcePath },
          },
          ...videoLayers,
        ] } })
        renderedImages.set(sourcePath, image)
      }
      for (const [index, slide] of replacements) slides[index] = slide
      warnings.add(powerPointRenderedNotice([...images.keys()].map((index) => index + 1)))
      return renderedImages
    } catch (cause) {
      warnings.add(converterError(cause, 'สร้างภาพสไลด์ PowerPoint ไม่สำเร็จ'))
    }
  }
  for (const reasons of visualWarnings.values()) for (const warning of reasons) warnings.add(warning)
  return undefined
}

function xmlText(bytes: Uint8Array): string {
  const isUtf16BE = bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0 && bytes[1] === 0x3c
  const isUtf16LE = bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x3c && bytes[1] === 0
  return new TextDecoder(isUtf16BE ? 'utf-16be' : isUtf16LE ? 'utf-16le' : 'utf-8').decode(bytes)
}

export async function reviewPowerPoint(file: File, title?: string, resolveMedia = createPowerPointMediaResolver([])): Promise<PowerPointDeck> {
  const packageFile = await powerPointPackageFile(file)
  const pkg = await openPowerPointPackage(packageFile)
  try {
    const xml = new Map<string, Promise<string>>()
    const part = (path: string) => {
      let loaded = xml.get(path)
      if (!loaded) {
        loaded = pkg.getPart(path).then(xmlText)
        xml.set(path, loaded)
      }
      return loaded
    }
    const related = async (path: string | undefined, type: string) => path
      ? (await pkg.getRelationships(path)).find((relationship) => relationship.type.endsWith('/' + type) && relationship.targetPath)?.targetPath
      : undefined

    const slideWarnings = new Set<string>()
    const linkedFiles = new Map<string, Blob>()
    const linkedMediaProblems = new Map<string, Map<string, string>>()
    const onlineVideos = new Map<string, Map<string, string>>()
    const mediaMaps = new Map<string, Promise<Record<string, string>>>()
    function mediaRelations(path?: string): Promise<Record<string, string>> | undefined {
      if (!path) return undefined
      let checked = mediaMaps.get(path)
      if (!checked) {
        checked = pkg.getRelationships(path).then(async (relationships) => {
          const assets: [string, string][] = []
          for (const relationship of relationships) {
            const image = relationship.type.endsWith('/image')
            if (!image && !/\/(?:audio|video|media)$/.test(relationship.type)) continue
            const target = relationship.targetPath
            const mime = target && libraryMediaMime(target)
            if (!target || !mime || (image !== mime.startsWith('image/'))) {
              if (image) slideWarnings.add('มีภาพที่อ้างอิงภายนอกหรือรูปแบบภาพที่ยังไม่รองรับ')
              const external = !image && relationship.externalTarget
              if (external) {
                const onlineUrl = !relationship.type.endsWith('/audio') && powerPointOnlineVideoUrl(external)
                if (onlineUrl) {
                  const videos = onlineVideos.get(path) ?? new Map()
                  videos.set(relationship.id, onlineUrl)
                  onlineVideos.set(path, videos)
                  continue
                }
                const link = powerPointFileLink(external)
                const resolved = await resolveMedia(external)
                if (link && 'match' in resolved) {
                  const { hash, blob } = resolved.match
                  const reference = `${linkedPowerPointMediaPrefix}${hash}/${link.filename}`
                  linkedFiles.set(reference, blob)
                  assets.push([relationship.id, reference])
                } else if ('warning' in resolved) {
                  const problems = linkedMediaProblems.get(path) ?? new Map()
                  problems.set(relationship.id, resolved.warning)
                  linkedMediaProblems.set(path, problems)
                }
              }
              continue
            }
            assets.push([relationship.id, target])
          }
          return Object.fromEntries(assets)
        })
        mediaMaps.set(path, checked)
      }
      return checked
    }

    const inputs: PowerPointSlideInput[] = []
    for (const slide of pkg.slides) {
      const layout = await related(slide.partPath, 'slideLayout')
      const master = await related(layout, 'slideMaster')
      const theme = await related(master, 'theme')
      const notes = (await pkg.getRelationships(slide.partPath)).find((relation) => relation.type.endsWith('/notesSlide'))
      let speakerNotes: string | undefined
      if (notes) {
        try {
          if (!notes.targetPath) throw new Error('ไม่พบไฟล์โน้ตในงานนำเสนอ')
          const notesMaster = await related(notes.targetPath, 'notesMaster').catch(() => undefined)
          const masterXml = notesMaster && await part(notesMaster).catch(() => undefined)
          speakerNotes = readPowerPointNotes(await part(notes.targetPath), masterXml, isLegacyPowerPoint(file.name))
        } catch (cause) {
          slideWarnings.add(`อ่านโน้ตผู้บรรยายในสไลด์ ${slide.id} ไม่สำเร็จ · ${converterError(cause, 'ไฟล์โน้ต PowerPoint ใช้ไม่ได้')}`)
        }
      }
      inputs.push({
        path: slide.partPath,
        xml: await part(slide.partPath),
        relationships: await mediaRelations(slide.partPath),
        linkedMediaProblems: linkedMediaProblems.get(slide.partPath),
        onlineVideos: onlineVideos.get(slide.partPath),
        layoutXml: layout && await part(layout),
        layoutRelationships: await mediaRelations(layout),
        masterXml: master && await part(master),
        masterRelationships: await mediaRelations(master),
        themeXml: theme && await part(theme),
        speakerNotes,
      })
    }
    const tableStylesXml = pkg.tableStylesPath && await part(pkg.tableStylesPath).catch(() => undefined)
    const { slides, warnings, visualWarnings, layoutsBeforeMedia, unresolvedMedia } =
      parsePowerPointSlides(inputs, pkg.size.widthEmu, pkg.size.heightEmu, tableStylesXml)
    if (!slides.length) throw new Error('ไม่พบสไลด์ในไฟล์ PowerPoint')
    for (const warning of warnings) slideWarnings.add(warning)
    for (const problem of unresolvedMedia) slideWarnings.add(problem)
    const identifyLayout = powerPointLayoutIdentity(pkg.readAsset)
    const renderedImages = await restoreSlideGraphics(file, slides, visualWarnings, slideWarnings, identifyLayout, layoutsBeforeMedia)
    for (const [index, previous] of layoutsBeforeMedia) {
      slides[index].design.powerPointLayoutBeforeMedia = await identifyLayout(withoutPowerPointTableLayers(previous))
    }
    const builtSlides = slides.flatMap(({ design }, index) => design.powerPointBuild?.length ? [index + 1] : [])
    if (builtSlides.length) slideWarnings.add(powerPointBuildNotice(builtSlides))
    const onlineVideoCount = slides.reduce((total, { design }) => total
      + design.layers.filter((layer) => layer.kind === 'web' && layer.powerPointMedia).length, 0)
    const resolvedLinks = slides.reduce((total, { design }) => total + (design.powerPointResolvedMediaLinks?.length ?? 0), 0) - onlineVideoCount
    if (resolvedLinks) slideWarnings.add(linkedPowerPointMediaNotice(resolvedLinks))
    if (onlineVideoCount) slideWarnings.add(powerPointOnlineVideoNotice(onlineVideoCount))
    return {
      file: packageFile,
      title: title?.trim() || pkg.title || powerPointFilename(file.name).replace(/\.pptx?$/i, ''),
      renderedImages,
      ...(linkedFiles.size ? { linkedFiles } : {}),
      ...(unresolvedMedia.size ? { unresolvedMedia: [...unresolvedMedia] } : {}),
      content: {
        slides,
        ...(pkg.looping ? { looping: true } : {}),
        source: {
          format: 'powerpoint',
          uid: await importBlobIdentity([packageFile === file ? 'powerpoint-v1' : 'powerpoint-legacy-v1', file.size], file),
          ...(pkg.author ? { author: pkg.author } : {}),
          ...(pkg.description ? { description: pkg.description } : {}),
          collectionDetails: { filename: powerPointFilename(file.name) },
        },
        warnings: [...slideWarnings],
      },
    }
  } finally {
    await pkg.close()
  }
}

export async function reviewCatalogedPowerPoint(blob: Blob, entry: EasyWorshipPowerPointEntry, resolveMedia?: PowerPointMediaLinkResolver): Promise<PowerPointDeck> {
  const deck = await reviewPowerPoint(new File([blob], entry.filename), entry.title, resolveMedia)
  deck.content.source = {
    ...deck.content.source, catalogUid: entry.id,
    ...(entry.author ? { author: entry.author } : {}),
    ...(entry.copyright ? { copyright: entry.copyright } : {}),
    ...(entry.description ? { description: entry.description } : {}),
    collectionDetails: { ...entry.collectionDetails, filename: entry.collectionDetails?.filename ?? entry.filename },
  }
  return deck
}

export async function savePowerPointContent(deck: PowerPointDeck): Promise<DesignContent> {
  const pkg = await openPowerPointPackage(deck.file)
  try {
    return await storeSlideDesignAssets(deck.content, async (path) => {
      const linked = deck.linkedFiles?.get(path)
      if (linked) return linked
      const rendered = deck.renderedImages?.get(path)
      if (rendered) return rendered
      const asset = await pkg.readAsset(path)
      if (!asset) throw new Error('ไม่พบสื่อภายในไฟล์ PowerPoint')
      return new Blob([new Uint8Array(asset.bytes)], { type: asset.mime })
    })
  } finally {
    await pkg.close()
  }
}

export async function savePowerPointDesign(deck: PowerPointDeck): Promise<DesignInput> {
  return {
    id: await importIdentity(['powerpoint-library-v1', deck.content.source.uid, deck.title]),
    kind: 'presentation',
    title: deck.title,
    content: await savePowerPointContent(deck),
  }
}
