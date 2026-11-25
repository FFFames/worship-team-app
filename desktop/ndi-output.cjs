/** Owns native NDI publishers and isolates each presentation output's lifecycle. */

const { BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const path = require('node:path')

const sourceNames = new Map([
  ['live', 'WorshipTeam Audience'],
  ['alternate', 'WorshipTeam Broadcast'],
  ['stage', 'WorshipTeam Stage'],
])
const frameRate = 30
const audioPacketBytes = 480 * 2 * 4
const videoPacket = Buffer.of(0)
const audioPacket = Buffer.of(1)
const senderPath = path.join(__dirname, 'build', process.platform === 'win32' ? 'ndi-sender.exe' : 'ndi-sender')

function createNdiOutputs({ appUrl, preload, webPreferences, configureWindow, onStatus, onSource }) {
  const slots = new Map([...sourceNames].map(([source, name]) => [
    source, { source, name, status: { state: 'idle', source }, generation: 0 },
  ]))
  const retiring = new Set()
  let lastSource
  const fallback = () => {
    const last = slots.get(lastSource)
    return last?.running ? last : [...slots.values()].find((slot) => slot.running) ?? last
  }

  function updateStatus(slot, status) {
    slot.status = { ...status, source: slot.source }
    if (slot.running || status.state === 'error') lastSource = slot.source
    onStatus(slot.status)
    return slot.status
  }

  function stopSlot(slot, status = { state: 'idle' }) {
    slot.generation++
    const running = slot.running
    slot.running = undefined
    if (running) {
      clearTimeout(running.timeout)
      clearInterval(running.pacer)
      retiring.add(running)
      slot.closing = running.done.finally(() => {
        retiring.delete(running)
        slot.closing = undefined
      })
      running.child.stdin.end()
      if (running.child.exitCode === null && running.child.signalCode === null) {
        const timeout = setTimeout(() => running.child.kill('SIGKILL'), 1200)
        timeout.unref()
        void running.done.then(() => clearTimeout(timeout))
      }
      if (!running.window.isDestroyed()) running.window.destroy()
    }
    return updateStatus(slot, status)
  }

  function launch(slot, playlist, { source, height, session, audio = false }) {
    const width = height * 16 / 9
    const name = slot.name
    const pathname = source === 'stage' ? `/playlists/${playlist}/foldback` : '/presenter'
    const url = new URL(pathname, appUrl)
    url.searchParams.set('signal', 'ndi')
    if (source === 'alternate') url.searchParams.set('output', source)
    if (source !== 'live') url.searchParams.set('session', session)
    if (audio) url.searchParams.set('ndiAudio', '1')
    const window = new BrowserWindow({
      width, height, useContentSize: true, show: false, frame: false, transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        ...webPreferences,
        preload,
        autoplayPolicy: 'document-user-activation-required',
        offscreen: true,
        backgroundThrottling: false,
      },
    })
    const contents = window.webContents
    let child
    try {
      configureWindow(contents, url.href)
      // Tab capture reads the mix before local output mute.
      contents.setAudioMuted(true)
      contents.setFrameRate(frameRate)
      child = spawn(senderPath, [name, String(height), ...(audio ? ['--av'] : [])], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      window.destroy()
      throw error
    }
    const done = new Promise((resolve) => child.once('close', resolve))
    const running = { window, child, done, audio, url: url.href, captureRequested: false, pushAudio, fail }
    slot.running = running
    const isCurrent = () => slot.running === running
    function fail(error) {
      if (isCurrent()) stopSlot(slot, { state: 'error', error })
    }
    let ready = false
    let latest
    let nativeError
    let surfaceReady = false
    let audioReady = !audio
    const audioQueue = []
    const stdout = createInterface({ input: child.stdout })
    const stderr = createInterface({ input: child.stderr })

    function canWrite() {
      return isCurrent() && child.stdin.writable && !child.stdin.writableNeedDrain
    }

    function writePacket(header, payload) {
      child.stdin.cork()
      child.stdin.write(header)
      child.stdin.write(payload)
      child.stdin.uncork()
    }

    function flushAudio() {
      while (running.pacer && audioQueue.length && canWrite()) writePacket(audioPacket, audioQueue.shift())
    }

    function pushAudio(payload) {
      if (!isCurrent() || !audio || !(payload instanceof ArrayBuffer) || payload.byteLength !== audioPacketBytes) return
      audioQueue.push(Buffer.from(payload))
      if (audioQueue.length > 8) audioQueue.shift()
      flushAudio()
    }

    const advertise = () => {
      if (!isCurrent() || !ready || !latest || !audioReady || running.pacer) return
      clearTimeout(running.timeout)
      updateStatus(slot, { state: 'live', height, name, audio })
      running.pacer = setInterval(() => {
        if (!canWrite()) return
        if (audio) {
          flushAudio()
          if (canWrite()) writePacket(videoPacket, latest)
        } else child.stdin.write(latest)
      }, 1000 / frameRate)
    }
    stdout.on('line', (line) => {
      if (!line.startsWith('READY\t')) return
      running.sourceName = line.slice(6)
      if (isCurrent() && running.sourceName) onSource(running.sourceName)
      ready = true
      advertise()
    })
    stderr.on('line', (line) => {
      if (line === 'runtime' || line === 'publisher') nativeError = line
    })
    child.on('error', (error) => fail(error.code === 'ENOENT' ? 'helper' : 'publisher'))
    child.on('close', () => fail(nativeError || 'publisher'))
    child.stdin.on('drain', flushAudio)
    child.stdin.on('error', () => {
      // A publisher that exits before consuming input reports the failure on close.
    })
    contents.on('paint', (_event, _dirty, image) => {
      if (!isCurrent() || !surfaceReady) return
      const size = image.getSize()
      if (size.width !== width || size.height !== height) return
      const bytes = image.toBitmap()
      if (bytes.length !== width * height * 4) return
      latest = bytes
      advertise()
    })
    contents.on('render-process-gone', () => fail('surface'))
    if (audio) contents.on('dom-ready', () => {
      // Allow the output document to play cue audio without unlocking sandboxed web frames.
      void contents.mainFrame.executeJavaScript('void 0', true).catch(() => fail('audio'))
    })
    window.on('closed', () => { if (isCurrent()) stopSlot(slot) })
    running.timeout = setTimeout(() => fail('timeout'), 15000)
    void window.loadURL(url.href).then(async () => {
      // Route chunks load asynchronously. Wait for the actual output rather than sending the app loader.
      const selector = source === 'stage' ? '[data-output="foldback"]' : '[data-signal="ndi"]'
      await contents.executeJavaScript(`new Promise((resolve) => {
        const observer = new MutationObserver(check)
        function check() {
          if (!document.querySelector(${JSON.stringify(selector)})) return
          observer.disconnect()
          resolve(true)
        }
        observer.observe(document.documentElement, { childList: true, subtree: true })
        check()
      })`)
      if (!isCurrent()) return
      surfaceReady = true
      contents.invalidate()
      if (audio) {
        running.captureRequested = true
        try {
          await contents.executeJavaScript('window.worshipNdiCapture.start()', true)
          audioReady = true
          advertise()
        } catch {
          fail('audio')
        }
      }
    }).catch(() => fail('surface'))
    return updateStatus(slot, { state: 'starting', height, name, audio })
  }

  return {
    has(source) { return slots.has(source) },
    status(source) {
      const slot = source === undefined ? fallback() : slots.get(source)
      return slot?.status ?? { state: 'idle' }
    },
    async start(playlist, options, stillCurrent) {
      const slot = slots.get(options.source)
      if (slot.running) return slot.status
      const generation = slot.generation
      await slot.closing
      if (!stillCurrent() || generation !== slot.generation || slot.running) return slot.status
      try {
        return launch(slot, playlist, options)
      } catch (error) {
        console.error('Could not start NDI output', options.source, error.message)
        return stopSlot(slot, { state: 'error', error: 'surface' })
      }
    },
    async stop(source) {
      const slot = source === undefined ? fallback() : slots.get(source)
      if (!slot) return { state: 'idle' }
      stopSlot(slot)
      await slot.closing
      return slot.status
    },
    stopAll() {
      for (const slot of slots.values()) stopSlot(slot)
      lastSource = undefined
    },
    forAudioFrame(frame) {
      if (!frame) return undefined
      for (const { running } of slots.values()) {
        if (running?.audio && !running.window.isDestroyed()
          && frame === running.window.webContents.mainFrame && frame.url === running.url) return running
      }
      return undefined
    },
    isOwnSource(name) {
      if (typeof name !== 'string' || !name) return false
      for (const { running } of slots.values()) {
        if (running?.sourceName === name) return true
      }
      for (const running of retiring) {
        if (running.sourceName === name) return true
      }
      return false
    },
  }
}

module.exports = { createNdiOutputs }
