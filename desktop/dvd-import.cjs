/** Reads a selected DVD-Video chapter into browser-compatible video. */

const { execFile, spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { mkdtemp, open, readdir, rm, stat } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')
const { readDvdTitleTable } = require('./dvd-title-table.cjs')

const exec = promisify(execFile)
const maxBytes = 1024 ** 3
const chunkBytes = 4 * 1024 ** 2
const importErrors = new Set(['settings', 'folder', 'catalog', 'disc', 'ffmpeg', 'demuxer', 'encoder', 'track', 'subtitleTrack', 'subtitleSupport', 'convert', 'size'])
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

function dvdSelection(settings) {
  if (!settings || !integer(settings.title, 1, 99) || !integer(settings.chapter, 1, 99)
    || (settings.lastChapter !== undefined && !integer(settings.lastChapter, settings.chapter, 99))
    || !integer(settings.angle, 1, 9)
    || (settings.audio !== undefined && !integer(settings.audio, 1, 8))
    || (settings.subtitle !== undefined && !integer(settings.subtitle, 1, 32))) return undefined
  return { title: settings.title, chapter: settings.chapter, lastChapter: settings.lastChapter, angle: settings.angle,
    audio: settings.audio, ...(settings.subtitle === undefined ? {} : { subtitle: settings.subtitle }) }
}

async function dvdVolume(selected) {
  const root = path.basename(selected).toUpperCase() === 'VIDEO_TS' ? path.dirname(selected) : selected
  const entries = await readdir(root)
  const directory = entries.find((entry) => entry.toUpperCase() === 'VIDEO_TS')
  if (!directory) throw new Error('folder')
  const folder = path.join(root, directory)
  const files = await readdir(folder)
  const manager = files.find((entry) => entry.toUpperCase() === 'VIDEO_TS.IFO')
  if (!manager || !(await stat(path.join(folder, manager))).isFile()) throw new Error('folder')
  return { root, manager: path.join(folder, manager) }
}

async function findEncoder(ffmpeg, signal) {
  try {
    const demuxers = await exec(ffmpeg, ['-hide_banner', '-demuxers'], { signal, timeout: 15_000, windowsHide: true })
    if (!/^\s*D\s+dvdvideo\s/m.test(demuxers.stdout)) throw new Error('demuxer')
    const encoders = await exec(ffmpeg, ['-hide_banner', '-encoders'], { signal, timeout: 15_000, windowsHide: true })
    if (/^\s*V\S*\s+libx264\s/m.test(encoders.stdout)) return ['libx264', '-preset', 'veryfast', '-crf', '20']
    if (/^\s*V\S*\s+h264_videotoolbox\s/m.test(encoders.stdout)) return ['h264_videotoolbox', '-b:v', '2800k', '-allow_sw', '1']
    throw new Error('encoder')
  } catch (error) {
    if (['encoder', 'demuxer'].includes(error.message)) throw error
    throw new Error('ffmpeg', { cause: error })
  }
}

function dvdStreams(report) {
  const input = /^Input #0, dvdvideo,/m.exec(report)
  const audio = []
  const subtitles = []
  if (!input) return { audio, subtitles }
  const streams = report.slice(input.index).split(/(?=^\s*Stream #0:\d+)/m)
  for (const stream of streams) {
    const match = /^\s*Stream #0:(\d+)(?:\[[^\]\r\n]+\])?(?:\(([a-z]{2,3})\))?: (Audio:|Subtitle: dvd_subtitle\b)/i.exec(stream)
    if (!match) continue
    const [, index, language, type] = match
    const track = { stream: Number(index), ...(language ? { language: language.toLowerCase() } : {}) }
    if (type.toLowerCase() === 'audio:') { audio.push(track); continue }
    const viewport = /^\s*VIEWPORT\s*:\s*([^\r\n]+)/mi.exec(stream)?.[1]?.trim().toLowerCase()
    // The other viewports are alternate bitmaps for the same logical track.
    if (!viewport || viewport === 'fullscreen' || viewport === 'widescreen') subtitles.push(track)
  }
  return { audio, subtitles }
}

function dvdInput(source, settings) {
  return ['-f', 'dvdvideo', '-title', String(settings.title), '-chapter_start', String(settings.chapter),
    ...(settings.lastChapter === undefined ? [] : ['-chapter_end', String(settings.lastChapter)]),
    '-angle', String(settings.angle), '-i', source]
}

async function probeDvd(ffmpeg, input, signal) {
  try {
    const { stderr } = await exec(ffmpeg, ['-hide_banner', '-loglevel', 'info', '-nostdin',
      '-probesize', '256k', '-analyzeduration', '750000', ...input], {
      signal, timeout: 20_000, maxBuffer: 256 * 1024, windowsHide: true,
    })
    return dvdStreams(stderr)
  } catch (error) {
    signal.throwIfAborted()
    if (error.code === 'ENOENT') throw new Error('ffmpeg', { cause: error })
    if (/Unknown input format: '?dvdvideo/i.test(error.stderr)) throw new Error('demuxer', { cause: error })
    // FFmpeg prints the input stream inventory and exits when no output was requested.
    if (!error.stderr || !/At least one output file must be specified/i.test(error.stderr)) throw new Error('convert', { cause: error })
    return dvdStreams(error.stderr)
  }
}

function run(ffmpeg, args, signal, onProgress) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let failure
    let pending = ''
    let diagnostics = ''
    let frames = 0
    let forceStop
    function stop() {
      child.kill()
      forceStop = setTimeout(() => child.kill('SIGKILL'), 1500)
      forceStop.unref()
    }
    signal.addEventListener('abort', stop, { once: true })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      const lines = (pending + chunk).split(/\r?\n/)
      pending = lines.pop().slice(-512)
      for (const line of lines) {
        const frame = /^frame=\s*(\d+)$/.exec(line)
        if (frame) frames = Number(frame[1])
        const time = /^out_time_us=(\d+)$/.exec(line)
        if (time) onProgress?.(Math.floor(Number(time[1]) / 1_000_000))
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { diagnostics = (diagnostics + chunk).slice(-8192) })
    child.once('error', (error) => { failure = error })
    child.once('close', (code) => {
      signal.removeEventListener('abort', stop)
      clearTimeout(forceStop)
      if (code === 0 && frames > 0 && !signal.aborted) resolve()
      else if (signal.aborted) reject(new Error('cancelled'))
      else if (failure?.code === 'ENOENT') reject(new Error('ffmpeg'))
      else if (/No such filter: ['"]?overlay|(?:decoder not found|no decoder).*dvd_subtitle|dvd_subtitle.*(?:decoder not found|no decoder)/i.test(diagnostics)) {
        reject(new Error('subtitleSupport'))
      }
      else if (/matches no streams|invalid stream specifier/i.test(diagnostics)) reject(new Error('track'))
      else reject(new Error('convert', { cause: failure ?? new Error(diagnostics) }))
    })
  })
}

async function convertDvd(folder, destination, settings, signal, onProgress, ffmpeg = process.env.WORSHIP_DVD_FFMPEG || 'ffmpeg') {
  const { root: source } = await dvdVolume(folder).catch(() => { throw new Error('folder') })
  const [codec, ...encode] = await findEncoder(ffmpeg, signal)
  const audio = settings.audio === undefined ? '0:a:0?' : `0:a:${settings.audio - 1}`
  const input = dvdInput(source, settings)
  const subtitle = settings.subtitle === undefined ? undefined : (await probeDvd(ffmpeg, input, signal)).subtitles[settings.subtitle - 1]?.stream
  if (settings.subtitle !== undefined && subtitle === undefined) throw new Error('subtitleTrack')
  const deinterlace = 'yadif=deint=interlaced'
  const picture = subtitle === undefined ? ['-map', '0:v:0', '-vf', deinterlace]
    : ['-filter_complex', `[0:v:0]${deinterlace}[picture];[picture][0:${subtitle}]overlay=eof_action=pass[clip]`, '-map', '[clip]']
  await run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-progress', 'pipe:1', '-nostats',
    ...input, ...picture, '-map', audio, '-map_metadata', '-1', '-map_chapters', '-1',
    '-pix_fmt', 'yuv420p', '-c:v', codec, ...encode,
    '-c:a', 'aac', '-ac', '2', '-b:a', '160k', '-movflags', '+faststart', '-fs', String(maxBytes),
    '-f', 'mp4', destination,
  ], signal, onProgress)
  const { size } = await stat(destination)
  if (!size || size >= maxBytes) throw new Error('size')
  return size
}

