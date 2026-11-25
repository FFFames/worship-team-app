/** Converts selected legacy schedule video in a private temporary directory. */
const { execFile } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { mkdtemp, open, rm, stat } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')

const exec = promisify(execFile)
const formats = new Set(['wmv', 'avi', 'mpg', 'mpeg'])
const chunkSize = 4 * 1024 ** 2
const maxBytes = 4 * 1024 ** 3
const fallback = 'แปลงวิดีโอรุ่นเก่าไม่สำเร็จ กรุณาตรวจไฟล์ต้นฉบับ'

async function convertLegacyVideo(input, output, signal, ffmpeg = process.env.WORSHIP_VIDEO_FFMPEG || process.env.WORSHIP_DVD_FFMPEG || 'ffmpeg') {
  const options = { windowsHide: true, maxBuffer: 128 * 1024, signal, killSignal: 'SIGKILL' }
  try {
    const { stdout } = await exec(ffmpeg, ['-hide_banner', '-encoders'], { ...options, timeout: 15_000 })
    const encode = /^\s*V\S*\s+libx264\s/m.test(stdout) ? ['libx264', '-preset', 'veryfast', '-crf', '20']
      : /^\s*V\S*\s+h264_videotoolbox\s/m.test(stdout) ? ['h264_videotoolbox', '-b:v', '2800k', '-allow_sw', '1'] : undefined
    if (!encode) throw new Error('ไม่พบตัวเข้ารหัส H.264 ใน FFmpeg')
    await exec(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-xerror', '-abort_on', 'empty_output', '-max_alloc', String(256 * 1024 ** 2),
      '-protocol_whitelist', 'file', '-format_whitelist', 'asf,avi,mpeg,mpegvideo,mpegts',
      '-threads', '4', '-i', input, '-map', '0:V:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1',
      '-vf', 'yadif=deint=interlaced,pad=ceil(iw/2)*2:ceil(ih/2)*2',
      '-pix_fmt', 'yuv420p', '-c:v', ...encode, '-threads', '4', '-c:a', 'aac', '-ac', '2', '-b:a', '160k',
      '-movflags', '+faststart', '-fs', String(maxBytes), '-f', 'mp4', output,
    ], { ...options, timeout: 30 * 60_000 })
  } catch (error) {
    if (signal.aborted) throw new Error('ยกเลิกการแปลงวิดีโอแล้ว')
    if (error.code === 'ENOENT') throw new Error('ไม่พบ FFmpeg สำหรับแปลงวิดีโอรุ่นเก่า')
    if (error.message === 'ไม่พบตัวเข้ารหัส H.264 ใน FFmpeg') throw error
    if (error.killed) throw new Error('แปลงวิดีโอใช้เวลานานเกินไป')
    throw new Error(fallback)
  }
  const { size } = await stat(output)
  if (!size || size >= maxBytes) throw new Error('ไฟล์ MP4 ที่แปลงได้ว่างหรือใหญ่เกิน 4 GB')
  return size
}

function registerLegacyVideo({ ipcMain, allowed }) {
  let job
  const invalid = () => new Error('งานแปลงวิดีโอไม่พร้อมใช้งาน')
  function perform(current, operation) {
    if (current.pending || current.closing) throw invalid()
    clearTimeout(current.timer)
    const pending = Promise.resolve().then(operation)
    current.pending = pending
    return pending.finally(() => {
      current.pending = undefined
      if (!current.closing) {
        current.timer = setTimeout(() => { void dispose(current).catch(() => {}) }, 120_000)
        current.timer.unref()
      }
    })
  }
  function dispose(current) {
    if (!current || current.closing) return current?.closing
    current.controller.abort()
    clearTimeout(current.timer)
    current.closing = (async () => {
      await current.pending?.catch(() => {})
      await current.input?.close().catch(() => {})
      await current.output?.close().catch(() => {})
      if (current.directory) await rm(current.directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 })
    })().finally(() => { if (job === current) job = undefined })
    return current.closing
  }
  function requireJob(event, id) {
    if (!allowed(event) || !job || job.id !== id || job.closing) throw invalid()
    return job
  }
  ipcMain.handle('legacy-video:open', async (event, extension, size) => {
    if (!allowed(event) || job || !formats.has(extension) || !Number.isSafeInteger(size) || size < 1 || size > maxBytes) throw invalid()
    const current = { id: randomUUID(), controller: new AbortController(), size, offset: 0 }
    job = current
    try {
      return await perform(current, async () => {
        current.directory = await mkdtemp(path.join(tmpdir(), 'worshipteam-video-'))
        current.inputPath = path.join(current.directory, `source.${extension}`)
        current.outputPath = path.join(current.directory, 'converted.mp4')
        current.input = await open(current.inputPath, 'wx', 0o600)
        current.controller.signal.throwIfAborted()
        return current.id
      })
    } catch (cause) {
      await dispose(current)
      throw cause
    }
  })
  ipcMain.handle('legacy-video:write', (event, id, offset, bytes) => {
    const current = requireJob(event, id)
    if (!current.input || !(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > chunkSize
      || offset !== current.offset || offset + bytes.byteLength > current.size) throw invalid()
    return perform(current, async () => {
      let cursor = 0
      while (cursor < bytes.byteLength) {
        const { bytesWritten } = await current.input.write(bytes, cursor, bytes.byteLength - cursor, offset + cursor)
        if (!bytesWritten) throw invalid()
        cursor += bytesWritten
      }
      current.offset += cursor
    })
  })
  ipcMain.handle('legacy-video:convert', (event, id) => {
    const current = requireJob(event, id)
    if (!current.input || current.offset !== current.size) throw invalid()
    return perform(current, async () => {
      await current.input.close()
      current.input = undefined
      const signal = current.controller.signal
      current.outputSize = await convertLegacyVideo(current.inputPath, current.outputPath, signal)
      signal.throwIfAborted()
      current.output = await open(current.outputPath, 'r')
      return current.outputSize
    })
  })
  ipcMain.handle('legacy-video:read', (event, id, offset) => {
    const current = requireJob(event, id)
    if (!current.output || !Number.isSafeInteger(offset) || offset < 0 || offset >= current.outputSize) throw invalid()
    return perform(current, async () => {
      const bytes = new Uint8Array(Math.min(chunkSize, current.outputSize - offset))
      const { bytesRead } = await current.output.read(bytes, 0, bytes.byteLength, offset)
      if (!bytesRead) throw invalid()
      return bytes.buffer.slice(0, bytesRead)
    })
  })
  ipcMain.handle('legacy-video:release', (event, id) => {
    if (allowed(event) && job?.id === id) return dispose(job)
  })
  return { close: () => job && dispose(job).catch(() => {}) }
}

module.exports = { convertLegacyVideo, registerLegacyVideo }
