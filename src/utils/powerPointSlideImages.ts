/** Builds a static deck from images exported by PowerPoint in slide order. */

import type { DesignInput } from '../hooks/useSlideDesigns'
import type { DesignSlide } from '../types/slideDesign'
import { importIdentity } from './importIdentity'
import { libraryMediaMime } from './mediaLibrary'
import { storeSlideDesignAssets } from './slideDesignAssets'

export function sortPowerPointSlideImages(files: File[]): File[] {
  return [...files].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
}

async function imageAspectRatio(file: File): Promise<number> {
  if (!libraryMediaMime(file.name)?.startsWith('image/')) throw new Error(`รูปแบบภาพ ${file.name} ยังไม่รองรับ`)
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (image.naturalWidth && image.naturalHeight) return image.naturalWidth / image.naturalHeight
    throw new Error('อ่านขนาดภาพไม่ได้')
  } catch {
    throw new Error(`เปิดภาพ ${file.name} ไม่สำเร็จ`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function savePowerPointSlideImages(files: File[], title: string): Promise<DesignInput> {
  const ordered = sortPowerPointSlideImages(files)
  const name = title.trim()
  if (!ordered.length || !name) throw new Error('ระบุชื่อและเลือกภาพสไลด์อย่างน้อยหนึ่งไฟล์')
  const slides: DesignSlide[] = []
  for (const [index, file] of ordered.entries()) {
    const sourcePath = String(index)
    slides.push({
      id: sourcePath,
      label: file.name.replace(/\.[a-z\d]+$/i, ''),
      design: {
        aspectRatio: await imageAspectRatio(file),
        layers: [{
          id: sourcePath + ':image', kind: 'media', fit: 'contain',
          frame: { x: 0, y: 0, width: 1, height: 1 },
          asset: { kind: 'image', filename: file.name, sourcePath },
        }],
      },
    })
  }
  const content = await storeSlideDesignAssets({ slides }, async (path) => ordered[Number(path)])
  const id = await importIdentity(['powerpoint-slide-images-v1', name, content])
  return { id, title: name, kind: 'presentation', content: { ...content, source: { format: 'powerpoint', uid: id } } }
}
