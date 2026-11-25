/** Exposes native NDI, DVD, and PowerPoint tools to the sandboxed web app. */

const { contextBridge, ipcRenderer } = require('electron')

if (new URL(location.href).searchParams.get('ndiAudio') === '1') {
  contextBridge.exposeInMainWorld('worshipNdiCapture', {
    async start() {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      })
      const [track] = stream.getAudioTracks()
      stream.getVideoTracks().forEach((video) => video.stop())
      let context
      const stop = () => {
        stream.getTracks().forEach((input) => input.stop())
        if (context?.state !== 'closed') void context?.close().catch(() => {})
      }
      try {
        if (!track || track.readyState !== 'live') throw new Error('Tab audio is unavailable')
        window.addEventListener('pagehide', stop, { once: true })
        track.addEventListener('ended', () => ipcRenderer.send('ndi:audio-ended'), { once: true })
        context = new AudioContext({ sampleRate: 48000 })
        await context.audioWorklet.addModule('/ndi-audio-capture.js')
        const capture = new AudioWorkletNode(context, 'worshipteam-ndi-capture', {
          channelCount: 2, channelCountMode: 'explicit',
        })
        capture.port.onmessage = ({ data }) => ipcRenderer.send('ndi:audio', data)
        // The worklet emits silence to its output. Only PCM messages reach NDI.
        context.createMediaStreamSource(stream).connect(capture).connect(context.destination)
        await context.resume()
        return true
      } catch (error) {
        stop()
        throw error
      }
    },
  })
}

contextBridge.exposeInMainWorld('worshipNdiInput', {
  discover: () => ipcRenderer.invoke('ndi:discover'),
  watch: (name, onUpdate, audio) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = ({ data }) => {
      try {
        onUpdate(data)
      } finally {
        if (data.kind === 'frame') channel.port1.postMessage('next')
        if (data.kind === 'audio') channel.port1.postMessage('audio-next')
      }
    }
    ipcRenderer.postMessage('ndi:watch', { name, audio }, [channel.port2])
    return () => {
      channel.port1.onmessage = null
      channel.port1.close()
    }
  },
})

contextBridge.exposeInMainWorld('worshipNdi', {
  status: (source) => ipcRenderer.invoke('ndi:status', source),
  start: (options) => ipcRenderer.invoke('ndi:start', options),
  stop: (source) => ipcRenderer.invoke('ndi:stop', source),
  subscribe: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('ndi:status', listener)
    return () => ipcRenderer.removeListener('ndi:status', listener)
  },
})

contextBridge.exposeInMainWorld('worshipDvd', {
  choose: () => ipcRenderer.invoke('dvd:choose'),
  tracks: (id, settings) => ipcRenderer.invoke('dvd:tracks', id, settings),
  forget: (id) => ipcRenderer.invoke('dvd:forget', id),
  prepare: (settings, discId) => ipcRenderer.invoke('dvd:prepare', settings, discId),
  read: (id, offset) => ipcRenderer.invoke('dvd:read', id, offset),
  release: (id) => ipcRenderer.invoke('dvd:release', id),
  cancel: () => ipcRenderer.invoke('dvd:cancel'),
  progress: (callback) => {
    const listener = (_event, seconds) => callback(seconds)
    ipcRenderer.on('dvd:progress', listener)
    return () => ipcRenderer.removeListener('dvd:progress', listener)
  },
})

contextBridge.exposeInMainWorld('worshipPowerPoint', {
  convertLegacy: (bytes) => ipcRenderer.invoke('powerpoint:convert-legacy', bytes),
  renderPdf: (bytes, legacy) => ipcRenderer.invoke('powerpoint:render-pdf', bytes, legacy),
})

contextBridge.exposeInMainWorld('worshipLegacyVideo', {
  open: (extension, size) => ipcRenderer.invoke('legacy-video:open', extension, size),
  write: (id, offset, bytes) => ipcRenderer.invoke('legacy-video:write', id, offset, bytes),
  convert: (id) => ipcRenderer.invoke('legacy-video:convert', id),
  read: (id, offset) => ipcRenderer.invoke('legacy-video:read', id, offset),
  release: (id) => ipcRenderer.invoke('legacy-video:release', id),
})
