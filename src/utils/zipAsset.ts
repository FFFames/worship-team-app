/** Reads ZIP media without creating a second in-memory copy of stored files. */

import type { FileEntry } from '@zip.js/zip.js'

/** The consumer must finish reading or persisting the blob before its temporary file is removed. */
export type WithMediaBlob = <T>(path: string, consume: (blob: Blob) => Promise<T>) => Promise<T>

const largeEntryBytes = 64 * 1024 ** 2
const stored = (entry: FileEntry) => !entry.encrypted && entry.compressionMethod === 0
  && entry.compressedSize === entry.uncompressedSize

export async function readZipAsset(source: Blob, entry: FileEntry, mime?: string): Promise<Blob> {
  if (stored(entry)) {
    await entry.getData(new WritableStream(), { checkCrc32: true, checkOverlappingEntry: true })
    const offset = entry.localDirectory?.dataOffset
    if (offset === undefined) throw new Error('อ่านตำแหน่งไฟล์ในแพ็กเกจ EasyWorship ไม่ได้')
    return source.slice(offset, offset + entry.uncompressedSize, mime)
  }
  const { BlobWriter } = await import('@zip.js/zip.js')
  return entry.getData(new BlobWriter(mime), { checkCrc32: true })
}

/** Keeps an inflated large entry on disk until its caller finishes consuming it. */
export async function withZipAsset<T>(source: Blob, entry: FileEntry, consume: (blob: Blob) => Promise<T>, mime?: string): Promise<T> {
  if (stored(entry) || entry.uncompressedSize < largeEntryBytes || typeof navigator === 'undefined') {
    return consume(await readZipAsset(source, entry, mime))
  }
  const directory = await navigator.storage?.getDirectory?.().catch(() => undefined)
  if (!directory) return consume(await readZipAsset(source, entry, mime))

  const name = `worshipteam-import-${crypto.randomUUID()}`
  const handle = await directory.getFileHandle(name, { create: true })
  try {
    const disk = await handle.createWritable()
    try {
      await entry.getData(disk, { checkCrc32: true, preventClose: true })
      await disk.close()
    } catch (cause) {
      await disk.abort(cause).catch(() => {})
      throw cause
    }
    const file = await handle.getFile()
    return await consume(mime ? file.slice(0, file.size, mime) : file)
  } finally {
    await directory.removeEntry(name).catch(() => {})
  }
}
