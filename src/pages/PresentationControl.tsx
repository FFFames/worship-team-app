/** PresentationControl — Professional dual-screen control panel for live presentation
 *
 * Design system:
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Mobile-responsive with tab navigation
 * - Three-column layout: songs (264px) | slides (flex) | controls (320px)
 * - Kanit font for display/body, Source Code Pro for chords
 * - Exponential ease-out motion curves only
 */

import { useEffect, useCallback, useMemo, useRef, useState, Fragment } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { usePlaylist } from '../hooks/usePlaylists'
import { useVideoBackgrounds } from '../hooks/useVideoBackgrounds'
import { CUE_LABELS, getPlaylistSlides, playlistCueLooping, playlistThemeSubject, songOutputLabel, type PlaylistSlide } from '../utils/playlistCues'
import { applySongLyricRuns, lyricRunsByLine } from '../utils/songLyricFormatting'
import { applySongElementEffects, carrySongArtwork } from '../utils/songSlideLayout'
import { readPlaylistMedia } from '../utils/scheduleMedia'
import { readLibraryMedia } from '../utils/mediaLibrary'
import { usePresentationStore } from '../store/presentationStore'
import { LayeredSlide } from '../components/LayeredSlide'
import { LogoScreen } from '../components/LogoScreen'
import { outputTextInsetsStyle, StyledTextRuns } from '../components/StyledTextRuns'
import { CameraInputControl } from '../components/CameraInputControl'
import { LayeredFeedAssignments } from '../components/LayeredFeedAssignments'
import { DvdReplacementControl } from '../components/DvdReplacementControl'
import { PresentationRemoteControl } from '../components/PresentationRemoteControl'
import { PresentationKeyboardControl } from '../components/PresentationKeyboardControl'
import { PresentationMidiControl } from '../components/PresentationMidiControl'
import { PresentationNdiControl } from '../components/PresentationNdiControl'
import { PresentationCuePreview } from '../components/PresentationCuePreview'
import { AlertControl } from '../components/AlertControl'
import { useAlertTemplates } from '../hooks/useAlertTemplates'
import { useOutputAlertQueues } from '../hooks/useOutputAlertQueues'
import { useNurseryAlerts } from '../hooks/useNurseryAlerts'
import { NurseryAlertControl } from '../components/NurseryAlertControl'
import type { NurseryDisplay, NurseryOutput } from '../utils/nurseryAlerts'
import { useDefaultThemes } from '../hooks/useDefaultThemes'
import { usePresentationKeyboard } from '../hooks/usePresentationKeyboard'
import { useOutputSettings } from '../hooks/useOutputSettings'
import { useMessageAlertSettings } from '../hooks/useMessageAlertSettings'
import { readOutputSettings } from '../utils/outputSettingsStorage'
import { outputLabels, type OutputWindow } from '../utils/outputSettings'
import { loadOutputDisplays, openOutputWindow } from '../utils/outputWindows'
import { createFoldbackControl, type FoldbackSlide } from '../utils/foldbackChannel'
import { getFoldbackNext } from '../utils/foldbackSlides'
import { createSongProjectionTracker, playlistSongProjection } from '../utils/songProjection'
import { createSlideAdvanceController, getSlideAdvance } from '../utils/slidePlayback'
import { cameraInputKey, presentationWebUrl, savedCameraInput, saveCameraInput } from '../utils/livePresentation'
import { ndiDeviceName } from '../utils/ndiInput'
import { assignableDvdClips, resolveDvdAsset } from '../utils/dvdReplacement'
import type { PlaylistCueAsset, PlaylistSong } from '../types/database'
import type { MediaKind } from '../types/media'
import type { CameraInput } from '../types/liveFeed'
import type { SlideDesign } from '../types/slideDesign'
import type { RemoteCommand, RemoteSnapshot } from '../utils/presentationRemote'
import { keyboardJumpIndex, keyboardProfileStorageKey, readKeyboardProfile, type KeyboardAction } from '../utils/presentationKeyboard'
import type { MidiAction } from '../utils/midiControls'
import type { MidiDisplayEvent, MidiOutputEmitter, MidiOutputEvent } from '../utils/midiOutput'
import type { AlertOutput, OutputAlert } from '../types/alertTemplate'
import { designTextLines, powerPointSoundtrackAssets, withDesignBackground, withoutCanvasBackground } from '../utils/slideDesign'
import { powerPointBuildLength, powerPointDesignAtStep } from '../utils/powerPoint/buildNavigation'
import { stepScheduleSlide } from '../utils/scheduleSlideNavigation'
import { advancePowerPointTransitionSound, type PowerPointTransitionSoundState } from '../utils/powerPoint/transitionSound'
import { visibleNote } from '../utils/speakerNotes'
import { scriptureFlowDesign, scriptureOutputDesign, scriptureOutputLayout, scriptureOutputText, type ScriptureReference } from '../utils/scriptureOutput'
import { alternatePresentationDesign, chooseDefaultThemeSlide, type DefaultTheme } from '../utils/defaultThemes'
import { resolveSlideTransition } from '../utils/slideTransitions'
import {
  createControlChannel,
  defaultMediaMuted,
  presentationMediaKey,
  type PresentationMedia,
  type PresentationMessage,
  type PresentationPlayback,
  type PresentationSoundtrack,
} from '../utils/presentationChannel'
import { isLyricLayout, type LyricLayout } from '../utils/slideBuilder'
import { songUsesAutomaticLayout } from '../utils/songLibrarySlides'

type ShowBlockOptions = { restart?: boolean; fromMidi?: boolean; followMaster?: boolean; cueIndex?: number; cleared?: boolean; buildStep?: number }
type PreparedCue = { playlistId: string; entryId: string; slide: number }
const previewPreferenceKey = 'worshipteam.previewBeforeLive.v1'
const continuousScheduleKey = 'worshipteam.continuousSchedule.v1'

type ActiveSoundtrack = { media: PresentationSoundtrack; filename: string }

function localCueMedia<K extends MediaKind>(kind: K, original: PlaylistCueAsset, playlistId: string | undefined, runId?: string) {
  const asset = resolveDvdAsset(original)
  const attachment = playlistId && asset.archivePath ? { playlistId, archivePath: asset.archivePath } : undefined
  const source = asset.libraryId ? { ...attachment, libraryId: asset.libraryId } : attachment
  return source ? { ...source, kind, role: asset.role, runId, ...(asset.clip ? { clip: asset.clip } : {}),
    ...(asset.repeat !== undefined ? { repeat: asset.repeat } : asset.dvd?.repeat ? { repeat: true } : {}),
    ...(asset.playback ? { playback: asset.playback } : {}),
    ...(kind === 'video' && asset.dvd?.playback ? { dvdPlayback: asset.dvd.playback } : {}),
    ...(kind === 'video' && asset.alphaMode ? { alphaMode: asset.alphaMode } : {}) } : undefined
}

async function hasLocalMedia(media: { libraryId?: string; playlistId?: string; archivePath?: string }) {
  const blob = await readPlaylistMedia(media.playlistId, media.archivePath, media.libraryId).catch(() => null)
  return Boolean(blob)
}

function missingMediaMessage(asset: PlaylistCueAsset) {
  if (asset.dvd) return `ไม่พบวิดีโอแทนคลิป DVD ${asset.dvd.name} ในเบราว์เซอร์นี้`
  return `ไม่พบไฟล์ ${asset.filename} ในเบราว์เซอร์นี้ ${asset.libraryId ? 'ให้นำเข้าไฟล์เดิมในคลังสื่อ' : 'ให้นำเข้าไฟล์ตารางเดิมอีกครั้ง'}`
}

