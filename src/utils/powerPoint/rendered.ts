/** Renders selected PowerPoint PDF pages into portable slide images. */

import { AnnotationMode, getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { DesignSlide } from '../../types/slideDesign'

const maxSlideEdge = 1920
const maxImageBytes = 128 * 1024 * 1024

export async function renderPowerPointSlides(pdf: Uint8Array<ArrayBuffer>, slides: readonly DesignSlide[], indexes: Iterable<number>) {
  GlobalWorkerOptions.workerSrc = workerUrl
  const loading = getDocument({ data: pdf, stopAtErrors: true, useWasm: false })
  const canvas = document.createElement('canvas')
  canvas.width = 0
  canvas.height = 0
  const images = new Map<number, Blob>()
  let totalBytes = 0
  try {
    const deck = await loading.promise
    if (deck.numPages !== slides.length) throw new Error('จำนวนภาพที่แปลงไม่ตรงกับจำนวนสไลด์ต้นฉบับ')
    for (const index of indexes) {
      const page = await deck.getPage(index + 1)
      const original = page.getViewport({ scale: 1 })
      const ratio = original.width / original.height
      if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio / slides[index].design.aspectRatio - 1) > 0.02) {
        throw new Error(`ขนาดภาพที่แปลงไม่ตรงกับสไลด์ ${index + 1}`)
      }
      const viewport = page.getViewport({ scale: maxSlideEdge / Math.max(original.width, original.height) })
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))
      await page.render({ canvas, viewport, annotationMode: AnnotationMode.DISABLE }).promise
      const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!image) throw new Error(`สร้างไฟล์ภาพสำหรับสไลด์ ${index + 1} ไม่สำเร็จ`)
      totalBytes += image.size
      if (totalBytes > maxImageBytes) throw new Error('ภาพสไลด์ PowerPoint ที่แปลงมีขนาดรวมเกิน 128 MB')
      images.set(index, image)
      page.cleanup()
    }
    return images
  } finally {
    canvas.width = 0
    canvas.height = 0
    await loading.destroy()
  }
}
