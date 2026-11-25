const chunkSize = 4 * 1024 ** 2
const mp4 = 'video/mp4'
export const legacyVideoMaxBytes = 4 * 1024 ** 3

declare global {
  interface Window {
    worshipLegacyVideo?: {
      open: (extension: string, size: number) => Promise<string>
      write: (id: string, offset: number, bytes: Uint8Array) => Promise<void>
      convert: (id: string) => Promise<number>
      read: (id: string, offset: number) => Promise<ArrayBuffer>
      release: (id: string) => Promise<void>
    }
  }
}

export function legacyVideoExtension(filename: string) {
  return /\.(wmv|avi|mpg|mpeg)$/i.exec(filename)?.[1].toLowerCase()
}

export function canConvertLegacyVideo() {
  return typeof window !== 'undefined' && Boolean(window.worshipLegacyVideo)
}

export const legacyVideoSourceMime = 'video/x-worshipteam-legacy'

export function legacyVideoInputMime(filename: string) {
  return canConvertLegacyVideo() && legacyVideoExtension(filename) ? legacyVideoSourceMime : undefined
}

/** A reader's converted files remain available until its caller commits the blobs. */
export function createLegacyVideoReader() {
  const converted = new Map<string, Promise<Blob>>()
  const files: { directory: FileSystemDirectoryHandle; name: string }[] = []
  async function convert(input: Blob, extension: string) {
    const desktop = typeof window !== 'undefined' && window.worshipLegacyVideo
    if (!desktop) throw new Error('ไฟล์วิดีโอนี้ต้องแปลงด้วย WorshipTeam Desktop')
    if (!input.size || input.size > legacyVideoMaxBytes) throw new Error('ไฟล์วิดีโอต้นฉบับว่างหรือใหญ่เกิน 4 GB')
    const id = await desktop.open(extension, input.size)
    try {
      for (let offset = 0; offset < input.size; offset += chunkSize) {
        const bytes = new Uint8Array(await input.slice(offset, offset + chunkSize).arrayBuffer())
        await desktop.write(id, offset, bytes)
      }
      const size = await desktop.convert(id)
      if (!Number.isSafeInteger(size) || size <= 0 || size > legacyVideoMaxBytes) throw new Error('ขนาด MP4 ที่แปลงได้ไม่ถูกต้อง')
      const directory = size > 1024 ** 2 ? await navigator.storage?.getDirectory?.().catch(() => undefined) : undefined
      const name = `worshipteam-video-${crypto.randomUUID()}`
      const handle = directory && await directory.getFileHandle(name, { create: true })
      if (directory && handle) files.push({ directory, name })
      const disk = await handle?.createWritable()
      const chunks: ArrayBuffer[] = []
      try {
        for (let offset = 0; offset < size;) {
          const bytes = await desktop.read(id, offset)
          if (!bytes.byteLength || offset + bytes.byteLength > size) throw new Error('อ่านไฟล์ MP4 ที่แปลงได้ไม่ครบ')
          if (disk) await disk.write(bytes)
          else chunks.push(bytes)
          offset += bytes.byteLength
        }
        await disk?.close()
      } catch (error) {
        await disk?.abort().catch(() => {})
        throw error
      }
      if (!handle) return new Blob(chunks, { type: mp4 })
      const file = await handle.getFile()
      return file.slice(0, file.size, mp4)
    } finally {
      await desktop.release(id).catch(() => {})
    }
  }
  return {
    read(key: string, extension: string, load: () => Promise<Blob>) {
      let result = converted.get(key)
      if (!result) {
        result = load().then((input) => convert(input, extension))
        converted.set(key, result)
      }
      return result
    },
    async close() {
      await Promise.all(files.map(({ directory, name }) => directory.removeEntry(name).catch(() => {})))
    },
  }
}
