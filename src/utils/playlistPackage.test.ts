/** Covers standalone schedule export and validation without destination storage. */

import { describe, expect, it, vi } from 'vitest'
import type { Playlist, PlaylistSong, Song } from '../types/database'
import type { AppliedSlideTheme, DesignLayer, SongSlideLayout } from '../types/slideDesign'
import { BlobReader, BlobWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'
import { preparePlaylistPackage, reviewPlaylistPackage, writePlaylistPackage } from './playlistPackage'
import { cutSlideTransition } from './slideTransitions'

const playlist: Playlist = {
  id: 'playlist', name: 'อาทิตย์', date: '2026-11-29', notes: 'นำเสนอจากเครื่องสำรอง',
  user_id: 'default', created_at: '', updated_at: '',
}
const song: Song = {
  id: 'original-id', title: 'เพลง', artist: null, youtube_url: null, tempo: null, time_signature: null,
  original_key: 'G', raw_content: 'G\nเนื้อเพลง', sections: [{ type: 'verse', label: 'Verse 1', marker: '',
    lines: [{ lyrics: 'เนื้อเพลง', chords: 'G' }], slideBreaks: [5],
    transition: { uid: 'sdDXBlend', values: { Duration: '750' } } }],
  tags: ['นมัสการ, เช้า', 'เพลงใหม่'], copyright: '© 2026', ccli_number: '000123',
  copyright_administrator: 'ผู้ดูแลลิขสิทธิ์', description: 'บรรทัดแรก\nบรรทัดที่สอง',
  favorite: true, user_id: 'default', created_at: '', updated_at: '',
}
const row = { id: 'entry', playlist_id: playlist.id, song_id: null, order: 0, transpose: 0, created_at: '' } satisfies PlaylistSong
const video = { kind: 'video', filename: 'clip.mp4', archivePath: 'Resources/Videos/clip.mp4', alphaMode: 'side-by-side' } as const
const audio = { kind: 'audio', filename: 'bed.wav', role: 'background', libraryId: 'local-audio', clip: { startSeconds: 4 } } as const
const announcement: DesignLayer = {
  kind: 'text', id: 'announcement', text: 'ประกาศ\nขอต้อนรับ', frame: { x: 0, y: 0, width: 1, height: 1 },
  textLayout: { insets: { left: 0.07, bottom: 0 }, sizing: 'fit' },
  runs: [{ text: 'ประกาศ\n', align: 'left' }, { text: 'ขอต้อนรับ', align: 'right' }],
}
const webPanel: DesignLayer = {
  kind: 'web', id: 'web-panel', url: 'https://example.test/live', hideScrollbars: true,
  frame: { x: .1, y: .1, width: .6, height: .5 },
}

describe('WorshipTeam portable playlists', () => {
  it('round-trips reusable song snapshots, separate occurrences, and local file references', async () => {
    const theme: AppliedSlideTheme = { title: 'ธีมถ่ายทอดสด', design: { aspectRatio: 16 / 9, layers: [announcement] },
      transition: { uid: 'sdDXPush', values: { Duration: '600', 'Value-Direction': '2' } } }
    const entries: PlaylistSong[] = [
      { ...row, song_id: song.id, song, transpose: 2, background_asset: video, slide_theme: theme },
      { ...row, cue: { kind: 'presentation', label: 'ประกาศ', slides: [{
        label: 'สไลด์', lines: ['ขอต้อนรับ'], advanceMs: 2500, assets: [video, audio], transition: cutSlideTransition, transitionEdited: true,
        design: { aspectRatio: 16 / 9, layers: [announcement, webPanel], soundtracks: [audio] },
      }] } },
      { ...row, song_id: song.id, song, transpose: -1, cue: {
        kind: 'song', label: 'แก้เฉพาะครั้งนี้', lyricLayout: 2, slides: [{ label: 'Verse 1', lines: ['เนื้อเพลงที่แก้'], chords: ['Em'] }],
      } },
    ]
    const library = vi.fn(async () => new Blob(['audio'], { type: 'audio/wav' }))
    const schedule = vi.fn(async () => new Blob(['video'], { type: 'video/mp4' }))
    const packageData = await preparePlaylistPackage(playlist, entries, { library, schedule })
    const archive = await writePlaylistPackage(packageData)
    const reviewed = await reviewPlaylistPackage(archive)
    expect(reviewed.playlist).toEqual({ name: playlist.name, date: playlist.date, notes: playlist.notes })
    expect(reviewed.songs).toHaveLength(1)
    expect(reviewed.songs[0].sections).toEqual(song.sections)
    expect(reviewed.songs[0]).toMatchObject({
      tags: song.tags, copyright: song.copyright, ccli_number: song.ccli_number,
      copyright_administrator: song.copyright_administrator, description: song.description,
    })
    expect(reviewed.songs[0]).not.toHaveProperty('id')
    expect(reviewed.songs[0]).not.toHaveProperty('user_id')
    expect(reviewed.entries.map((entry) => [entry.song, entry.transpose])).toEqual([[0, 2], [undefined, 0], [0, -1]])
    expect(reviewed.entries[0].slide_theme).toEqual(theme)
    expect(reviewed.entries[1].cue?.slides[0].advanceMs).toBe(2500)
    expect(reviewed.entries[1].cue?.slides[0].transition).toEqual(cutSlideTransition)
    expect(reviewed.entries[1].cue?.slides[0].transitionEdited).toBe(true)
    expect(reviewed.entries[1].cue?.slides[0].design?.layers).toEqual([announcement, webPanel])
    expect(reviewed.entries[2].cue?.slides[0].chords).toEqual(['Em'])
    expect(reviewed.entries[2].cue?.lyricLayout).toBe(2)
    expect(reviewed.entries[1].cue?.slides[0].design?.soundtracks?.[0]).toMatchObject({ clip: { startSeconds: 4 } })
    expect(reviewed.entries[0].background_asset?.alphaMode).toBe('side-by-side')
    expect(reviewed.entries[1].cue?.slides[0].assets?.[0].archivePath).toBe(reviewed.entries[0].background_asset?.archivePath)
    expect(reviewed.entries[1].cue?.slides[0].assets?.[1]).not.toHaveProperty('libraryId')
    expect(reviewed.media.map((asset) => asset.mime).sort()).toEqual(['audio/wav', 'video/mp4'])
    expect(schedule).toHaveBeenCalledExactlyOnceWith(playlist.id, video.archivePath)
    expect(library).toHaveBeenCalledExactlyOnceWith(audio.libraryId)

    const reader = new ZipReader(new BlobReader(archive))
    try { expect((await reader.getEntries()).map((file) => file.filename)).toEqual(['manifest.json', 'assets/1', 'assets/2']) }
    finally { await reader.close() }
  })

  it('reads older song snapshots and rejects malformed metadata', async () => {
    const { manifest, media } = await preparePlaylistPackage(playlist, [{ ...row, song_id: song.id, song }])
    const { copyright_administrator: _administrator, description: _description, ...olderSong } = manifest.songs[0]
    const oldArchive = await writePlaylistPackage({ manifest: { ...manifest, songs: [olderSong] }, media })
    expect((await reviewPlaylistPackage(oldArchive)).songs[0]).toEqual(olderSong)

    const cleared = { ...olderSong, copyright_administrator: '', description: null, tags: [] }
    const clearedArchive = await writePlaylistPackage({ manifest: { ...manifest, songs: [cleared] }, media })
    expect((await reviewPlaylistPackage(clearedArchive)).songs[0]).toEqual(cleared)

    const zip = new ZipWriter(new BlobWriter())
    await zip.add('manifest.json', new BlobReader(new Blob([JSON.stringify({
      ...manifest, songs: [{ ...olderSong, description: ['ข้อความผิดรูปแบบ'] }],
    })])))
    await expect(reviewPlaylistPackage(await zip.close())).rejects.toThrow('ข้อมูลเพลงในแพ็กเกจไม่ถูกต้อง')
  })

  it('packs one shared media file for authored artwork across library and occurrence scopes', async () => {
    const layout: SongSlideLayout = { artwork: { changes: [{ action: 'add', layer: {
      kind: 'media', id: 'logo', frame: { x: .75, y: .25, width: .2, height: .2 }, asset: { kind: 'image', filename: 'Logo.png', libraryId: 'logo-file' },
    } }], order: ['song-layout-lyrics', 'logo'] } }
    const source = { ...song, appearance: { slideLayout: layout } }
    const library = vi.fn(async () => new Blob(['pixels'], { type: 'image/png' }))
    const prepared = await preparePlaylistPackage(playlist, [
      { ...row, song_id: song.id, song: source, cue: { kind: 'song', label: 'Local', slideLayout: layout,
        slides: [{ label: 'Verse', lines: ['Words'], slideLayout: layout }] } },
    ], { library, schedule: async () => null })
    const restored = await reviewPlaylistPackage(await writePlaylistPackage(prepared))
    expect(restored.media).toHaveLength(1)
    const linked = restored.songs[0].appearance?.slideLayout
    expect(linked?.artwork?.changes?.[0]).toMatchObject({ action: 'add', layer: { asset: { archivePath: 'assets/1' } } })
    expect(restored.entries[0].cue?.slideLayout).toEqual(linked)
    expect(restored.entries[0].cue?.slides[0].slideLayout).toEqual(linked)
    expect(library).toHaveBeenCalledExactlyOnceWith('logo-file')
  })

  it('reports missing files and validates archive entries before any import', async () => {
    const prepared = await preparePlaylistPackage(playlist, [
      { ...row, cue: { kind: 'video', label: 'Clip', assets: [video], slides: [{ label: 'Clip', lines: [], assets: [video] }] } },
    ], { library: async () => null, schedule: async () => null })
    const reviewed = await reviewPlaylistPackage(await writePlaylistPackage(prepared))
    expect(reviewed.missing).toEqual(['clip.mp4'])
    expect(reviewed.entries[0].cue?.assets?.[0]).not.toHaveProperty('archivePath')

    const zip = new ZipWriter(new BlobWriter())
    await zip.add('manifest.json', new BlobReader(new Blob([JSON.stringify({
      ...prepared.manifest, media: [{ path: 'assets/1', filename: video.filename, mime: 'video/mp4', size: 5 }],
      entries: [{ ...prepared.manifest.entries[0], background_asset: { ...video, archivePath: 'assets/1' } }],
    })])))
    await expect(reviewPlaylistPackage(await zip.close())).rejects.toThrow('ไฟล์สื่อในแพ็กเกจไม่ครบ')
  })

  it('round-trips a saved Feed reference and its device hints without looking for a media file', async () => {
    const feed = { kind: 'camera', filename: 'กล้องธรรมาสน์', role: 'background',
      feedId: '00000000-0000-4000-8000-000000000742', deviceHints: ['Booth (Pulpit)'], audioDeviceHint: 'Mixer',
      feedSound: { muted: true, level: 65 }, feedVideo: { width: 1920, height: 1080, frameRate: 29.97, fit: 'contain' } } as const
    const asset = { ...feed, deviceHints: [...feed.deviceHints] }
    const library = vi.fn(async () => null)
    const schedule = vi.fn(async () => null)
    const prepared = await preparePlaylistPackage(playlist, [
      { ...row, cue: { kind: 'song', label: 'เพลง', slides: [{ label: 'Verse 1', lines: ['เนื้อเพลง'], assets: [asset] }] } },
      { ...row, order: 1, cue: { kind: 'presentation', label: 'กล้องในกรอบ', slides: [{ label: 'ภาพสด', lines: [],
        design: { aspectRatio: 16 / 9, layers: [{ id: 'inset-feed', kind: 'camera', asset,
          frame: { x: .58, y: .1, width: .3, height: .4 }, opacity: .82 }] } }] } },
    ], { library, schedule })
    const reviewed = await reviewPlaylistPackage(await writePlaylistPackage(prepared))
    expect(reviewed.entries[0].cue?.slides[0].assets).toEqual([asset])
    expect(reviewed.entries[1].cue?.slides[0].design?.layers[0]).toMatchObject({ kind: 'camera', asset,
      frame: { x: .58, y: .1, width: .3, height: .4 }, opacity: .82 })
    expect(reviewed.media).toEqual([])
    expect(reviewed.missing).toEqual([])
    expect(library).not.toHaveBeenCalled()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('packs a locally mapped DVD clip with the marked range instead of exporting a device-local assignment', async () => {
    const dvd = { id: 'dvd-test-id', name: 'DVD เพลง', title: 2, chapter: 5, lastChapter: 7, subtitleTrack: 1,
      clip: { startSeconds: 2, endSeconds: 4.5 }, thumbnail: 'data:image/jpeg;base64,/9j/4A==', metadata: { author: 'ทีมสื่อ' },
      playback: { volume: .37, muted: false, fit: 'fill' } as const }
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'worshipteam:dvd:dvd-test-id'
      ? JSON.stringify({ assetId: 'locally-mapped-video', useMarks: true, subtitle: 1 }) : null })
    try {
      const library = vi.fn(async () => new Blob(['video'], { type: 'video/mp4' }))
      const prepared = await preparePlaylistPackage(playlist, [
        { ...row, cue: { kind: 'video', label: dvd.name, slides: [{ label: dvd.name, lines: [],
          assets: [{ kind: 'video', filename: dvd.name, dvd }] }] } },
      ], { library, schedule: async () => null })
      const reviewed = await reviewPlaylistPackage(await writePlaylistPackage(prepared))
      const asset = reviewed.entries[0].cue?.slides[0].assets?.[0]
      expect(asset).toMatchObject({ dvd: { ...dvd, subtitleSelection: 1 }, clip: dvd.clip, archivePath: 'assets/1' })
      expect(asset).not.toHaveProperty('libraryId')
      expect(reviewed.missing).toEqual([])
      expect(library).toHaveBeenCalledExactlyOnceWith('locally-mapped-video')
    } finally { vi.unstubAllGlobals() }
  })
})
