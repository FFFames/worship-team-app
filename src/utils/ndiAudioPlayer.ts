/** Schedules incoming stereo audio on the presentation audio clock. */

import type { NdiInputAudio } from './ndiInput'

export function createNdiAudioPlayer() {
  const context = new AudioContext({ latencyHint: 'interactive' })
  const gain = context.createGain()
  gain.connect(context.destination)
  const playing = new Set<AudioBufferSourceNode>()
  let cursor = 0
  let muted = true
  void context.resume().catch(() => {})

  function reset() {
    for (const source of playing) source.stop()
    playing.clear()
    cursor = 0
  }

  function setGain(level: number, silent: boolean) {
    muted = silent || level <= 0
    gain.gain.value = muted ? 0 : Math.min(1, level / 100)
    if (muted) reset()
  }

  function push({ rate, samples, pcm }: NdiInputAudio) {
    if (muted || context.state !== 'running') return
    const now = context.currentTime
    if (cursor > now + 0.15) return
    if (cursor < now) cursor = now + 0.04
    const values = new Float32Array(pcm.buffer, pcm.byteOffset, samples * 2)
    const clip = context.createBuffer(2, samples, rate)
    clip.getChannelData(0).set(values.subarray(0, samples))
    clip.getChannelData(1).set(values.subarray(samples))
    const source = context.createBufferSource()
    source.buffer = clip
    source.connect(gain)
    source.onended = () => { source.disconnect(); playing.delete(source) }
    playing.add(source)
    source.start(cursor)
    cursor += clip.duration
  }

  return {
    push, reset, setGain,
    close() {
      reset()
      void context.close().catch(() => {})
    },
  }
}
