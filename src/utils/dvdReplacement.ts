/** Maps a DVD reference to a playable video on this device. */

import type { DvdClip } from '../types/dvdClip'
import type { MediaClip, VideoAlphaMode } from '../types/media'
import type { DesignAsset, SlideDesign } from '../types/slideDesign'

export type DvdReplacement = { assetId: string; useMarks: boolean; alphaMode?: VideoAlphaMode; subtitle?: number | null }
type DvdAsset = { dvd?: DvdClip; libraryId?: string; archivePath?: string; clip?: MediaClip; alphaMode?: VideoAlphaMode }
const storageKey = (id: string) => 'worshipteam:dvd:' + id

export function dvdDesignAsset(dvd: DvdClip): DesignAsset {
  return { kind: 'video', filename: dvd.name, dvd }
}

export function assignableDvdClips(design?: SlideDesign, assets: readonly DvdAsset[] = []) {
  const references = [...assets, ...(design?.layers.flatMap((layer) => layer.kind === 'media' ? [layer.asset] : []) ?? [])]
  const clips = references.flatMap((asset) => asset.dvd && !asset.archivePath && !asset.libraryId ? [[asset.dvd.id, asset.dvd] as const] : [])
  return [...new Map(clips).values()]
}

export function readDvdReplacement(id: string): DvdReplacement | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(id)) ?? 'null')
    if (typeof saved?.assetId !== 'string' || !saved.assetId || typeof saved.useMarks !== 'boolean') return
    return { assetId: saved.assetId, useMarks: saved.useMarks,
      ...(saved.alphaMode === 'top-bottom' || saved.alphaMode === 'side-by-side' ? { alphaMode: saved.alphaMode } : {}),
      ...(saved.subtitle === null || (Number.isInteger(saved.subtitle) && saved.subtitle >= 1 && saved.subtitle <= 32)
        ? { subtitle: saved.subtitle } : {}) }
  } catch { return undefined }
}

export function saveDvdReplacement(id: string, replacement: DvdReplacement | undefined): void {
  if (replacement) localStorage.setItem(storageKey(id), JSON.stringify(replacement))
  else localStorage.removeItem(storageKey(id))
}

export function resolveDvdAsset<T extends DvdAsset>(asset: T): T & DvdAsset {
  if (!asset.dvd || asset.libraryId || asset.archivePath) return asset
  const source = readDvdReplacement(asset.dvd.id)
  return source ? { ...asset, libraryId: source.assetId, clip: source.useMarks ? asset.dvd.clip : undefined,
    alphaMode: source.alphaMode,
    ...(source.subtitle === undefined ? {} : { dvd: { ...asset.dvd, subtitleSelection: source.subtitle } }) } : asset
}
