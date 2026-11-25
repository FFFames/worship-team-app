/** Hosts the presentation app and its native NDI and DVD features. */

const { app, BrowserWindow, dialog, ipcMain, session: electronSession } = require('electron')
const path = require('node:path')
const { registerNdiInput } = require('./ndi-input.cjs')
const { createNdiOutputs } = require('./ndi-output.cjs')
const { registerDvdImport } = require('./dvd-import.cjs')
const { registerPowerPointImport } = require('./powerpoint-import.cjs')
const { registerLegacyVideo } = require('./legacy-video.cjs')

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const presentationRoute = /^\/playlists\/([^/]+)\/present\/?$/
const foldbackRoute = /^\/playlists\/([^/]+)\/foldback\/?$/
const preload = path.join(__dirname, 'preload.cjs')
const webPreferences = { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true }
let appUrl
let control
let ndiOutputs
let ndiInput
let dvdImport
let powerPointImport
let legacyVideo
const inputViews = new Set()

function getAppUrl() {
  const urlIndex = process.argv.indexOf('--url')
  const url = new URL(urlIndex === -1 ? process.env.WORSHIP_APP_URL || 'http://localhost:5173' : process.argv[urlIndex + 1])
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) {
    throw new Error('Use an HTTPS WorshipTeam URL or a local development URL.')
  }
  return url
}

function sameOrigin(url) {
  try { return new URL(url).origin === appUrl.origin } catch { return false }
}

function playlistAt(url) {
  if (!sameOrigin(url)) return undefined
  const match = presentationRoute.exec(new URL(url).pathname)
  return match && uuid.test(match[1]) ? match[1] : undefined
}

function isPresenter(url) {
  return sameOrigin(url) && new URL(url).pathname === '/presenter'
}

function isInputView(url) {
  if (!sameOrigin(url)) return false
  const match = foldbackRoute.exec(new URL(url).pathname)
  return isPresenter(url) || Boolean(match && uuid.test(match[1]))
}

function trackInputView(contents) {
  inputViews.add(contents)
  const detach = () => ndiInput.detachView(contents)
  contents.on('did-start-navigation', ({ isMainFrame }) => { if (isMainFrame) detach() })
  contents.on('render-process-gone', detach)
  contents.on('destroyed', () => {
    detach()
    inputViews.delete(contents)
  })
}

function restrictNavigation(contents, allows) {
  const check = (event) => {
    if (!allows(event.url)) event.preventDefault()
  }
  contents.on('will-navigate', check)
  contents.on('will-redirect', (event) => {
    if (event.isMainFrame) check(event)
  })
}

function registerIpc() {
  ndiOutputs = createNdiOutputs({
    appUrl,
    preload,
    webPreferences,
    configureWindow(contents, url) {
      trackInputView(contents)
      restrictNavigation(contents, (destination) => destination === url)
      contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    },
    onStatus(status) {
      if (control && !control.isDestroyed() && playlistAt(control.webContents.getURL())) {
        control.webContents.send('ndi:status', status)
      }
    },
    onSource: (name) => ndiInput.stopSource(name),
  })
  electronSession.defaultSession.setDisplayMediaRequestHandler((request, grant) => {
    const output = ndiOutputs.forAudioFrame(request.frame)
    if (!output?.captureRequested || !request.audioRequested || !request.videoRequested) {
      grant({})
      return
    }
    output.captureRequested = false
    grant({ video: request.frame, audio: request.frame, enableLocalEcho: false })
  })
  ipcMain.on('ndi:audio', (event, payload) => {
    ndiOutputs.forAudioFrame(event.senderFrame)?.pushAudio(payload)
  })
  ipcMain.on('ndi:audio-ended', (event) => {
    ndiOutputs.forAudioFrame(event.senderFrame)?.fail('audio')
  })
  function controlPage(event) {
    const frame = event.senderFrame
    if (!control || control.isDestroyed() || event.sender !== control.webContents
      || !frame || frame !== control.webContents.mainFrame) return undefined
    return sameOrigin(frame.url) ? frame.url : undefined
  }
  const fromControl = (event) => playlistAt(controlPage(event))
  powerPointImport = registerPowerPointImport({ ipcMain, allowed(event) {
    const url = controlPage(event)
    return Boolean(url && /^\/(designs|import\/easyworship|playlists\/import)\/?$/.test(new URL(url).pathname))
  } })
  legacyVideo = registerLegacyVideo({ ipcMain, allowed(event) {
    const url = controlPage(event)
    return Boolean(url && /^\/(?:media|designs|import\/easyworship|songs\/import|playlists\/import)\/?$/.test(new URL(url).pathname))
  } })
  dvdImport = registerDvdImport({ ipcMain, dialog, ownerWindow: () => control, allowed(event) {
    const url = controlPage(event)
    return Boolean(url && (playlistAt(url) || /^\/media\/?$/.test(new URL(url).pathname)))
  } })
  ndiInput = registerNdiInput({
    canDiscover: (event) => {
      const url = controlPage(event)
      return Boolean(url && (playlistAt(url) || /^\/media\/?$/.test(new URL(url).pathname)))
    },
    canWatch: (event, audio) => {
      const frame = event.senderFrame
      return Boolean(frame && inputViews.has(event.sender) && frame === event.sender.mainFrame
        && (audio ? isPresenter(frame.url) : isInputView(frame.url)))
    },
    isOwnSource: ndiOutputs.isOwnSource,
  })
  ipcMain.handle('ndi:status', (event, source) => fromControl(event) ? ndiOutputs.status(source) : { state: 'idle' })
  ipcMain.handle('ndi:stop', (event, source) => fromControl(event) ? ndiOutputs.stop(source) : { state: 'idle' })
  ipcMain.handle('ndi:start', (event, options) => {
    const playlist = fromControl(event)
    if (!playlist || !options || !ndiOutputs.has(options.source)
      || ![720, 1080].includes(options.height) || typeof options.session !== 'string' || !uuid.test(options.session)
      || (options.audio !== undefined && typeof options.audio !== 'boolean') || (options.audio && options.source === 'stage')) {
      return { state: 'error', error: 'settings' }
    }
    return ndiOutputs.start(playlist, options, () => fromControl(event) === playlist)
  })
}

