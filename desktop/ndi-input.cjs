/** Shares one native NDI receiver per source across presentation windows. */

const { execFile, spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { ipcMain } = require('electron')
const path = require('node:path')

const receiverPath = path.join(__dirname, 'build', process.platform === 'win32' ? 'ndi-receiver.exe' : 'ndi-receiver')
const processOptions = { windowsHide: true }
const maxPixels = 4096 * 2160

function isSourceName(name) {
  return typeof name === 'string' && Boolean(name.trim()) && Buffer.byteLength(name) <= 1024 && !/[\x00-\x1f\x7f]/.test(name)
}

function capturePackets(stream, receive, invalid) {
  const header = Buffer.alloc(12)
  let target = header
  let cursor = 0
  let packet
  stream.on('data', (chunk) => {
    for (let offset = 0; offset < chunk.length;) {
      const size = chunk.copy(target, cursor, offset, offset + target.length - cursor)
      offset += size
      cursor += size
      if (cursor < target.length) continue
      cursor = 0
      if (target === header) {
        const width = header.readUInt32LE(0)
        const height = header.readUInt32LE(4)
        const detail = header.readUInt32LE(8)
        if (!width && height >= 8000 && height <= 192000 && detail > 0 && detail <= Math.floor(height / 50)) {
          packet = { kind: 'audio', rate: height, samples: detail }
          target = Buffer.allocUnsafe(detail * 2 * 4)
        } else if (width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= maxPixels && detail > 0 && detail <= 10000000) {
          packet = { kind: 'frame', width, height, aspect: detail / 100000 }
          target = Buffer.allocUnsafe(width * height * 4)
        } else {
          stream.destroy()
          invalid()
          return
        }
      } else {
        receive(packet.kind === 'audio' ? { ...packet, pcm: target } : { ...packet, pixels: target })
        target = header
      }
    }
  })
}

function registerNdiInput({ canDiscover, canWatch, isOwnSource }) {
  const sources = new Map()
  const views = new Map()
  let discovery

  function detachView(contents) {
    for (const close of views.get(contents) ?? []) close()
  }

  ipcMain.handle('ndi:discover', (event) => {
    if (!canDiscover(event)) return { error: 'settings' }
    discovery ??= new Promise((resolve) => {
      execFile(receiverPath, ['discover'], { ...processOptions, timeout: 5000, maxBuffer: 128 * 1024 }, (error, names, stderr) => {
        if (error) {
          resolve({ error: error.code === 'ENOENT' ? 'helper' : stderr.trim() === 'runtime' ? 'runtime' : 'receiver' })
          return
        }
        const found = names.split('\0').filter((name) => isSourceName(name) && !isOwnSource(name))
        resolve({ sources: [...new Set(found)].sort((a, b) => a.localeCompare(b)) })
      })
    }).finally(() => { discovery = undefined })
    return discovery
  })

  function openSource(name) {
    const child = spawn(receiverPath, ['receive'], { ...processOptions, stdio: ['pipe', 'pipe', 'pipe'] })
    const clients = new Map()
    let state = 'waiting'
    let timeout
    let nativeError = 'receiver'
    let closed = false
    const source = { clients, add, end }
    sources.set(name, source)

    function add(port, client) {
      clients.set(port, client)
      if (state !== 'live') port.postMessage({ kind: 'status', state })
    }

    function setState(next) {
      if (state === next) return
      state = next
      for (const port of clients.keys()) port.postMessage({ kind: 'status', state })
    }

    function end(error) {
      if (closed) return
      closed = true
      clearTimeout(timeout)
      sources.delete(name)
      for (const [port, client] of clients) {
        if (error) port.postMessage({ kind: 'status', state: 'error', error })
        client.close()
      }
      child.stdin.end()
      if (child.exitCode === null && child.signalCode === null) {
        const kill = setTimeout(() => child.kill('SIGKILL'), 1600)
        kill.unref()
        child.once('close', () => clearTimeout(kill))
      }
    }

    capturePackets(child.stdout, (frame) => {
      if (closed) return
      if (frame.kind === 'audio') {
        if (state !== 'live') return
        for (const [port, client] of clients) {
          if (!client.audio || client.queuedAudio >= 8) continue
          client.queuedAudio++
          port.postMessage(frame)
        }
        return
      }
      clearTimeout(timeout)
      timeout = setTimeout(() => setState('lost'), 2400)
      state = 'live'
      for (const [port, client] of clients) {
        if (!client.ready) continue
        client.ready = false
        port.postMessage(frame)
      }
    }, () => end('receiver'))

    createInterface({ input: child.stderr }).on('line', (line) => {
      if (line === 'runtime') nativeError = line
    })
    child.on('error', (error) => end(error.code === 'ENOENT' ? 'helper' : 'receiver'))
    child.on('close', () => end(nativeError))
    child.stdin.on('error', () => { /* Process closure supplies the error code. */ })
    child.stdin.write(name + '\0')
    return source
  }

  ipcMain.on('ndi:watch', (event, options) => {
    const [port] = event.ports
    if (!port) return
    const name = options?.name
    const audio = options?.audio === true
    const ownSource = isOwnSource(name)
    if (!canWatch(event, audio) || !isSourceName(name) || ownSource) {
      port.postMessage({ kind: 'status', state: 'error', error: ownSource ? 'feedback' : 'settings' })
      port.close()
      return
    }
    const contents = event.sender
    let source = sources.get(name)
    if (!source && sources.size >= 4) {
      port.postMessage({ kind: 'status', state: 'error', error: 'receiver' })
      port.close()
      return
    }
    source ??= openSource(name)
    const subscriptions = views.get(contents) ?? new Set()
    const client = {
      ready: true,
      audio,
      queuedAudio: 0,
      close() {
        if (!source.clients.delete(port)) return
        subscriptions.delete(client.close)
        if (!subscriptions.size) views.delete(contents)
        port.close()
        if (!source.clients.size) source.end()
      },
    }
    subscriptions.add(client.close)
    views.set(contents, subscriptions)
    source.add(port, client)
    port.on('message', ({ data }) => {
      if (data === 'next') client.ready = true
      if (data === 'audio-next' && client.queuedAudio > 0) client.queuedAudio--
    })
    port.on('close', client.close)
    port.start()
  })

  return {
    detachView,
    stopSource(name) { sources.get(name)?.end('feedback') },
    close() { for (const source of sources.values()) source.end() },
  }
}

module.exports = { registerNdiInput }
