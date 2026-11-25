/** Verifies reuse of schedule songs without disturbing an existing library chart. */

import { describe, expect, it } from 'vitest'
import type { PlaylistCue } from '../types/database'
import { getSongPresentationSlides } from './playlistCues'
import { recoverEasyWorshipScheduleSongs, scheduleSongMatchesChart, type ScheduleSongCatalogEntry } from './easyWorshipScheduleSongs'
import { formatLyricsOnly, parseChordLyrics } from './chordParser'
import { readCueSongVersion } from './playlistSongReconciliation'

const frame = { x: 0, y: 0, width: 1, height: 1 }
const cue: PlaylistCue = {
  kind: 'song', label: 'เพลงทดสอบ', sourceId: '42',
  metadata: { author: 'Composer', copyright: 'Copyright notice', referenceNumber: 12441 },
  slides: [
    { label: 'Verse 1', lines: ['ภาษาไทย'], assets: [
      { kind: 'video', filename: 'motion.mpg', archivePath: 'Media/motion.mp4', role: 'background' },
      { kind: 'audio', filename: 'bed.wav', archivePath: 'Media/bed.wav', role: 'background', repeat: true, clip: { startSeconds: 1 } },
    ], design: { aspectRatio: 16 / 9, layers: [
      { kind: 'text', id: 'content', slot: 'content', text: 'ภาษาไทย', frame, runs: [{ text: 'ภาษาไทย', style: { italic: true } }] },
    ] } },
    { label: 'Chorus', lines: ['C', 'ร้องด้วยกัน'] },
  ],
}

describe('EasyWorship song recovery from a schedule', () => {
  it('keeps source order and original text, combines repeated versions, and retains media that can play outside the schedule', async () => {
    const { songs, skipped } = await recoverEasyWorshipScheduleSongs([
      { kind: 'scripture', label: 'Skip scripture', slides: cue.slides },
      cue,
      { ...cue, label: 'Song with missing lyrics', slides: [] },
      { ...cue, sourceId: '456' },
      { ...cue, slides: cue.slides.slice(0, 1) },
    ])
    expect(skipped).toEqual([{ position: 3, title: 'Song with missing lyrics' }])
    expect(songs.map((entry) => entry.positions)).toEqual([[2, 4], [5]])
    const [version] = songs
    expect(version.song).toMatchObject({ author: 'Composer', copyright: 'Copyright notice', ccli: '12441' })
    expect(version.song.sections).toEqual([{ label: 'Verse 1', lines: ['ภาษาไทย'] }, { label: 'Chorus', lines: ['C', 'ร้องด้วยกัน'] }])
    const design = version.song.appearance?.sections?.[0].design
    expect(design?.layers[0]).toMatchObject({ asset: { filename: 'motion.mp4', sourcePath: 'Media/motion.mp4' } })
    expect(design?.layers[1]).toMatchObject({ text: '', runs: [{ style: { italic: true } }] })
    expect(design?.soundtracks?.[0]).toMatchObject({ sourcePath: 'Media/bed.wav', role: 'background', repeat: true, clip: { startSeconds: 1 } })
    expect(version.files.map((asset) => asset.archivePath)).toEqual(['Media/motion.mp4', 'Media/bed.wav'])

    const text = formatLyricsOnly(version.song.sections)
    const sections = parseChordLyrics(text).sections
    const slides = getSongPresentationSlides({
      id: version.id, title: version.song.title, appearance: version.song.appearance, raw_content: text, sections,
      artist: null, tempo: null, original_key: 'C', time_signature: null, youtube_url: null,
      user_id: null, tags: null, favorite: null, created_at: '', updated_at: '',
    }, 'stanza')
    expect(slides[0].design?.layers[1]).toMatchObject({ text: 'ภาษาไทย', runs: [{ style: { italic: true } }] })
    expect(sections[1].lines[0]).toEqual({ lyrics: 'C', chords: '' })
  })

  it('recognizes an equivalent lyric chart with local chords and preserves different lyrics or credits as another version', async () => {
    const [{ song }] = (await recoverEasyWorshipScheduleSongs([cue])).songs
    const raw_content = formatLyricsOnly(song.sections)
    const sections = parseChordLyrics(raw_content).sections
    sections[0].lines[0].chords = 'A'
    const existing: ScheduleSongCatalogEntry = {
      id: 'existing', title: cue.label, artist: song.author, copyright: song.copyright, ccli_number: song.ccli,
      sections, raw_content,
    }
    expect(scheduleSongMatchesChart(song, existing)).toBe(true)
    expect(scheduleSongMatchesChart(song, { ...existing, ccli_number: '1234' })).toBe(false)
    expect(scheduleSongMatchesChart(song, { ...existing, sections: [sections[0]] })).toBe(false)
  })

  it('recovers a native incoming effect even when the saved slide has no design', async () => {
    const transition = { uid: 'sdDXCover', values: { Duration: '900', 'Value-Direction': '2' } }
    const source = { ...cue, slides: [cue.slides[0], { ...cue.slides[1], transition }] }
    const [saved] = (await recoverEasyWorshipScheduleSongs([source])).songs
    expect(saved.song.sections.map((section) => section.transition)).toEqual([undefined, transition])
    expect(readCueSongVersion(source).sections.map((section) => section.transition)).toEqual([undefined, transition])
  })

  it('groups equivalent timers and keeps distinct playback versions selectable with their own media', async () => {
    const timed: PlaylistCue = { ...cue, looping: true,
      slides: [{ ...cue.slides[0], advanceMs: 1850 }, cue.slides[1]] }
    const legacyEquivalent: PlaylistCue = { ...timed,
      slides: [{ ...cue.slides[0], playback: { mode: 'timer', delayMs: 1850 } }, cue.slides[1]] }
    const media: PlaylistCue = { ...cue, looping: false, slides: [{
      ...cue.slides[0], assets: [{ kind: 'audio', filename: 'voice.mp3', archivePath: 'Media/voice.mp3' }],
      playback: { mode: 'media', delayMs: 250, restart: true },
    }, cue.slides[1]] }
    const [recovered] = (await recoverEasyWorshipScheduleSongs([timed, media, legacyEquivalent])).songs
    expect(recovered.positions).toEqual([1, 2, 3])
    expect(recovered.playbackVersions?.map(({ positions }) => positions)).toEqual([[1, 3], [2]])
    expect(recovered.playbackVersions?.[0].song.appearance?.looping).toBe(true)
    expect(recovered.playbackVersions?.[0].song.sections[0].playback).toEqual({ mode: 'timer', delayMs: 1850 })
    const selected = recovered.playbackVersions?.[1]
    expect(selected?.song.appearance?.looping).toBe(false)
    expect(selected?.song.sections[0].playback).toEqual({ mode: 'media', delayMs: 250, restart: true })
    expect(selected?.files.map(({ archivePath }) => archivePath)).toEqual(['Media/voice.mp3'])
    const raw_content = formatLyricsOnly(recovered.song.sections)
    const existing = {
      id: 'existing', title: cue.label, artist: recovered.song.author, copyright: recovered.song.copyright,
      ccli_number: recovered.song.ccli, sections: parseChordLyrics(raw_content).sections, raw_content, looping: true,
    }
    expect(scheduleSongMatchesChart(recovered.song, existing)).toBe(false)
    existing.sections[0].playback = { mode: 'timer', delayMs: 1850 }
    expect(scheduleSongMatchesChart(recovered.song, existing)).toBe(true)
    expect(scheduleSongMatchesChart(recovered.song, { ...existing, looping: false })).toBe(false)
  })
})