function openControl() {
  control = new BrowserWindow({
    width: 1380, height: 900,
    webPreferences: { ...webPreferences, preload },
  })
  const contents = control.webContents
  restrictNavigation(contents, sameOrigin)
  contents.setWindowOpenHandler(({ url }) => {
    if (!sameOrigin(url)) return { action: 'deny' }
    const presenter = isPresenter(url)
    const inputView = isInputView(url)
    const query = new URL(url).searchParams
    const interactiveAudience = presenter && query.get('output') !== 'alternate' && !query.has('signal')
    return { action: 'allow', overrideBrowserWindowOptions: {
      webPreferences: {
        ...webPreferences,
        preload: inputView ? preload : undefined,
        ...(inputView ? { autoplayPolicy: interactiveAudience ? 'no-user-gesture-required' : 'document-user-activation-required' } : {}),
        backgroundThrottling: !inputView,
      },
    } }
  })
  contents.on('did-create-window', (popup, details) => {
    if (isInputView(details.url)) trackInputView(popup.webContents)
    restrictNavigation(popup.webContents, sameOrigin)
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
  let playlist
  let pathname
  function checkRoute() {
    const url = contents.getURL()
    const next = playlistAt(url)
    const nextPath = new URL(url).pathname
    if (next !== playlist) ndiOutputs.stopAll()
    if (nextPath !== pathname) { dvdImport.close(); powerPointImport.close(); legacyVideo.close() }
    playlist = next
    pathname = nextPath
  }
  contents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (isMainFrame && !isSameDocument) {
      ndiOutputs.stopAll()
      dvdImport.close()
      powerPointImport.close()
      legacyVideo.close()
    }
  })
  contents.on('did-navigate', checkRoute)
  contents.on('did-navigate-in-page', checkRoute)
  contents.on('render-process-gone', () => {
    ndiOutputs.stopAll()
    dvdImport.close()
    powerPointImport.close()
    legacyVideo.close()
  })
  control.on('closed', () => {
    control = undefined
    ndiInput.close()
    ndiOutputs.stopAll()
    dvdImport.close()
    powerPointImport.close()
    legacyVideo.close()
  })
  void control.loadURL(appUrl.href).catch((error) => {
    dialog.showErrorBox('WorshipTeam', `Could not open the WorshipTeam URL.\n${error.message}`)
    app.quit()
  })
}

app.whenReady().then(() => {
  try {
    appUrl = getAppUrl()
    registerIpc()
    openControl()
  } catch (error) {
    dialog.showErrorBox('WorshipTeam', error.message)
    app.quit()
  }
})
app.on('activate', () => { if (!control && appUrl) openControl() })
app.on('before-quit', (event) => {
  ndiInput?.close()
  ndiOutputs?.stopAll()
  dvdImport?.close()
  powerPointImport?.close()
  const videoCleanup = legacyVideo?.close()
  if (videoCleanup) {
    event.preventDefault()
    void videoCleanup.then(() => app.quit())
  }
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
