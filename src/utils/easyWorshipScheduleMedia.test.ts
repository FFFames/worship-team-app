import { describe, expect, it, vi } from 'vitest'
import type { PlaylistCue } from '../types/database'
import { fillScheduleMedia, recoverableScheduleMedia, reviewEasyWorshipScheduleMedia } from './easyWorshipScheduleMedia'
import { importIdentity } from './importIdentity'
import { mediaFileHash } from './easyWorshipMedia'
import { playlistMediaFilename, scheduleMediaAssets, withScheduleMediaReader } from './scheduleMedia'

const cues: PlaylistCue[] = [{
  kind: 'song', label: 'Gathering', sourceId: 'song',
  slides: [{
    label: 'Verse', lines: ['Welcome'], sourceId: 'verse',
    assets: [
      { kind: 'audio', filename: 'Choir.wav', role: 'background' },
      { kind: 'image', filename: 'Packed.png', archivePath: 'media/packed.png' },
    ],
    design: { aspectRatio: 16 / 9, layers: [{
      id: 'master-media', kind: 'media', frame: { x: 0, y: 0, width: 1, height: 1 },
      asset: { kind: 'video', filename: 'Clouds.wmv', clip: { startSeconds: 2, endSeconds: 4 } },
    }] },
  }],
  warnings: ['ไม่พบไฟล์ Choir.wav ใน .ewsx', 'ไม่พบไฟล์ Clouds.wmv ที่อ้างอิงจากเลย์เอาต์'],
}]