function registerDvdImport({ ipcMain, dialog, allowed, ownerWindow }) {
  let job
  let disc
  let scan
  const failure = (error, signal) => signal.aborted ? { state: 'cancelled' }
    : { state: 'error', error: importErrors.has(error.message) ? error.message : 'convert' }
  const chooseFolder = () => dialog.showOpenDialog(ownerWindow(), {
    title: 'เลือกแผ่นหรือโฟลเดอร์ DVD-Video', properties: ['openDirectory'],
  })

  function selectedDisc(id, settings) {
    if (!disc || disc.id !== id) throw new Error('disc')
    if (!disc.titles.some((title) => title.number === settings.title && settings.chapter <= title.chapters
      && (settings.lastChapter ?? settings.chapter) <= title.chapters && settings.angle <= title.angles)) throw new Error('settings')
    return disc
  }

  async function matchingDisc(source) {
    const current = await readDvdTitleTable(source.manager).catch(() => null)
    if (current?.fingerprint !== source.fingerprint) throw new Error('disc')
    return source.root
  }

  async function remove(current) {
    try { await current.file?.close() } catch { /* The owner may have cancelled during a read. */ }
    try {
      if (current.directory) await rm(current.directory, { recursive: true, force: true, maxRetries: 3 })
    } catch { /* The operating system can reclaim a locked temporary file. */ }
  }

  function cancel() {
    scan?.abort()
    if (!job) return
    const current = job
    current.controller.abort()
    if (current.file) {
      job = undefined
      void remove(current)
    }
  }

  function close() {
    disc = undefined
    cancel()
  }

  ipcMain.handle('dvd:choose', async (event) => {
    if (!allowed(event)) return { state: 'error', error: 'settings' }
    if (job) return { state: 'error', error: 'busy' }
    scan?.abort()
    const current = { controller: new AbortController() }
    job = current
    const { signal } = current.controller
    try {
      const selected = await chooseFolder()
      if (selected.canceled || selected.filePaths.length !== 1 || signal.aborted || !allowed(event)) return { state: 'cancelled' }
      const volume = await dvdVolume(selected.filePaths[0]).catch(() => { throw new Error('folder') })
      const inventory = await readDvdTitleTable(volume.manager).catch(() => { throw new Error('catalog') })
      if (signal.aborted || !allowed(event)) return { state: 'cancelled' }
      disc = { ...volume, ...inventory, id: randomUUID() }
      return { state: 'ready', disc: { id: disc.id, name: path.basename(disc.root) || path.parse(disc.root).root, titles: disc.titles } }
    } catch (error) {
      return failure(error, signal)
    } finally { if (job === current) job = undefined }
  })

  ipcMain.handle('dvd:tracks', async (event, id, options) => {
    const settings = dvdSelection(options)
    if (!allowed(event) || !settings) return { state: 'error', error: 'settings' }
    if (job) return { state: 'error', error: 'busy' }
    scan?.abort()
    const current = new AbortController()
    scan = current
    try {
      const source = await matchingDisc(selectedDisc(id, settings))
      current.signal.throwIfAborted()
      const { audio, subtitles } = await probeDvd(process.env.WORSHIP_DVD_FFMPEG || 'ffmpeg',
        dvdInput(source, { ...settings, lastChapter: settings.chapter }), current.signal)
      if (current.signal.aborted || !allowed(event) || disc?.id !== id) return { state: 'cancelled' }
      const tracks = (entries) => entries.map(({ language }, index) => ({ number: index + 1, ...(language ? { language } : {}) }))
      return { state: 'ready', audio: tracks(audio), subtitles: tracks(subtitles) }
    } catch (error) {
      return failure(error, current.signal)
    } finally { if (scan === current) scan = undefined }
  })

  ipcMain.handle('dvd:forget', (event, id) => {
    if (!allowed(event) || !disc || disc.id !== id) return
    disc = undefined
    scan?.abort()
    if (job?.discId === id) cancel()
  })

  ipcMain.handle('dvd:prepare', async (event, options, discId) => {
    const settings = dvdSelection(options)
    if (!allowed(event) || !settings) return { state: 'error', error: 'settings' }
    if (job) return { state: 'error', error: 'busy' }
    scan?.abort()
    const current = { id: randomUUID(), discId, controller: new AbortController() }
    job = current
    const { signal } = current.controller
    try {
      let folder
      if (discId === undefined) {
        const selected = await chooseFolder()
        if (selected.canceled || selected.filePaths.length !== 1 || signal.aborted || !allowed(event)) return { state: 'cancelled' }
        folder = selected.filePaths[0]
      } else folder = await matchingDisc(selectedDisc(discId, settings))
      if (signal.aborted || !allowed(event)) return { state: 'cancelled' }
      current.directory = await mkdtemp(path.join(tmpdir(), 'worshipteam-dvd-'))
      const output = path.join(current.directory, 'clip.mp4')
      const size = await convertDvd(folder, output, settings, signal, (seconds) => {
        if (!signal.aborted && allowed(event)) event.sender.send('dvd:progress', seconds)
      })
      signal.throwIfAborted()
      current.file = await open(output, 'r')
      if (signal.aborted || !allowed(event)) {
        await current.file.close()
        current.file = undefined
        return { state: 'cancelled' }
      }
      current.size = size
      const subtitles = settings.subtitle === undefined ? '' : `-sub${settings.subtitle}`
      return { state: 'ready', id: current.id, size, filename: `DVD-${settings.title}-${settings.chapter}${subtitles}.mp4` }
    } catch (error) {
      return failure(error, signal)
    } finally {
      if (!current.file) {
        if (job === current) job = undefined
        await remove(current)
      }
    }
  })

  ipcMain.handle('dvd:read', async (event, id, offset) => {
    const current = job
    if (!allowed(event) || !current?.file || current.id !== id || !integer(offset, 0, current.size - 1)) return null
    const bytes = new Uint8Array(Math.min(chunkBytes, current.size - offset))
    try {
      const { bytesRead } = await current.file.read(bytes, 0, bytes.length, offset)
      return bytesRead > 0 ? bytes.buffer.slice(0, bytesRead) : null
    } catch { return null }
  })
  ipcMain.handle('dvd:release', (event, id) => { if (allowed(event) && job?.id === id) cancel() })
  ipcMain.handle('dvd:cancel', (event) => { if (allowed(event)) cancel() })
  return { close }
}

module.exports = { convertDvd, dvdSelection, dvdStreams, registerDvdImport }
