/** Maps a camera cue to inputs on this computer. */

import { useEffect, useState } from 'react'
import type { CameraInput, FeedSound } from '../types/liveFeed'
import { cameraConstraints, cameraErrorMessage, microphoneConstraints, microphoneErrorMessage } from '../utils/livePresentation'
import { ndiDeviceId, ndiDeviceName, ndiInputError } from '../utils/ndiInput'

export function CameraInputControl({ name, hints, audioDeviceHint, assigned, feedSound, onApply }: {
  name: string
  hints?: string[]
  audioDeviceHint?: string
  assigned?: CameraInput
  feedSound?: FeedSound
  onApply: (input: CameraInput) => void
}) {
  const [deviceId, setDeviceId] = useState(assigned?.deviceId ?? 'default')
  const [receiveAudio, setReceiveAudio] = useState(assigned
    ? Boolean(ndiDeviceName(assigned.deviceId)) && assigned.audioLevel !== undefined : feedSound?.muted === false)
  const [audioDeviceId, setAudioDeviceId] = useState(assigned?.audioDeviceId ?? '')
  const [volume, setVolume] = useState(assigned?.audioLevel ?? feedSound?.level ?? 100)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadedCameras, setLoadedCameras] = useState(false)
  const [loadedMicrophones, setLoadedMicrophones] = useState(false)
  const [ndiSources, setNdiSources] = useState<string[]>([])
  const [searchedNdi, setSearchedNdi] = useState(false)
  const ndi = window.worshipNdiInput
  const ndiName = ndiDeviceName(deviceId)
  const cameras = devices.filter((device) => device.kind === 'videoinput' && device.deviceId && device.deviceId !== 'default')
  const microphones = devices.filter((device) => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default')

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.enumerateDevices) return
    let current = true
    async function updateDevices() {
      try {
        const inputs = await mediaDevices.enumerateDevices()
        if (current) setDevices(inputs)
      } catch {
        // The default camera is still available to try from the audience window.
      }
    }
    void updateDevices()
    mediaDevices.addEventListener('devicechange', updateDevices)
    return () => {
      current = false
      mediaDevices.removeEventListener('devicechange', updateDevices)
    }
  }, [])

  async function loadDevices(kind: 'camera' | 'microphone') {
    const microphone = kind === 'microphone'
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.getUserMedia) {
      setError('การใช้กล้องและไมโครโฟนต้องเปิดแอปผ่าน HTTPS หรือ localhost บนเบราว์เซอร์ที่รองรับ')
      return
    }
    setBusy(true)
    setError('')
    let stream: MediaStream | undefined
    try {
      stream = await mediaDevices.getUserMedia(microphone ? microphoneConstraints() : cameraConstraints())
      setDevices(await mediaDevices.enumerateDevices())
      if (microphone) setLoadedMicrophones(true)
      else setLoadedCameras(true)
    } catch (cause) {
      setError(microphone ? microphoneErrorMessage(cause) : cameraErrorMessage(cause))
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
      setBusy(false)
    }
  }

  async function discoverNdi() {
    if (!ndi) return
    setBusy(true)
    setError('')
    try {
      const result = await ndi.discover()
      setSearchedNdi(true)
      if ('error' in result) {
        setError(ndiInputError(result.error))
        setNdiSources([])
        return
      }
      setNdiSources(result.sources)
      const matching = [...(hints ?? []), name].find((hint) => result.sources.includes(hint))
      if (matching && !assigned) setDeviceId(ndiDeviceId(matching))
    } catch {
      setError(ndiInputError('receiver'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-4! rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3!">
      <div className="mb-2! font-medium wrap-anywhere">{name}</div>
      {Boolean(hints?.length) && <p className="mb-2! text-sm text-[var(--fg-secondary)] wrap-anywhere">
        อุปกรณ์ใน EasyWorship · {hints?.join(', ')}
      </p>}
      {audioDeviceHint && <p className="mb-2! wrap-anywhere text-sm text-[var(--fg-secondary)]">อุปกรณ์เสียงใน EasyWorship · {audioDeviceHint}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          {ndi ? 'กล้องหรือแหล่ง NDI' : 'กล้องบนเครื่องนี้'}
          <select className="input-field min-w-0" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={busy}>
            <option value="default">กล้องเริ่มต้น</option>
            {!ndiName && deviceId !== 'default' && !cameras.some((device) => device.deviceId === deviceId)
              && <option value={deviceId}>กล้องที่ตั้งไว้</option>}
            {cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `กล้อง ${index + 1}`}</option>)}
            {ndiName && !ndiSources.includes(ndiName) && <option value={deviceId}>{ndiName}</option>}
            {ndiSources.length > 0 && <optgroup label="NDI">
              {ndiSources.map((source) => <option key={source} value={ndiDeviceId(source)}>{source}</option>)}
            </optgroup>}
          </select>
        </label>
        {!loadedCameras && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void loadDevices('camera')}>ดูรายชื่อกล้อง</button>}
        {ndi && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void discoverNdi()}>ค้นหาแหล่ง NDI</button>}
      </div>
      {!ndiName && (
        <div className="mt-2! flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            ไมโครโฟนบนเครื่องนี้
            <select className="input-field min-w-0" value={audioDeviceId} disabled={busy}
              onChange={(event) => setAudioDeviceId(event.target.value)}>
              <option value="">ไม่ใช้ไมโครโฟน</option>
              <option value="default">ไมโครโฟนเริ่มต้น</option>
              {audioDeviceId && audioDeviceId !== 'default' && !microphones.some((device) => device.deviceId === audioDeviceId)
                && <option value={audioDeviceId}>ไมโครโฟนที่ตั้งไว้</option>}
              {microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>
                {device.label || `ไมโครโฟน ${index + 1}`}
              </option>)}
            </select>
          </label>
          {!loadedMicrophones && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void loadDevices('microphone')}>ดูรายชื่อไมโครโฟน</button>}
        </div>
      )}
      <div className="mt-2! flex flex-wrap items-end gap-3 text-sm">
        {ndiName && <label className="flex items-center gap-2">
          <input type="checkbox" checked={receiveAudio} disabled={busy} onChange={(event) => setReceiveAudio(event.target.checked)} />
          รับเสียงจากแหล่ง NDI
        </label>}
        {(ndiName ? receiveAudio : audioDeviceId) && <label className="flex items-center gap-2">
          {ndiName ? 'ระดับเสียง NDI' : 'ระดับเสียงไมโครโฟน'}
          <input type="range" value={volume} min={0} max={100} disabled={busy} aria-valuetext={`${volume}%`}
            onChange={(event) => setVolume(event.target.valueAsNumber)} />
          <span aria-hidden="true" className="tabular-nums">{volume}%</span>
        </label>}
        <button type="button" className="btn-primary" disabled={busy} onClick={() => onApply({
          deviceId,
          ...(ndiName && receiveAudio ? { audioLevel: volume } : {}),
          ...(!ndiName && audioDeviceId ? { audioDeviceId, audioLevel: volume } : {}),
        })}>{ndiName ? 'ใช้แหล่ง NDI นี้' : 'ใช้กล้องนี้'}</button>
      </div>
      {searchedNdi && !error && !ndiSources.length && <p role="status" className="mt-2! text-sm text-[var(--fg-secondary)]">ยังไม่พบแหล่ง NDI ในเครือข่าย</p>}
      {error && <p role="alert" className="mt-2! text-sm text-[var(--status-error-text)]">{error}</p>}
    </section>
  )
}