describe('EasyWorship schedule media attachments', () => {
  it('verifies original legacy bytes before staging them under the existing source reference', async () => {
    const convert = vi.fn(async () => 4)
    const release = vi.fn(async () => {})
    const write = vi.fn(async () => {})
    vi.stubGlobal('window', { worshipLegacyVideo: { open: async () => 'video-job', write, convert,
      read: async () => new TextEncoder().encode('mp4!').buffer, release } })
    try {
      const original = new File(['WMV source bytes'], 'Renamed.wmv')
      const wrong = new File(['bad source bytes'], 'Clouds.wmv')
      const asset = { kind: 'video' as const, filename: 'Clouds.wmv', easyWorshipFileHash: await mediaFileHash(original),
        easyWorshipFileSize: original.size, repeat: false }
      const cue = { ...cues[0], slides: [{ ...cues[0].slides[0], assets: [asset], design: undefined }] }
      const rejected = await reviewEasyWorshipScheduleMedia([cue], [wrong], false)
      expect(rejected.unresolved).toEqual(['Clouds.wmv · ไฟล์แนบไม่ตรงกับฉบับที่ตารางอ้างอิง'])
      const result = await reviewEasyWorshipScheduleMedia([cue], [wrong, original], false)
      expect(result.unresolved).toEqual([])
      expect(await result.sourceId('native-schedule')).toBe('native-schedule')
      const [linked] = result.cues[0].slides[0].assets!
      expect(linked).toMatchObject(asset)
      expect(playlistMediaFilename(linked)).toBe('Clouds.mp4')
      expect(convert).not.toHaveBeenCalled()
      await withScheduleMediaReader(new File([], 'from.ewsx'), [linked], undefined, async (read, [path]) => {
        const blob = await read(path)
        expect(blob.type).toBe('video/mp4')
        expect(await blob.text()).toBe('mp4!')
      }, result.attachments)
      expect(convert).toHaveBeenCalledOnce()
      expect(write).toHaveBeenCalledWith('video-job', 0, new Uint8Array(await original.arrayBuffer()))
      expect(release).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('combines loose audio and a converted inherited video with packed legacy media', async () => {
    const review = await reviewEasyWorshipScheduleMedia(cues, [new File(['video'], 'Clouds.mp4'), new File(['audio'], 'CHOIR.WAV')], true)
    const assets = scheduleMediaAssets(review.cues)
    expect(review.unresolved).toEqual([])
    expect(review.cues[0].warnings).toEqual([])
    expect(assets).toMatchObject([
      { filename: 'Choir.wav', role: 'background' },
      { filename: 'Packed.png', archivePath: 'media/packed.png' },
      { filename: 'Clouds.wmv', clip: { startSeconds: 2, endSeconds: 4 } },
    ])
    const packed = new Map([['media/packed.png', new Blob(['packed'], { type: 'image/png' })]])
    await withScheduleMediaReader(new File([], 'legacy.ews'), assets, packed, async (read, paths) => {
      expect(await Promise.all(paths.map(async (path) => (await read(path)).text()))).toEqual(['audio', 'packed', 'video'])
    }, review.attachments)
  })

  it('flags a duplicate name, skips unreferenced files, and keeps packed files intact', async () => {
    const review = await reviewEasyWorshipScheduleMedia(cues, [
      new File(['a'], 'Choir.wav'), new File(['b'], 'CHOIR.WAV'), new File(['other'], 'Packed.png'),
    ], false)
    expect(review.unresolved).toEqual(['Choir.wav · พบไฟล์แนบชื่อเดียวกันหลายไฟล์', 'Clouds.wmv'])
    expect(review.attachments.size).toBe(0)
    expect(review.cues).toBe(cues)
    expect(await review.sourceId('schedule')).toBe('schedule')
  })

  it('uses the same import ID for the same recovered media and a different ID for replacement bytes', async () => {
    const id = async (filename: string, bytes: string) => {
      const review = await reviewEasyWorshipScheduleMedia(cues, [new File([bytes], filename)], false)
      return review.sourceId('schedule')
    }
    expect(await id('CHOIR.WAV', 'sample')).toBe(await id('Choir.wav', 'sample'))
    expect(await id('Choir.wav', 'sample')).not.toBe(await id('Choir.wav', 'other'))
    const attachment = await reviewEasyWorshipScheduleMedia(cues, [new File(['sample'], 'Choir.wav')], false)
    expect(await attachment.sourceId('schedule')).toBe(await importIdentity([
      'easyworship-schedule-attachments-v1', 'schedule', [['audio:choir.wav', { archivePath: [...attachment.attachments.keys()][0] }]],
    ]))
  })

  it('fills original source slots while preserving local edits and unrelated references', async () => {
    const review = await reviewEasyWorshipScheduleMedia(cues, [new File(['audio'], 'Choir.wav'), new File(['video'], 'Clouds.mp4')], true)
    const recovery = recoverableScheduleMedia({ sourceId: 'schedule' }, cues, review.links)!
    expect(recovery.verifiedAttachments).toBeUndefined()
    const slide = structuredClone(cues[0].slides[0])
    slide.lines = ['Locally edited words']
    slide.label = 'Local title'
    slide.design!.layers[0].frame.x = .25
    const extra = { ...slide, sourceId: 'local-slide' }
    const local = { ...cues[0], label: 'Local cue title', slides: [extra, slide], metadata: { notes: 'Keep this' } }
    const restored = fillScheduleMedia(local, recovery)!
    expect(restored.cue?.slides[0]).toEqual(extra)
    expect(restored.cue?.slides[1]).toMatchObject({ label: slide.label, lines: slide.lines, design: { layers: [
      { frame: { x: .25 }, asset: { archivePath: expect.stringContaining('/clouds.mp4'), clip: { startSeconds: 2 } } },
    ] } })
    expect(restored.cue?.metadata).toEqual(local.metadata)
    expect(fillScheduleMedia(restored.cue!, recovery)).toEqual({ matched: true, different: false, cue: undefined })
  })

  it('recognizes the same file through a profile but keeps another import or a local replacement', async () => {
    const direct = await reviewEasyWorshipScheduleMedia(cues, [new File(['audio'], 'Choir.wav')], false)
    const { mediaImportId } = direct.links.get('audio:choir.wav')!
    const original = { sourceId: 'schedule' }
    const fromProfile = recoverableScheduleMedia(original, cues, new Map([
      ['audio:choir.wav', { mediaImportId, libraryId: mediaImportId }],
    ]))!
    const linked = fillScheduleMedia(direct.cues[0], fromProfile)!
    expect(linked.cue?.slides[0].assets?.[0]).toMatchObject({ libraryId: mediaImportId })
    expect(linked.cue?.slides[0].assets?.[0].archivePath).toBe(direct.cues[0].slides[0].assets?.[0].archivePath)
    expect(fillScheduleMedia(linked.cue!, fromProfile)).toEqual({ matched: true, different: false, cue: undefined })
    const replacement = await reviewEasyWorshipScheduleMedia(cues, [new File(['different bytes'], 'Choir.wav')], false)
    expect(fillScheduleMedia(replacement.cues[0], fromProfile)).toEqual({ matched: false, different: true, cue: undefined })
    const local = structuredClone(cues[0])
    local.slides[0].assets![0].libraryId = 'user-selected-audio'
    expect(fillScheduleMedia(local, fromProfile)).toEqual({ matched: false, different: false, cue: undefined })
  })

  it('keeps different native versions of the same filename in their original slots', async () => {
    const first = new File(['first version'], 'Choir.wav')
    const second = new File(['second version'], 'Choir.wav')
    const [firstHash, secondHash] = await Promise.all([mediaFileHash(first), mediaFileHash(second)])
    const cue = structuredClone(cues[0])
    cue.slides[0].assets = [firstHash, secondHash].map((easyWorshipFileHash) => ({
      kind: 'audio', filename: 'Choir.wav', role: 'background', easyWorshipFileHash,
    }))
    delete cue.slides[0].design
    const partial = await reviewEasyWorshipScheduleMedia([cue], [second], false)
    expect(partial.cues[0].slides[0].assets?.map(({ archivePath }) => Boolean(archivePath))).toEqual([false, true])
    expect(partial.cues[0].warnings).toContain('ไม่พบไฟล์ Choir.wav ใน .ewsx')
    const complete = await reviewEasyWorshipScheduleMedia([cue], [second, first], false)
    expect(complete.unresolved).toEqual([])
    const media = complete.cues[0].slides[0].assets!
    expect(await complete.attachments.get(media[0].archivePath!)?.text()).toBe('first version')
    expect(await complete.attachments.get(media[1].archivePath!)?.text()).toBe('second version')
    const recovery = recoverableScheduleMedia({ sourceId: 'schedule' }, [cue], complete.links)!
    expect(fillScheduleMedia(partial.cues[0], recovery)?.cue?.slides[0].assets).toEqual(media)
    const old = structuredClone(cue)
    old.slides[0].assets?.forEach((asset) => { delete asset.easyWorshipFileHash })
    expect(fillScheduleMedia(old, recovery)?.cue).toBeUndefined()
  })

  it('matches renamed originals by hash and keeps the same attachment identity', async () => {
    const original = new File(['choir source'], 'Choir.wav')
    const renamed = new File([original], 'Sunday opening.wav')
    const namesake = new File(['other source'], original.name)
    const cue = structuredClone(cues[0])
    const asset = cue.slides[0].assets![0]
    asset.easyWorshipFileHash = await mediaFileHash(original)
    asset.easyWorshipFileSize = original.size

    const mismatched = await reviewEasyWorshipScheduleMedia([cue], [namesake], false)
    expect(mismatched.attachments.size).toBe(0)
    expect(mismatched.links.size).toBe(0)
    expect(mismatched.unresolved).toContain('Choir.wav · ไฟล์แนบไม่ตรงกับฉบับที่ตารางอ้างอิง')

    const standard = await reviewEasyWorshipScheduleMedia([cue], [original], false)
    const resolved = await reviewEasyWorshipScheduleMedia([cue], [namesake, renamed], false)
    expect(resolved.links).toEqual(standard.links)
    expect(recoverableScheduleMedia({ sourceId: 'schedule' }, [cue], resolved.links)?.verifiedAttachments).toBe(true)
    expect(await resolved.sourceId('schedule')).toBe(await standard.sourceId('schedule'))
    expect(await [...resolved.attachments.values()][0].text()).toBe('choir source')

    delete asset.easyWorshipFileSize
    expect((await reviewEasyWorshipScheduleMedia([cue], [renamed], false)).links).toEqual(standard.links)

    const mixed = await reviewEasyWorshipScheduleMedia([cue], [renamed, new File(['video'], 'Clouds.mp4')], true)
    expect(mixed.links.size).toBe(2)
    expect(recoverableScheduleMedia({ sourceId: 'schedule' }, [cue], mixed.links)?.verifiedAttachments).toBeUndefined()
  })
})