export default function PresentationControl() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playlist, songs, loading, error } = usePlaylist(id)
  const { backgrounds } = useVideoBackgrounds()
  const { templates: alertTemplates } = useAlertTemplates()
  const messageSettings = useMessageAlertSettings()
  const defaultThemes = useDefaultThemes()
  const { alphaSource, scripture: scriptureSettings, foldback } = useOutputSettings()
  const store = usePresentationStore()
  const channelRef = useRef<ReturnType<typeof createControlChannel> | null>(null)
  const alternateRef = useRef<ReturnType<typeof createControlChannel> | null>(null)
  const alternateLogoActive = useRef(false)
  const [presentedLogo, setPresentedLogo] = useState<DefaultTheme>()
  const foldbackRef = useRef<ReturnType<typeof createFoldbackControl> | null>(null)
  const publishAlert = useCallback((output: AlertOutput, alert: OutputAlert | null) => {
    if (output === 'stage') foldbackRef.current?.publish({ alert })
    else {
      const channel = output === 'live' ? channelRef.current : alternateRef.current
      channel?.send(alert ? { type: 'SHOW_ALERT', alert } : { type: 'CLEAR_ALERT' })
    }
  }, [])
  const { queues: alertQueues, dispatch: dispatchAlert } = useOutputAlertQueues(publishAlert)
  const publishNursery = useCallback((output: NurseryOutput, display: NurseryDisplay | null) => {
    const channel = output === 'live' ? channelRef.current : alternateRef.current
    channel?.send({ type: 'SET_NURSERY_ALERTS', display })
  }, [])
  const nursery = useNurseryAlerts(publishNursery, id)
  const [controlSession] = useState(() => crypto.randomUUID())
  const [trackSongProjection] = useState(createSongProjectionTracker)

  // Mobile tab state
  const [activeTab, setActiveTab] = useState<'songs' | 'lyrics' | 'controls'>('lyrics')
  const [previewBeforeLive, setPreviewBeforeLive] = useState(() => {
    try { return localStorage.getItem(previewPreferenceKey) === 'true' } catch { return false }
  })
  const [continuousSchedule, setContinuousSchedule] = useState(() => {
    try { return localStorage.getItem(continuousScheduleKey) === 'true' } catch { return false }
  })
  const hasPresentedCue = useRef(false)
  const liveSlideButton = useRef<HTMLButtonElement>(null)
  const [preparedCue, setPreparedCue] = useState<PreparedCue>()
  const [keyboardProfile, setKeyboardProfile] = useState(readKeyboardProfile)
  const [textHidden, setTextHidden] = useState(false)
  const [foregroundCleared, setForegroundCleared] = useState(false)
  const clearedRef = useRef(false)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const [alternateBlanked, setAlternateBlanked] = useState(false)
  const [nextLines, setNextLines] = useState<0 | 1 | 2>(foldback.nextLines ?? 2)
  const [liveLyrics, setLiveLyrics] = useState<string[]>([])
  const [liveSubtitle, setLiveSubtitle] = useState('')
  const [liveScripture, setLiveScripture] = useState<ScriptureReference>()
  const [liveMediaName, setLiveMediaName] = useState('')
  const [liveMedia, setLiveMedia] = useState<PresentationMedia | null>(null)
  const [liveSoundtrack, setLiveSoundtrack] = useState<ActiveSoundtrack | null>(null)
  const [liveDesign, setLiveDesign] = useState<SlideDesign | null>(null)
  const [liveBuildStep, setLiveBuildStep] = useState(0)
  const liveBuild = useRef(0)
  const embeddedAudioRun = useRef<string | undefined>(undefined)
  const transitionSoundState = useRef<PowerPointTransitionSoundState | undefined>(undefined)
  const liveScriptureLayout = useMemo(() => liveScripture && scriptureOutputLayout(liveScripture, scriptureSettings.live),
    [liveScripture, scriptureSettings.live])
  const livePreviewDesign = useMemo(() => liveDesign && liveScriptureLayout ? scriptureOutputDesign(liveDesign, liveScriptureLayout) : liveDesign,
    [liveDesign, liveScriptureLayout])
  const liveCaption = liveScriptureLayout?.reference ?? liveSubtitle
  const liveCaptionText = liveScriptureLayout?.referenceRuns ? <StyledTextRuns runs={liveScriptureLayout.referenceRuns} /> : liveCaption
  const liveCaptionSpacing = outputTextInsetsStyle(liveScriptureLayout?.referenceInsets)
  const liveOutput = liveScriptureLayout && scriptureOutputText(liveLyrics.join('\n'), liveScriptureLayout)
  const liveOutputLines = liveOutput ? liveOutput.text.split('\n') : liveLyrics
  const liveOutputRuns = liveOutput && lyricRunsByLine(liveOutput.text, liveOutput.runs)
  const [mediaPlayback, setLocalPlayback] = useState<PresentationPlayback | null>(null)
  const [playbackStatus, setPlaybackStatus] = useState('')
  const [windowStatus, setWindowStatus] = useState('')
  const [midiQueued, setMidiQueued] = useState<number>()
  const midiSelection = useRef<number | null | undefined>(undefined)
  const midiEmitter = useRef<MidiOutputEmitter | null>(null)
  const displayedSlide = useRef<MidiDisplayEvent | undefined>(undefined)
  const midiSnapshot = useCallback(() => displayedSlide.current, [])
  const publishMidi = useCallback((event: MidiOutputEvent, fromMidi = false) => {
    if (event.type === 'live' || event.type === 'overlay') displayedSlide.current = event
    midiEmitter.current?.(event, fromMidi)
  }, [])
  const requestVersion = useRef(0)
  const [slideAdvance] = useState(createSlideAdvanceController)
  const cameraRun = useRef('')
  const cameraInputs = useRef(new Map<string, CameraInput>())

  const currentSong = songs[store.currentSongIndex]
  const cueLyricLayout = currentSong?.cue?.kind === 'song' ? currentSong.cue.lyricLayout : undefined
  const hasSavedLayout = Boolean(currentSong?.cue || (currentSong?.song && !songUsesAutomaticLayout(currentSong.song)))
  const scheduleBlocks = useMemo(() => continuousSchedule
    ? songs.map((entry) => getPlaylistSlides(entry, store.lyricLayout, defaultThemes)) : undefined,
  [continuousSchedule, songs, store.lyricLayout, defaultThemes])
  const slidesFor = useCallback((cue: number) => scheduleBlocks?.[cue] ?? getPlaylistSlides(songs[cue], store.lyricLayout, defaultThemes),
    [scheduleBlocks, songs, store.lyricLayout, defaultThemes])
  const allBlocks = useMemo(() => slidesFor(store.currentSongIndex), [slidesFor, store.currentSongIndex])
  const preparedIndex = preparedCue?.playlistId === id ? songs.findIndex((entry) => entry.id === preparedCue?.entryId) : -1
  const preparedEntry = songs[preparedIndex]
  const preparedBlocks = useMemo(() => getPlaylistSlides(preparedEntry, store.lyricLayout, defaultThemes), [preparedEntry, store.lyricLayout, defaultThemes])
  const preparedSlide = Math.max(0, Math.min(preparedCue?.slide ?? 0, preparedBlocks.length - 1))
  const controlledMedia = liveSoundtrack?.media ?? liveMedia

  // Init BroadcastChannel on mount
  useEffect(() => {
    channelRef.current = createControlChannel(undefined, (status) => setPlaybackStatus(status ?? ''),
      (progress) => dispatchAlert('live', { type: 'progress', progress }), slideAdvance.report,
      () => setWindowStatus('ขึ้นจอแล้ว · บันทึกประวัติการฉายเพลงในเบราว์เซอร์ไม่สำเร็จ'))
    const stopInputs = () => {
      slideAdvance.cancel()
      channelRef.current?.stopLiveInputs()
      channelRef.current?.stopSoundtrack()
      dispatchAlert('live', { type: 'clear' })
      channelRef.current?.send({ type: 'SET_TEXT_HIDDEN', hidden: false })
      if (readOutputSettings().alphaSource === 'live') channelRef.current?.send({ type: 'SHOW_BLACK' })
    }
    window.addEventListener('pagehide', stopInputs)
    return () => {
      window.removeEventListener('pagehide', stopInputs)
      requestVersion.current++
      slideAdvance.cancel()
      if (readOutputSettings().alphaSource === 'live') channelRef.current?.send({ type: 'SHOW_BLACK' })
      channelRef.current?.send({ type: 'SET_TEXT_HIDDEN', hidden: false })
      channelRef.current?.close()
      channelRef.current = null
    }
  }, [dispatchAlert, slideAdvance])

  // Set playlist ID in store
  useEffect(() => {
    if (id) {
      requestVersion.current++
      slideAdvance.cancel()
      setPreparedCue(undefined)
      setTextHidden(false)
      setForegroundCleared(false)
      clearedRef.current = false
      hasPresentedCue.current = false
      liveBuild.current = 0
      setLiveBuildStep(0)
      channelRef.current?.send({ type: 'SET_TEXT_HIDDEN', hidden: false })
      channelRef.current?.send({ type: 'SET_FOREGROUND_CLEARED', cleared: false })
      trackSongProjection()
      if (usePresentationStore.getState().isShowingWelcome) channelRef.current?.stopLiveInputs()
      usePresentationStore.getState().setPlaylistId(id)
      if (readOutputSettings().alphaSource === 'live') channelRef.current?.send({ type: 'SHOW_BLACK' })
      midiSelection.current = undefined
      displayedSlide.current = undefined
      setMidiQueued(undefined)
    }
  }, [id, slideAdvance, trackSongProjection])

  useEffect(() => {
    if (!id) return
    const foldback = createFoldbackControl(`${id}:${controlSession}`, (progress) => dispatchAlert('stage', { type: 'progress', progress }))
    const alternate = createControlChannel(controlSession, undefined, (progress) => dispatchAlert('alternate', { type: 'progress', progress }))
    foldbackRef.current = foldback
    alternateRef.current = alternate
    alternateLogoActive.current = false
    setAlternateBlanked(false)
    // A named output window can stay open when the operator switches playlists.
    alternate.send({ type: 'SET_OUTPUT_BLANKED', blanked: false })
    alternate.send({ type: 'CLEAR_ALERT' })
    const clearOutput = () => alternate.send({ type: 'SHOW_BLACK' })
    window.addEventListener('pagehide', clearOutput)
    dispatchAlert('stage', { type: 'clear' })
    dispatchAlert('alternate', { type: 'clear' })
    return () => {
      foldbackRef.current = null
      alternateRef.current = null
      foldback.close()
      window.removeEventListener('pagehide', clearOutput)
      clearOutput()
      alternate.close()
    }
  }, [id, controlSession, dispatchAlert])

  useEffect(() => {
    const count = foldback.nextLines ?? 2
    setNextLines(count)
    foldbackRef.current?.publish({ nextLines: count })
  }, [id, controlSession, foldback.nextLines])

  /** Send a message to the presenter window */
  const send = useCallback((msg: PresentationMessage) => {
    if (msg.type === 'SHOW_BLACK' || msg.type === 'SHOW_WELCOME') transitionSoundState.current = undefined
    channelRef.current?.send(msg)
    if (msg.type === 'SET_BACKGROUND' || msg.type === 'SET_TEXT_POSITION' || msg.type === 'SET_TEXT_HIDDEN' || msg.type === 'SET_MEDIA_PLAYBACK') {
      alternateRef.current?.send(msg)
    }
  }, [])

  const setClear = useCallback((cleared: boolean) => {
    if (clearedRef.current === cleared) return
    clearedRef.current = cleared
    setForegroundCleared(cleared)
    send({ type: 'SET_FOREGROUND_CLEARED', cleared })
  }, [send])

  useEffect(() => {
    function syncKeyboard(event: StorageEvent) {
      if (event.key !== keyboardProfileStorageKey && event.key !== null) return
      setKeyboardProfile(readKeyboardProfile())
      setTextHidden(false)
      send({ type: 'SET_TEXT_HIDDEN', hidden: false })
    }
    window.addEventListener('storage', syncKeyboard)
    return () => window.removeEventListener('storage', syncKeyboard)
  }, [send])

  useEffect(() => { void loadOutputDisplays() }, [])

  const openDisplay = useCallback((output: OutputWindow, path: string, name: string) => {
    setWindowStatus('')
    const label = outputLabels[output]
    const opened = openOutputWindow(output, path, name, (warning) => {
      const messages = {
        unsupported: `เปิด${label}แล้ว ลากหน้าต่างไปยังจอที่ต้องการได้`,
        access: `เปิด${label}ในตำแหน่งปกติ เปิดสิทธิ์จัดการหน้าต่างในหน้าตั้งค่าจอเพื่อเลือกจอจริง`,
        missing: `เปิด${label}ในตำแหน่งปกติ ตรวจจอที่เชื่อมต่อในหน้าตั้งค่าจอ`,
        reposition: `เปิด${label}แล้ว ลากหน้าต่างไปยังจอที่ต้องการ`,
      }
      setWindowStatus(warning ? messages[warning] : '')
    })
    if (!opened) setWindowStatus(`กรุณาอนุญาตหน้าต่างป๊อปอัปเพื่อเปิด${label}`)
  }, [])

  const openPresenter = useCallback(() => {
    openDisplay('live', `/presenter?keyboard=${controlSession}`, 'worshipteam-presenter')
  }, [controlSession, openDisplay])

  const openFoldback = () => {
    openDisplay('stage', `/playlists/${id}/foldback?session=${controlSession}`, 'worshipteam-foldback')
  }

  const openAlternate = () => {
    openDisplay('alternate', `/presenter?output=alternate&session=${controlSession}`, 'worshipteam-alternate')
  }

  function openAlphaKey() {
    if (!alphaSource) return
    const query = new URLSearchParams({ signal: 'key' })
    if (alphaSource === 'alternate') {
      query.set('output', 'alternate')
      query.set('session', controlSession)
    }
    openDisplay('key', `/presenter?${query}`, 'worshipteam-alpha-key')
  }

  function toggleAlternate() {
    const blanked = !alternateBlanked
    setAlternateBlanked(blanked)
    alternateRef.current?.send({ type: 'SET_OUTPUT_BLANKED', blanked })
  }

  const showBlock = useCallback(async function presentBlock(blocks: PlaylistSlide[], index: number, entry: PlaylistSong | undefined,
    { restart, fromMidi, followMaster, cueIndex, cleared = false, buildStep = 0 }: ShowBlockOptions = {},
  ) {
    const version = ++requestVersion.current
    slideAdvance.cancel()
    setPlaybackStatus('')
    const source = blocks[index]
    if (!source) return
    const buildLength = powerPointBuildLength(source.design)
    const step = Math.min(buildStep, buildLength)
    const active = usePresentationStore.getState()
    const withinBuild = buildLength > 0 && index === active.currentBlockIndex
      && (cueIndex === undefined || cueIndex === active.currentSongIndex) && step !== liveBuild.current
    const visibility = source.design && buildLength ? powerPointDesignAtStep(source.design, step) : undefined
    const cut = withinBuild ? { uid: '', values: {} } : undefined
    const block = visibility ? { ...source, design: visibility, lines: designTextLines(visibility), transition: cut ?? source.transition } : source
    const runId = restart || block.playback?.restart || block.playback?.mode === 'media' ? crypto.randomUUID() : undefined

    const embedded = powerPointSoundtrackAssets(block.design)
    const embeddedRun = withinBuild && !restart && embeddedAudioRun.current ? embeddedAudioRun.current : crypto.randomUUID()
    const audioAssets = [...block.assets?.filter((asset) => asset.kind === 'audio') ?? [], ...embedded ?? []]
    let soundtrack: ActiveSoundtrack | undefined
    for (const asset of audioAssets) {
      const continuous = asset.role === 'background' && entry?.cue?.kind !== 'audio'
      const candidate = localCueMedia('audio', asset, id, runId ?? (embedded?.includes(asset) ? embeddedRun : continuous ? entry?.id : crypto.randomUUID()))
      if (!candidate) continue
      const available = await hasLocalMedia(candidate)
      if (version !== requestVersion.current) return
      if (available) {
        soundtrack = { media: { ...candidate, repeat: asset.repeat }, filename: asset.filename }
        break
      }
    }
    const missingAudio = !soundtrack && audioAssets[0] ? missingMediaMessage(audioAssets[0]) : ''

    function publishMedia(media?: PresentationMedia) {
      setLiveMedia(media ?? null)
      setLiveSoundtrack(soundtrack ?? null)
      const controlled = soundtrack?.media ?? media
      const key = controlled && presentationMediaKey(controlled)
      setLocalPlayback((current) => {
        if (!controlled || !key) return null
        return current?.key === key ? current : { key, playing: true, muted: defaultMediaMuted(controlled) }
      })
    }

    function publishFoldback(design?: SlideDesign, media?: PresentationMedia) {
      const isTextCue = !entry?.cue || entry.cue.kind === 'song' || entry.cue.kind === 'scripture'
      const subject = playlistThemeSubject(entry)
      const textRole = subject === 'song' || subject === 'scripture' ? subject : undefined
      const lines = block.lines.filter((line) => line.trim())
      const textSamples = textRole && blocks.length > 1
        ? blocks.map((slide) => slide.lines.filter((line) => line.trim())).filter((sample) => sample.length > 0) : undefined
      const showTextOnly = isTextCue && lines.length > 0
      let stageMedia: FoldbackSlide['media']
      if (media?.kind === 'image' || media?.kind === 'video') stageMedia = { ...media, kind: media.kind }
      if (!showTextOnly && media?.kind === 'web') stageMedia = media
      if (!showTextOnly && media?.kind === 'camera') {
        stageMedia = { kind: 'camera', deviceId: media.deviceId, feedVideo: media.feedVideo, role: media.role, runId: media.runId }
      }
      const nextBuild = source.design && step < buildLength ? powerPointDesignAtStep(source.design, step + 1) : undefined
      foldbackRef.current?.publish({
        slide: {
          title: entry?.cue?.label || entry?.song?.title || block.sectionLabel,
          subtitle: block.subtitle,
          speakerNotes: block.speakerNotes,
          cueNotes: visibleNote(entry?.cue?.metadata?.notes),
          textRole,
          textSamples,
          lines,
          design: showTextOnly ? undefined : design,
          media: stageMedia,
          videoPlayback: block.playback && { runId, loop: block.playback.loop || (block.playback.mode === 'media' ? false : undefined) },
        },
        audience: cleared ? 'clear' : 'live',
        next: nextBuild ? { label: block.sectionLabel, lines: designTextLines(nextBuild).slice(0, 2) }
          : getFoldbackNext(blocks, index, entry, songs, usePresentationStore.getState().lyricLayout),
        playing: true,
      })
    }

    function publishCue(msg: Extract<PresentationMessage, { type: 'SHOW_DESIGN' | 'SHOW_LYRICS' }>, selectedAsset?: PlaylistCueAsset) {
      hasPresentedCue.current = true
      liveBuild.current = step
      embeddedAudioRun.current = embeddedRun
      transitionSoundState.current = advancePowerPointTransitionSound(transitionSoundState.current, entry?.id, index, block.design, id, restart)
      const transitionSound = transitionSoundState.current?.sound
      setLiveBuildStep(step)
      const completionId = !followMaster && step === buildLength ? slideAdvance.start(getSlideAdvance(blocks, index, playlistCueLooping(entry)), (next) => {
        if (version === requestVersion.current) void presentBlock(blocks, next, entry, { fromMidi })
      }, (reason) => setPlaybackStatus(reason === 'failed' ? 'สื่อเล่นไม่จบ กรุณาเลือกสไลด์ถัดไปเอง'
        : 'สไลด์นี้ไม่มีเสียงหรือวิดีโอให้รอจบ กรุณาเลือกสไลด์ถัดไปเอง')) : undefined
      const missingVideo = msg.type === 'SHOW_LYRICS' && msg.media?.kind !== 'video' && block.assets?.some((asset) => asset.kind === 'video')
      if (completionId && (missingAudio || missingVideo)) slideAdvance.report(completionId, 'failed')
      const cuePlayback = block.playback ? { completionId, runId, once: block.playback.mode === 'media', loop: block.playback.loop } : undefined
      const songProjection = trackSongProjection(entry?.id, entry && playlistSongProjection(entry))
      const subject = playlistThemeSubject(entry)
      const songLabel = subject === 'song' ? songOutputLabel(block.sectionLabel) : undefined
      setLiveScripture(block.scripture)
      if (cleared) setClear(true)
      send({ ...msg, transition: block.transition, transitionSound, cuePlayback, songProjection, songLabel, scripture: block.scripture })
      if (!cleared) setClear(false)
      if (!withinBuild) publishMidi({ type: 'live', cue: usePresentationStore.getState().currentSongIndex, slide: index }, fromMidi)
      if (cleared) publishMidi({ type: 'overlay', mode: 'clear' }, fromMidi)
      const mediaOverride = msg.media && (entry?.cue?.kind !== msg.media.kind || selectedAsset === entry?.background_asset)
        ? msg.media.role ?? 'foreground' : undefined
      const alternateTheme = subject && chooseDefaultThemeSlide(defaultThemes, 'alternate', subject, block.template ?? block.sectionLabel)
      if (alternateTheme) {
        const template = alternateTheme.design
        const themedDesign = subject === 'presentation' && block.design
          ? alternatePresentationDesign(defaultThemes, block.template, block.sectionLabel, block.design)
          : subject === 'song' ? carrySongArtwork(applySongLyricRuns(template, block.lines.join('\n'), block.lyricRuns), block.design)
            : subject === 'scripture' && entry?.cue?.scriptureFlow ? scriptureFlowDesign(block.lines.join('\n'), template, block.lyricRuns)
            : applySongLyricRuns(template, block.lines.join('\n'), block.lyricRuns)
        const baseDesign = block.songElementEffects?.length ? {
          ...themedDesign, layers: applySongElementEffects(themedDesign.layers, block.songElementEffects),
        } : themedDesign
        const background = entry?.background_asset
        const hasBackgroundOverride = Boolean(background && msg.type === 'SHOW_DESIGN'
          && msg.design.layers.some((layer) => layer.id === 'playlist-background'))
        const design = background && hasBackgroundOverride ? withDesignBackground(baseDesign, background) : baseDesign
        alternateLogoActive.current = false
        alternateRef.current?.send({
          type: 'SHOW_DESIGN', playlistId: id, design, background: msg.background, media: msg.media, soundtrack: msg.soundtrack, overlayMedia: Boolean(msg.media),
          transition: cut ?? resolveSlideTransition(block.localTransition, alternateTheme.transition), transitionSound, cuePlayback,
          songLabel, scripture: block.scripture,
          alternate: {
            mediaOverride,
            designBackgroundOverride: hasBackgroundOverride,
            originalDesign: { design: baseDesign, playlistId: id },
          },
        })
        return
      }
      const originalDesign = block.design && (msg.type === 'SHOW_LYRICS' || block.design !== msg.design)
        ? { design: block.design, playlistId: id } : undefined
      alternateLogoActive.current = false
      alternateRef.current?.send({
        ...msg,
        transition: block.transition, transitionSound, cuePlayback,
        songLabel, scripture: block.scripture,
        alternate: {
          mediaOverride, originalDesign,
          designBackgroundOverride: Boolean(originalDesign && msg.type === 'SHOW_DESIGN' && !msg.media),
        },
      })
    }

    function publishDesign(design: SlideDesign, media?: PresentationMedia, selectedAsset?: PlaylistCueAsset, overlayMedia?: boolean) {
      usePresentationStore.getState().setBlockIndex(index, cueIndex)
      setLiveDesign(design)
      setLiveMediaName(selectedAsset?.filename ?? soundtrack?.filename ?? '')
      publishMedia(media)
      publishCue({
        type: 'SHOW_DESIGN', design, playlistId: id, media, soundtrack: soundtrack?.media, overlayMedia,
        background: usePresentationStore.getState().videoBackground?.url,
      }, selectedAsset)
      publishFoldback(design, media)
    }

    const hasLiveSource = block.assets?.some((asset) => asset.kind === 'camera' || asset.kind === 'web'
      || (block.defaultTheme && (asset.kind === 'image' || asset.kind === 'video') && asset !== entry?.background_asset))
    if (block.design && !hasLiveSource) {
      let design = block.design
      setPlaybackStatus(missingAudio)
      const background = entry?.background_asset
      if (background?.libraryId) {
        const blob = await readLibraryMedia(background.libraryId).catch(() => null)
        if (version !== requestVersion.current) return
        if (blob) design = withDesignBackground(design, background)
        else setPlaybackStatus(`ไม่พบไฟล์ ${background.filename} ในเบราว์เซอร์นี้ ให้นำเข้าไฟล์เดิมในคลังสื่อ`)
      }
      publishDesign(design)
      return
    }

    const assets = block.assets?.filter((item) => item.kind === 'camera' || item.kind === 'web'
      || ((item.archivePath || item.libraryId || item.dvd) && (item.kind === 'image' || item.kind === 'video'))) ?? []
    const candidates = [...assets.filter((item) => item.role === 'background'), ...assets.filter((item) => item.role !== 'background')]
    let media: PresentationMedia | undefined
    let selectedAsset: PlaylistCueAsset | undefined
    let filename = ''
    let problem = ''

    if (candidates.length) setPlaybackStatus('กำลังเตรียมสื่อ…')
    for (const asset of candidates) {
      if (asset.kind === 'web') {
        const url = presentationWebUrl(asset.url ?? asset.filename)
        if (!url) {
          problem = 'ที่อยู่เว็บนี้ใช้ไม่ได้ กรุณาใช้ URL แบบ HTTPS หรือ HTTP'
          continue
        }
        media = { kind: 'web', url, role: asset.role, hideScrollbars: asset.hideScrollbars, runId: crypto.randomUUID() }
        selectedAsset = asset
        filename = asset.filename
        break
      }
      if (asset.kind === 'camera') {
        const inputKey = id && cameraInputKey(id, asset)
        const camera = inputKey && (savedCameraInput(inputKey) ?? cameraInputs.current.get(inputKey))
        if (!camera) {
          problem = window.worshipNdiInput ? `เลือกกล้องหรือแหล่ง NDI เพื่อแสดง ${asset.filename}`
            : `เลือกกล้องบนเครื่องนี้เพื่อแสดง ${asset.filename}`
          continue
        }
        cameraRun.current ||= crypto.randomUUID()
        media = { kind: 'camera', ...camera, role: asset.role, runId: cameraRun.current, feedVideo: asset.feedVideo }
        selectedAsset = asset
        filename = asset.filename
        break
      }
      if (asset.kind !== 'image' && asset.kind !== 'video') continue
      const { kind, role } = asset
      const activeRun = runId ?? (role === 'background' ? undefined : crypto.randomUUID())
      const candidate = localCueMedia(kind, asset, id, activeRun)
      if (!candidate) {
        if (asset.dvd) problem = `เลือกวิดีโอแทนคลิป DVD ${asset.dvd.name}`
        continue
      }
      const available = await hasLocalMedia(candidate)
      if (version !== requestVersion.current) return
      if (!available) continue
      media = candidate
      selectedAsset = asset
      filename = asset.filename
      break
    }

    const requestedAsset = candidates[0]
    if (!problem && !media && requestedAsset) problem = missingMediaMessage(requestedAsset)
    if (!problem && media?.kind === 'camera') {
      problem = ndiDeviceName(media.deviceId) ? 'กำลังเปิดแหล่ง NDI บนจอผู้ชม' : 'กำลังเปิดกล้องบนจอผู้ชม'
    }
    if (!problem && !missingAudio && !media && !soundtrack && !block.lines.some((line) => line.trim())) {
      problem = 'รายการนี้ไม่มีข้อความหรือสื่อที่เปิดบนจอได้'
    }
    setPlaybackStatus([problem, missingAudio].filter(Boolean).join(' · '))

    if (block.design && !media) {
      publishDesign(block.design)
      return
    }
    if (block.design && block.defaultTheme && (media?.kind === 'image' || media?.kind === 'video')) {
      publishDesign(block.design, media, selectedAsset, true)
      return
    }
    if (block.design && media?.role === 'background' && (media.kind === 'camera' || media.kind === 'web')) {
      publishDesign(withoutCanvasBackground(block.design), media, selectedAsset)
      return
    }
    usePresentationStore.getState().setBlockIndex(index, cueIndex)
    setLiveDesign(null)
    setLiveLyrics(block.lines)
    setLiveSubtitle(block.subtitle ?? '')
    setLiveMediaName(filename || soundtrack?.filename || '')
    publishMedia(media)
    publishCue({
      type: 'SHOW_LYRICS', lyrics: block.lines.join('\n'), lyricRuns: block.lyricRuns, subtitle: block.subtitle,
      background: usePresentationStore.getState().videoBackground?.url, media, soundtrack: soundtrack?.media,
    }, selectedAsset)
    publishFoldback(undefined, media)
  }, [id, send, setClear, songs, defaultThemes, slideAdvance, publishMidi, trackSongProjection])

  const setMediaPlayback = useCallback((updates: { playing?: boolean; muted?: boolean }, fromMidi = false) => {
    if (!controlledMedia) return
    const key = presentationMediaKey(controlledMedia)
    setLocalPlayback((current) => current?.key === key ? { ...current, ...updates } : current)
    send({ type: 'SET_MEDIA_PLAYBACK', key, ...updates })
    if (updates.playing !== undefined) {
      publishMidi({ type: 'playback', playing: updates.playing }, fromMidi)
      if (controlledMedia.kind === 'video') foldbackRef.current?.publish({ playing: updates.playing })
    }
  }, [controlledMedia, send, publishMidi])

  const selectSong = useCallback(
    (index: number, slide = 0) => {
      const entry = songs[index]
      const blocks = getPlaylistSlides(entry, store.lyricLayout, defaultThemes)
      if (!blocks[slide]) return
      midiSelection.current = undefined
      setMidiQueued(undefined)
      if (!previewBeforeLive) setPreparedCue(undefined)
      setActiveTab('lyrics')
      void showBlock(blocks, slide, entry, { cueIndex: index })
    },
    [songs, store.lyricLayout, showBlock, defaultThemes, previewBeforeLive],
  )

  function prepareSong(index: number) {
    if (!id || !songs[index]) return
    setPreparedCue({ playlistId: id, entryId: songs[index].id, slide: 0 })
    setActiveTab('lyrics')
  }

  function changePreviewPreference(enabled: boolean) {
    setPreviewBeforeLive(enabled)
    if (!enabled) setPreparedCue(undefined)
    try { localStorage.setItem(previewPreferenceKey, String(enabled)) } catch { /* Use the current session's setting. */ }
  }

  function changeContinuousSchedule(enabled: boolean) {
    setContinuousSchedule(enabled)
    try { localStorage.setItem(continuousScheduleKey, String(enabled)) } catch { /* Use the current session's setting. */ }
  }

  const selectPreparedSlide = useCallback((index: number) => {
    if (index < 0 || index >= preparedBlocks.length) return
    setPreparedCue((current) => current && { ...current, slide: index })
  }, [preparedBlocks.length])

  useEffect(() => {
    if (activeTab === 'lyrics' && preparedIndex >= 0) {
      previewHeading.current?.focus({ preventScroll: true })
      previewHeading.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeTab, preparedIndex])

  // Block change
  const selectBlock = useCallback(
    (index: number, buildStep = 0) => { void showBlock(allBlocks, index, currentSong, { buildStep }) },
    [allBlocks, currentSong, showBlock],
  )

  function liveStep(direction: 1 | -1) {
    const state = usePresentationStore.getState()
    if (!id || state.currentPlaylistId !== id) return undefined
    if (continuousSchedule && !hasPresentedCue.current) {
      return direction === 1
        ? stepScheduleSlide(slidesFor, songs.length, { cue: -1, index: -1, step: 0 }, direction, true) : undefined
    }
    return stepScheduleSlide(slidesFor, songs.length,
      { cue: state.currentSongIndex, index: state.currentBlockIndex, step: liveBuild.current }, direction, continuousSchedule)
  }

  async function stepBlock(direction: 1 | -1, fromMidi = false) {
    const next = liveStep(direction)
    if (!next) return
    if (next.cue !== usePresentationStore.getState().currentSongIndex && !fromMidi) {
      midiSelection.current = undefined
      setMidiQueued(undefined)
    }
    await showBlock(next.blocks, next.index, songs[next.cue], { cueIndex: next.cue, buildStep: next.step, fromMidi })
  }

  useEffect(() => {
    if (!continuousSchedule || activeTab !== 'lyrics') return
    if (document.activeElement?.closest('[data-live-slide]')) liveSlideButton.current?.focus({ preventScroll: true })
    liveSlideButton.current?.scrollIntoView({ block: 'nearest' })
  }, [continuousSchedule, activeTab, store.currentSongIndex, store.currentBlockIndex])

  // Welcome / Black
  const showWelcome = useCallback((fromMidi = false) => {
    requestVersion.current++
    slideAdvance.cancel()
    setPlaybackStatus('')
    setLiveMedia(null)
    setLiveSoundtrack(null)
    setLocalPlayback(null)
    store.showWelcome()
    const logo = defaultThemes['live:logo'] ?? undefined
    setPresentedLogo(logo)
    const welcome = { type: 'SHOW_WELCOME', runId: crypto.randomUUID(), welcomeImageUrl: store.welcomeImageUrl,
      background: store.videoBackground?.url } as const
    send({ ...welcome, logo })
    setClear(false)
    const alternateLogo = defaultThemes['alternate:logo']
    if (alternateLogo) {
      alternateLogoActive.current = true
      alternateRef.current?.send({ ...welcome, logo: alternateLogo })
    }
    foldbackRef.current?.publish({ audience: 'welcome' })
    publishMidi({ type: 'overlay', mode: 'welcome' }, fromMidi)
  }, [store, send, slideAdvance, publishMidi, setClear, defaultThemes])

  const showBlack = useCallback((fromMidi = false) => {
    requestVersion.current++
    slideAdvance.cancel()
    setPlaybackStatus('')
    setLiveMedia(null)
    setLiveSoundtrack(null)
    setLocalPlayback(null)
    store.showBlack()
    send({ type: 'SHOW_BLACK' })
    setClear(false)
    if (alternateLogoActive.current) {
      alternateLogoActive.current = false
      alternateRef.current?.send({ type: 'SHOW_BLACK' })
    }
    foldbackRef.current?.publish({ audience: 'black' })
    publishMidi({ type: 'overlay', mode: 'black' }, fromMidi)
  }, [send, slideAdvance, publishMidi, setClear])

  const clearLyrics = (cleared: boolean, fromMidi = false) => {
    if (clearedRef.current === cleared) return
    const state = usePresentationStore.getState()
    const isOverlay = state.isShowingWelcome || state.isBlacked
    const hadCue = Boolean(liveDesign || liveLyrics.length || liveMediaName || liveSubtitle)
    if (cleared && (isOverlay || !hadCue)) {
      if (isOverlay && hadCue && allBlocks[state.currentBlockIndex]) {
        void showBlock(allBlocks, state.currentBlockIndex, currentSong, { cleared: true, fromMidi, buildStep: liveBuild.current })
        return
      }
      store.showLyrics()
      send({ type: 'SHOW_LYRICS', lyrics: '', background: store.videoBackground?.url })
      if (alternateLogoActive.current) {
        alternateLogoActive.current = false
        alternateRef.current?.send({ type: 'SHOW_LYRICS', lyrics: '' })
      }
    }
    setClear(cleared)
    foldbackRef.current?.publish({ audience: cleared ? 'clear' : 'live' })
    if (cleared) publishMidi({ type: 'overlay', mode: 'clear' }, fromMidi)
    else {
      displayedSlide.current = hadCue ? { type: 'live', cue: state.currentSongIndex, slide: state.currentBlockIndex } : undefined
      publishMidi({ type: 'overlayOff', mode: 'clear' }, fromMidi)
    }
  }

  function standardKeyboard(event: KeyboardEvent) {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.key === 'Escape') navigate('/playlists')
    else if (event.key.toLowerCase() === 'p') openPresenter()
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const step = event.key === 'ArrowRight' ? 1 : -1
      if (continuousSchedule) {
        event.preventDefault()
        void stepBlock(step)
      } else if (previewBeforeLive) {
        if (preparedIndex < 0) return
        event.preventDefault()
        selectPreparedSlide(preparedSlide + step)
      } else stepBlock(step)
    }
  }

  function importedKeyboard(action: KeyboardAction, number?: number) {
    if (!id || usePresentationStore.getState().currentPlaylistId !== id) return
    const { currentSongIndex, currentBlockIndex, isBlacked, isShowingWelcome } = usePresentationStore.getState()
    const display = displayedSlide.current
    function nearbyCue(start: number, step: number) {
      for (let index = start + step; index >= 0 && index < songs.length; index += step) {
        if (songs[index].song || songs[index].cue) return index
      }
    }
    if (number !== undefined) {
      const index = keyboardJumpIndex(allBlocks, action, number)
      if (index >= 0) selectBlock(index)
      return
    }
    switch (action) {
      case 'nextCue':
      case 'previousCue': {
        const index = nearbyCue(preparedIndex >= 0 ? preparedIndex : currentSongIndex, action === 'nextCue' ? 1 : -1)
        if (index !== undefined) prepareSong(index)
        return
      }
      case 'goLive':
        if (preparedIndex >= 0) {
          selectSong(preparedIndex, preparedSlide)
          setPreparedCue(undefined)
        } else if (display?.type === 'live') {
          const next = nearbyCue(currentSongIndex, 1)
          if (next !== undefined) selectSong(next)
        } else {
          selectBlock(currentBlockIndex)
        }
        return
      case 'nextSlide': stepBlock(1); return
      case 'previousSlide': stepBlock(-1); return
      case 'firstSlide': selectBlock(0); return
      case 'lastSlide': selectBlock(allBlocks.length - 1); return
      case 'black': if (isBlacked) selectBlock(currentBlockIndex, liveBuild.current); else showBlack(); return
      case 'clear':
        clearLyrics(!clearedRef.current)
        return
      case 'welcome':
        if (!isShowingWelcome) showWelcome()
        else if (allBlocks[currentBlockIndex]) selectBlock(currentBlockIndex, liveBuild.current)
        else showBlack()
        return
    }
  }

  const keyboardJump = usePresentationKeyboard(controlSession, keyboardProfile, importedKeyboard, standardKeyboard)

  /** Adjust vertical position of lyrics text (0 = top, 50 = center, 100 = bottom) */
  const setTextPosition = useCallback(
    (offset: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(offset)))
      store.setTextVerticalOffset(clamped)
      send({ type: 'SET_TEXT_POSITION', offset: clamped })
    },
    [store, send],
  )

  const changeBackground = useCallback(
    (url: string) => {
      const bg = backgrounds.find((b) => b.url === url) ?? null
      store.setVideoBackground(bg)
      send({ type: 'SET_BACKGROUND', url })
    },
    [backgrounds, store, send],
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (error || !playlist) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', marginBottom: 'var(--space-md)', color: 'var(--status-error-text)' }}>{error ?? 'Playlist not found'}</p>
          <button
            onClick={() => navigate('/playlists')}
            style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', textDecoration: 'underline' }}
          >
            ← Back to playlists
          </button>
        </div>
      </div>
    )
  }

  function remoteSnapshot(): RemoteSnapshot {
    const state = usePresentationStore.getState()
    const entry = songs[state.currentSongIndex]
    const blocks = getPlaylistSlides(entry, state.lyricLayout, defaultThemes)
    const output = state.isBlacked ? 'black' : state.isShowingWelcome ? 'welcome' : clearedRef.current ? 'clear'
      : liveLyrics.length || liveDesign || liveMedia || liveSoundtrack ? 'live' : 'clear'
    return {
      title: playlist?.name ?? '',
      cues: songs.flatMap((item, index) => item.cue || item.song
        ? [{ index, title: item.cue?.label || item.song?.title || `รายการ ${index + 1}` }] : []),
      cue: state.currentSongIndex,
      slide: state.currentBlockIndex,
      slides: blocks.map((block) => block.subtitle || block.sectionLabel),
      lines: output === 'live' ? (liveDesign && powerPointBuildLength(blocks[state.currentBlockIndex]?.design)
        ? designTextLines(liveDesign) : blocks[state.currentBlockIndex]?.lines ?? []) : [],
      output,
    }
  }

  async function executeRemote(command: RemoteCommand) {
    const state = usePresentationStore.getState()
    if (!id || state.currentPlaylistId !== id) return false
    if (command.type === 'black') { showBlack(); return true }

    let cue = state.currentSongIndex
    let slide = state.currentBlockIndex
    let buildStep = command.type === 'resume' ? liveBuild.current : 0
    let blocks = slidesFor(cue)
    if (command.type === 'cue') {
      cue = command.index
      slide = 0
      blocks = slidesFor(cue)
    } else if (command.type === 'slide') {
      if (command.cue !== cue) return false
      slide = command.index
    } else if (command.type === 'step') {
      const next = stepScheduleSlide(slidesFor, songs.length, { cue, index: slide, step: liveBuild.current }, command.delta, true)
      if (!next) return false
      cue = next.cue
      slide = next.index
      buildStep = next.step
      blocks = next.blocks
    }

    if (!blocks[slide]) return false
    if (cue !== state.currentSongIndex) {
      midiSelection.current = undefined
      setMidiQueued(undefined)
    }
    const nextVersion = requestVersion.current + 1
    await showBlock(blocks, slide, songs[cue], { cueIndex: cue, buildStep })
    return nextVersion === requestVersion.current
  }

  async function executeMidi(action: MidiAction, value: number, followMaster: boolean) {
    const state = usePresentationStore.getState()
    if (!id || state.currentPlaylistId !== id) return

    function queue(index: number) {
      const available = Boolean(songs[index]?.song || songs[index]?.cue)
      midiSelection.current = available ? index : null
      setMidiQueued(available ? index : undefined)
    }

    async function present(cue: number, slide: number, restart = false) {
      const entry = songs[cue]
      const blocks = getPlaylistSlides(entry, state.lyricLayout, defaultThemes)
      if (!blocks[slide]) return
      await showBlock(blocks, slide, entry, { restart, fromMidi: true, followMaster, cueIndex: cue })
    }

    const cue = state.currentSongIndex
    const slide = state.currentBlockIndex
    const selected = midiSelection.current === undefined ? cue : midiSelection.current
    switch (action) {
      case 'nextCue':
      case 'previousCue': {
        const step = action === 'nextCue' ? 1 : -1
        for (let index = (selected ?? cue) + step; index >= 0 && index < songs.length; index += step) {
          if (songs[index].song || songs[index].cue) { queue(index); break }
        }
        return
      }
      case 'cueNumber': queue(value - 1); return
      case 'nextSlide': return continuousSchedule && !followMaster ? stepBlock(1, true) : present(cue, slide + 1)
      case 'previousSlide': return continuousSchedule && !followMaster ? stepBlock(-1, true) : present(cue, slide - 1)
      case 'goLive': if (selected !== null) await present(selected, 0); return
      case 'slideNumber': if (selected !== null) await present(selected, value - 1); return
      case 'restartSlide': return present(cue, slide, true)
      case 'blackOn': showBlack(true); return
      case 'blackOff': if (state.isBlacked) await present(cue, slide); return
      case 'welcomeOn': showWelcome(true); return
      case 'welcomeOff': if (state.isShowingWelcome) await present(cue, slide); return
      case 'clearOn': clearLyrics(true, true); return
      case 'clearOff': clearLyrics(false, true); return
      case 'play': setMediaPlayback({ playing: true }, true); return
      case 'pause': setMediaPlayback({ playing: false }, true); return
      case 'playPause': setMediaPlayback({ playing: !mediaPlayback?.playing }, true); return
    }
  }

  const currentSectionName = allBlocks[store.currentBlockIndex]?.sectionLabel ?? 'Select a slide'
  const activeBlock = allBlocks[store.currentBlockIndex]
  const liveBuildLength = powerPointBuildLength(activeBlock?.design)
  const showBuildControls = Boolean(liveDesign && allBlocks.some((block) => powerPointBuildLength(block.design)))
  const currentDvds = assignableDvdClips(activeBlock?.design, activeBlock?.assets)
  const currentCamera = allBlocks[store.currentBlockIndex]?.assets?.find((asset) => asset.kind === 'camera')
  const currentCameraKey = id && currentCamera ? cameraInputKey(id, currentCamera) : undefined
  const liveFeedAudio = liveMedia?.kind === 'camera' && liveMedia.audioLevel !== undefined
  const visibleCues = scheduleBlocks?.flatMap((blocks, cue) => blocks.length ? [{ cue, blocks }] : [])
    ?? [{ cue: store.currentSongIndex, blocks: allBlocks }]

  return (
    <main style={{ display: 'flex', flex: 1, overflow: 'hidden', margin: 'calc(var(--space-3xl) * -1) calc(var(--space-lg) * -1)' }}>
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
        {/* Mobile Tab Navigation - hidden on desktop */}
        <div className="flex md:hidden" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
          <button
            onClick={() => setActiveTab('songs')}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              transition: 'color 150ms var(--ease-out)',
              color: activeTab === 'songs' ? 'var(--accent)' : 'var(--fg-tertiary)',
              borderBottom: activeTab === 'songs' ? '2px solid var(--accent)' : 'none',
            }}
          >
            รายการ
          </button>
          <button
            onClick={() => setActiveTab('lyrics')}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              transition: 'color 150ms var(--ease-out)',
              color: activeTab === 'lyrics' ? 'var(--accent)' : 'var(--fg-tertiary)',
              borderBottom: activeTab === 'lyrics' ? '2px solid var(--accent)' : 'none',
            }}
          >
            Lyrics
          </button>
          <button
            onClick={() => setActiveTab('controls')}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              transition: 'color 150ms var(--ease-out)',
              color: activeTab === 'controls' ? 'var(--accent)' : 'var(--fg-tertiary)',
              borderBottom: activeTab === 'controls' ? '2px solid var(--accent)' : 'none',
            }}
          >
            Controls
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left Panel - Songs List */}
          <div
            className={activeTab !== 'songs' ? 'hidden md:flex md:w-64 md:shrink-0' : 'md:flex md:w-64 md:shrink-0'}
            style={{ flexDirection: 'column', borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--fg-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                รายการนำเสนอ
              </h3>
              <label className="mt-2! flex items-start gap-2 text-sm text-[var(--fg-secondary)]">
                <input type="checkbox" className="mt-1!" checked={previewBeforeLive}
                  onChange={(event) => changePreviewPreference(event.target.checked)} />
                ดูตัวอย่างก่อนขึ้นจอ
              </label>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {songs.map((ps, idx) => {
                const song = ps.song
                const cue = ps.cue
                if (!song && !cue) return null
                return (
                  <button
                    key={ps.id}
                    data-cue-navigation
                    onClick={() => previewBeforeLive ? prepareSong(idx) : selectSong(idx)}
                    aria-current={idx === store.currentSongIndex || undefined}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-subtle)',
                      fontSize: '14px',
                      transition: 'background 150ms var(--ease-out)',
                      borderLeft: '2px solid transparent',
                      background: idx === store.currentSongIndex ? 'rgba(62, 207, 142, 0.08)' : 'transparent',
                      borderLeftColor: idx === store.currentSongIndex ? 'var(--accent)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (idx !== store.currentSongIndex) {
                        e.currentTarget.style.background = 'var(--bg-tertiary)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (idx !== store.currentSongIndex) {
                        e.currentTarget.style.background = 'transparent'
                      }
                    }}
                  >
                    <div style={{
                      color: 'var(--fg-primary)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {idx + 1}. {cue?.label ?? song?.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--fg-tertiary)', marginTop: '2px' }}>
                      {song?.artist ?? (cue ? CUE_LABELS[cue.kind] : 'เพลง')}
                      {idx === preparedIndex && <span className="ml-2! text-[var(--accent)]">ตัวอย่าง</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Center Panel - Lyrics Grid */}
          <div
            className={activeTab !== 'lyrics' ? 'hidden md:flex md:flex-1' : 'md:flex md:flex-1'}
            style={{ flexDirection: 'column', minWidth: 0 }}
          >
            <div style={{
              padding: '12px 24px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--fg-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {currentSong?.cue?.label ?? currentSong?.song?.title ?? 'เลือกรายการ'}
              </span>
              <button
                onClick={openPresenter}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  background: 'var(--accent)',
                  color: 'var(--bg-primary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 150ms var(--ease-out)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'oklch(0.65 0.15 160)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
              >
                {alphaSource === 'live' ? 'เปิดจอผู้ชม (Fill)' : 'Open Presenter'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border-subtle)] px-4 py-2 sm:px-6">
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={continuousSchedule}
                  onChange={(event) => changeContinuousSchedule(event.currentTarget.checked)} />
                เลื่อนต่อเนื่องทั้งเพลย์ลิสต์
              </label>
              {continuousSchedule && <div className="flex flex-wrap gap-2" role="group" aria-label="เลื่อนสไลด์ที่กำลังขึ้นจอ">
                <button type="button" className="btn-secondary" data-cue-navigation
                  disabled={!liveStep(-1)} onClick={() => { void stepBlock(-1) }}>สไลด์ก่อนหน้า</button>
                <button type="button" className="btn-secondary" data-cue-navigation
                  disabled={!liveStep(1)} onClick={() => { void stepBlock(1) }}>สไลด์ถัดไป</button>
              </div>}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {(previewBeforeLive || preparedIndex >= 0) && (
                <PresentationCuePreview title={preparedEntry?.cue?.label || preparedEntry?.song?.title} blocks={preparedBlocks}
                  index={preparedSlide} playlistId={id} background={preparedEntry?.background_asset ?? undefined}
                  cueNotes={visibleNote(preparedEntry?.cue?.metadata?.notes)}
                  scriptureSettings={scriptureSettings.live}
                  headingRef={previewHeading} onSlide={selectPreparedSlide}
                  onGoLive={() => selectSong(preparedIndex, preparedSlide)} onClear={() => setPreparedCue(undefined)} />
              )}
              <div className="mb-3! flex flex-wrap items-center gap-3">
                <button type="button" className="btn-secondary" onClick={openFoldback}>เปิดจอเวทีสด</button>
                <button type="button" className="btn-secondary" onClick={openAlternate}>
                  {alphaSource === 'alternate' ? 'เปิดจอถ่ายทอดสด (Fill)' : 'เปิดจอถ่ายทอดสด'}
                </button>
                {alphaSource && <button type="button" className="btn-secondary" onClick={openAlphaKey}>เปิดจอ Alpha Key</button>}
                <button type="button" className="btn-secondary" onClick={toggleAlternate}>
                  {alternateBlanked ? 'คืนภาพจอถ่ายทอดสด' : 'พักภาพจอถ่ายทอดสด'}
                </button>
                <Link to="/settings/output" target="_blank" rel="noopener" className="text-sm text-[var(--fg-secondary)] underline">ตั้งค่าจอ</Link>
                <Link to="/settings/themes" target="_blank" rel="noopener" className="text-sm text-[var(--fg-secondary)] underline">ธีมเริ่มต้นของจอ</Link>
                <Link to="/alerts" target="_blank" rel="noopener" className="text-sm text-[var(--fg-secondary)] underline">คลังข้อความแจ้งเตือน</Link>
              </div>
              {windowStatus && <p role="status" className="mb-3 text-sm text-[var(--fg-secondary)]">{windowStatus}</p>}
              {keyboardJump && <p role="status" className="mb-3 text-sm">{keyboardJump}</p>}
              {textHidden && <button type="button" className="btn-secondary mb-3!" onClick={() => {
                setTextHidden(false)
                send({ type: 'SET_TEXT_HIDDEN', hidden: false })
              }}>แสดงข้อความบนจออีกครั้ง</button>}
              <PresentationNdiControl session={controlSession} />
              <PresentationRemoteControl key={id} snapshot={remoteSnapshot} execute={executeRemote} />
              <PresentationKeyboardControl active={keyboardProfile} onApply={(profile) => {
                setKeyboardProfile(profile)
                setTextHidden(false)
                send({ type: 'SET_TEXT_HIDDEN', hidden: false })
              }} />
              {currentDvds.map((dvd) => <DvdReplacementControl key={dvd.id} dvd={dvd}
                onApply={() => selectBlock(store.currentBlockIndex, liveBuild.current)} />)}
              <PresentationMidiControl key={`midi:${id}`} execute={executeMidi} emitter={midiEmitter} snapshot={midiSnapshot}
                queued={midiQueued === undefined ? undefined : songs[midiQueued]?.cue?.label ?? songs[midiQueued]?.song?.title} />
              {playbackStatus && <p role="status" className="mb-3 text-sm text-[var(--fg-secondary)]">{playbackStatus}</p>}
              {currentCameraKey && currentCamera && (
                <CameraInputControl key={currentCameraKey} name={currentCamera.filename} hints={currentCamera.deviceHints}
                  audioDeviceHint={currentCamera.audioDeviceHint}
                  feedSound={currentCamera.feedSound}
                  assigned={savedCameraInput(currentCameraKey) ?? cameraInputs.current.get(currentCameraKey)}
                  onApply={(camera) => {
                    cameraRun.current = crypto.randomUUID()
                    cameraInputs.current.set(currentCameraKey, camera)
                    saveCameraInput(currentCameraKey, camera)
                    selectBlock(store.currentBlockIndex, liveBuild.current)
                  }} />
              )}
              <LayeredFeedAssignments design={activeBlock?.design} playlistId={id} onAssigned={() => selectBlock(store.currentBlockIndex, liveBuild.current)} />
              {previewBeforeLive && !continuousSchedule && allBlocks.length > 0 && <h2 className="my-3! text-sm font-semibold">สไลด์คิวที่กำลังควบคุม</h2>}
              {visibleCues.map(({ cue, blocks }) => (
                <section key={songs[cue]?.id ?? cue} className={continuousSchedule ? 'mb-6!' : undefined}
                  aria-labelledby={continuousSchedule ? `live-schedule-cue-${cue}` : undefined}>
                  {continuousSchedule && <h2 id={`live-schedule-cue-${cue}`} className="mb-3! break-words text-base font-semibold">
                    {cue + 1}. {songs[cue]?.cue?.label ?? songs[cue]?.song?.title}
                  </h2>}
                  <div className={continuousSchedule ? 'grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4' : 'grid grid-cols-2 gap-4'}>
                    {blocks.map((block, idx) => {
                      const prev = blocks[idx - 1]
                      const isNewSection = !prev || prev.sectionLabel !== block.sectionLabel
                      const isCurrent = cue === store.currentSongIndex && idx === store.currentBlockIndex
                        && (!continuousSchedule || hasPresentedCue.current)
                      return (
                        <Fragment key={idx}>
                          {isNewSection && (
                            <div
                              style={{
                                gridColumn: '1 / -1',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                marginTop: idx === 0 ? 0 : '12px',
                              }}
                            >
                              <div style={{ height: '1px', flex: 1, background: 'var(--border-subtle)' }} />
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  letterSpacing: '0.08em',
                                  textTransform: 'uppercase',
                                  color: 'var(--accent)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {block.sectionLabel}
                              </span>
                              <div style={{ height: '1px', flex: 1, background: 'var(--border-subtle)' }} />
                            </div>
                          )}
                          <button
                            data-live-slide
                            ref={isCurrent ? liveSlideButton : undefined}
                            aria-current={isCurrent ? 'step' : undefined}
                            onClick={() => continuousSchedule ? selectSong(cue, idx) : selectBlock(idx)}
                            style={{
                              textAlign: 'left',
                              padding: '16px',
                              borderRadius: '8px',
                              border: '2px solid',
                              transition: 'all 150ms var(--ease-out)',
                              borderColor: isCurrent ? 'var(--accent)' : 'var(--border-subtle)',
                              background: isCurrent ? 'rgba(62, 207, 142, 0.08)' : 'transparent',
                            }}
                            onMouseEnter={(e) => {
                              if (!isCurrent) {
                                e.currentTarget.style.borderColor = 'var(--border-standard)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isCurrent) {
                                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                              }
                            }}
                          >
                            <div style={{ fontSize: '12px', color: 'var(--fg-tertiary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                              {block.sectionLabel}
                            </div>
                            {block.lines.map((line, li) => (
                              <div key={li} style={{
                                fontSize: '14px',
                                color: 'var(--fg-primary)',
                                lineHeight: 1.6,
                                overflowWrap: 'anywhere',
                              }}>
                                {line}
                              </div>
                            ))}
                            {block.assets?.map((asset, assetIndex) => (
                              <p key={assetIndex} className="mt-1 text-xs wrap-break-word text-[var(--fg-secondary)]">{asset.filename}</p>
                            ))}
                          </button>
                        </Fragment>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>

          {/* Right Panel - Controls & Preview */}
          <div
            className={activeTab !== 'controls' ? 'hidden md:flex md:w-80 md:shrink-0' : 'md:flex md:w-80 md:shrink-0'}
            style={{ flexDirection: 'column', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}
          >
            <div style={{ flex: 1, padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--fg-tertiary)', textTransform: 'uppercase', marginBottom: '12px' }}>
                Display Preview
              </div>
              <div style={{
                aspectRatio: '16 / 9',
                containerType: 'size',
                background: 'black',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}>
                {store.isBlacked ? (
                  <div style={{ width: '100%', height: '100%', background: 'black' }} />
                ) : store.isShowingWelcome ? (
                  <LogoScreen key={presentedLogo?.id} logo={presentedLogo} fallback={store.welcomeImageUrl} preview />
                ) : livePreviewDesign ? (
                  <LayeredSlide design={livePreviewDesign} playlistId={id} preview showVideoPosters={false} clearForeground={foregroundCleared} />
                ) : foregroundCleared ? (
                  <span className="text-xs text-white/70">ซ่อนสื่อด้านหน้า</span>
                ) : liveLyrics.length > 0 || liveMediaName || liveCaption ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '8px' }}>
                    <div style={{ flex: `${store.textVerticalOffset} 0 0` }} />
                    <div style={{ alignSelf: 'center', textAlign: 'center', maxWidth: '90%' }}>
                      {liveMediaName && <p className="mb-1 text-xs wrap-break-word text-[var(--fg-secondary)]">{liveMediaName}</p>}
                      {liveCaption && liveScriptureLayout?.before && <p style={liveCaptionSpacing} className="mb-1 text-xs text-white/80 wrap-break-word">{liveCaptionText}</p>}
                      {liveScriptureLayout?.showText !== false && liveOutputLines.map((line, i) => (
                        <div key={i} style={{
                          fontSize: '14px',
                          color: 'white',
                          lineHeight: 1.6,
                          whiteSpace: 'nowrap',
                        }}>
                          {liveOutputRuns ? <StyledTextRuns runs={liveOutputRuns[i]} /> : line}
                        </div>
                      ))}
                      {liveCaption && !liveScriptureLayout?.before && <p style={liveCaptionSpacing} className="mt-1 text-xs text-white/80 wrap-break-word">{liveCaptionText}</p>}
                    </div>
                    <div style={{ flex: `${100 - store.textVerticalOffset} 0 0` }} />
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--fg-tertiary)' }}>No content</div>
                )}
              </div>

              {liveMedia?.kind === 'web' && (
                <div className="mt-3! flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={() => selectBlock(store.currentBlockIndex)}>โหลดเว็บใหม่</button>
                  <a href={liveMedia.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">เปิดเว็บโดยตรง</a>
                </div>
              )}
              {mediaPlayback && (liveSoundtrack || liveFeedAudio || (liveMedia?.kind === 'video' && liveMedia.role !== 'background')) && (
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="การควบคุมสื่อบนจอ">
                  {liveSoundtrack && liveDesign && <p className="w-full text-xs wrap-anywhere text-[var(--fg-secondary)]">{liveSoundtrack.filename}</p>}
                  {(liveSoundtrack || !liveFeedAudio) && <button type="button" className="btn-secondary flex-1 px-2" onClick={() => setMediaPlayback({ playing: !mediaPlayback.playing })}>
                    {liveSoundtrack ? mediaPlayback.playing ? 'พักเสียง' : 'เล่นเสียง' : mediaPlayback.playing ? 'หยุดสื่อ' : 'เล่นสื่อ'}
                  </button>}
                  <button type="button" className="btn-secondary flex-1 px-2" onClick={() => setMediaPlayback({ muted: !mediaPlayback.muted })}>
                    {mediaPlayback.muted ? 'เปิดเสียง' : 'ปิดเสียง'}
                  </button>
                </div>
              )}

              {/* Controls - moved under preview */}
              <div style={{ marginTop: '16px' }}>
                {showBuildControls && <div className="mb-4! grid gap-2">
                  {liveBuildLength > 0 && <p className="text-xs text-[var(--fg-secondary)]" role="status">ลำดับการแสดง {liveBuildStep}/{liveBuildLength}</p>}
                  {!continuousSchedule && <div className="flex gap-2">
                    <button type="button" className="btn-secondary flex-1" onClick={() => stepBlock(-1)}
                      disabled={!liveStep(-1)}>ย้อนหนึ่งขั้น</button>
                    <button type="button" className="btn-secondary flex-1" onClick={() => stepBlock(1)}
                      disabled={!liveStep(1)}>ถัดไปหนึ่งขั้น</button>
                  </div>}
                </div>}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <button type="button" className="btn-secondary flex-1 px-2" aria-pressed={store.isShowingWelcome}
                    onClick={() => importedKeyboard('welcome')}>Welcome</button>
                  <button type="button" className="btn-secondary flex-1 px-2" onClick={() => clearLyrics(!clearedRef.current)}
                    aria-label="Clear lyrics" aria-pressed={foregroundCleared}>Clear</button>
                  <button type="button" className="btn-secondary flex-1 px-2" onClick={() => showBlack()}>Black</button>
                </div>

                <AlertControl output="live" templates={alertTemplates} queue={alertQueues.live} enabled={messageSettings.live?.enabled}
                  paused={store.isBlacked} dispatch={(action) => dispatchAlert('live', action)} />
                <NurseryAlertControl {...nursery} />

                <fieldset className="mb-4! grid gap-2 rounded-lg border border-[var(--border-subtle)] p-3!">
                  <legend className="px-1! text-sm font-medium">จอเวทีสด</legend>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <label htmlFor="foldback-preview-lines">ตัวอย่างสไลด์ถัดไป</label>
                    <select id="foldback-preview-lines" className="input-field w-auto!" value={nextLines}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        const lines = value === '0' ? 0 : value === '1' ? 1 : 2
                        setNextLines(lines)
                        foldbackRef.current?.publish({ nextLines: lines })
                      }}>
                      <option value={2}>สองบรรทัด</option>
                      <option value={1}>หนึ่งบรรทัด</option>
                      <option value={0}>ซ่อน</option>
                    </select>
                  </div>
                </fieldset>
                <AlertControl key={`stage:${id}`} output="stage" templates={alertTemplates} queue={alertQueues.stage} enabled={messageSettings.stage?.enabled}
                  dispatch={(action) => dispatchAlert('stage', action)} />
                <AlertControl key={`alternate:${id}`} output="alternate" templates={alertTemplates} queue={alertQueues.alternate} enabled={messageSettings.alternate?.enabled}
                  paused={alternateBlanked} dispatch={(action) => dispatchAlert('alternate', action)} />

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--fg-tertiary)', marginBottom: '6px' }}>
                    <span>Text Position</span>
                    <span style={{ color: 'var(--fg-secondary)', fontVariantNumeric: 'tabular-nums' }}>{store.textVerticalOffset}</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      aria-label="Move text up"
                      onClick={() => setTextPosition(store.textVerticalOffset - 5)}
                      style={{
                        width: '28px',
                        height: '28px',
                        padding: 0,
                        borderRadius: '4px',
                        fontSize: '14px',
                        lineHeight: 1,
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--fg-secondary)',
                        background: 'transparent',
                        cursor: 'pointer',
                        transition: 'all 150ms var(--ease-out)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg-primary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-secondary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                    >
                      ↑
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={store.textVerticalOffset}
                      onChange={(e) => setTextPosition(Number(e.target.value))}
                      aria-label="Text vertical position"
                      style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      aria-label="Move text down"
                      onClick={() => setTextPosition(store.textVerticalOffset + 5)}
                      style={{
                        width: '28px',
                        height: '28px',
                        padding: 0,
                        borderRadius: '4px',
                        fontSize: '14px',
                        lineHeight: 1,
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--fg-secondary)',
                        background: 'transparent',
                        cursor: 'pointer',
                        transition: 'all 150ms var(--ease-out)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg-primary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-secondary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                    >
                      ↓
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label htmlFor="lyric-lines-per-slide" style={{ display: 'block', fontSize: '12px', color: 'var(--fg-tertiary)', marginBottom: '4px' }}>
                    การแบ่งสไลด์เนื้อเพลง
                  </label>
                  <select
                    id="lyric-lines-per-slide"
                    disabled={hasSavedLayout}
                    value={hasSavedLayout ? isLyricLayout(cueLyricLayout) ? cueLyricLayout : 'saved' : store.lyricLayout}
                    onChange={(event) => {
                      const value = event.target.value
                      let layout: LyricLayout = 4
                      if (value === 'stanza') layout = 'stanza'
                      if (value === '1') layout = 1
                      if (value === '2') layout = 2
                      store.setLyricLayout(layout, getPlaylistSlides(currentSong, layout).length - 1)
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '12px',
                      color: 'var(--fg-primary)',
                    }}
                  >
                    {hasSavedLayout && <option value="saved">ตามสไลด์ที่จัดไว้</option>}
                    <option value="1">1 บรรทัด</option>
                    <option value="2">2 บรรทัด</option>
                    <option value="4">4 บรรทัด</option>
                    <option value="stanza">{currentSong?.cue ? 'ตัดบรรทัดในสไลด์เดิม' : 'ทั้งท่อน'}</option>
                  </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--fg-tertiary)', marginBottom: '4px' }}>
                    Video Background
                  </label>
                  <select
                    value={store.videoBackground?.url ?? ''}
                    onChange={(e) => changeBackground(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '12px',
                      color: 'var(--fg-primary)'
                    }}
                  >
                    <option value="">None</option>
                    {backgrounds.map((bg) => (
                      <option key={bg.id} value={bg.url}>
                        {bg.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--fg-tertiary)' }}>
                  <span>{store.currentSongIndex + 1}/{songs.length}</span>
                  <span>•</span>
                  <span>{currentSectionName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
