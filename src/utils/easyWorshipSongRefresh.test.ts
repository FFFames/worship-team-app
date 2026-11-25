/** Protects incremental song migration when a later source includes more native data. */

import { describe, expect, it } from 'vitest'
import type { Section } from '../types/database'
import type { DesignLayer, SlideDesign } from '../types/slideDesign'
import { missingEasyWorshipSongFields, type SongImportSnapshot } from './easyWorshipSongRefresh'
import { MISSING_VERIFIED_LAYOUT_MEDIA } from './slideDesign'

const frame = { x: .1, y: .1, width: .8, height: .8 }
const caption = { id: 'caption', kind: 'text', text: 'ก', frame } as const
const film = { id: 'film', kind: 'media', frame, asset: { kind: 'video', filename: 'Stage.wmv', clip: { startSeconds: 2 } } } as const
const lyric = { id: 'lyrics', kind: 'text', slot: 'content', text: '', frame } as const
const original: SlideDesign = {
  aspectRatio: 16 / 9, layers: [caption, film, lyric],
  soundtracks: [{ kind: 'audio', filename: 'Organ.wav', role: 'foreground' }],
}
const incoming: SlideDesign = { ...original, layers: [
  { ...caption, textLayout: { sizing: 'fit' }, runs: [{ text: 'ก', paragraph: { index: 0, leftIndent: .5 } }] },
  { ...film, asset: { ...film.asset, filename: 'Stage.mp4', libraryId: 'restored-film', clip: { startSeconds: 3 } } },
  lyric,
], soundtracks: [{ kind: 'audio', filename: 'Organ.wav', role: 'background', libraryId: 'restored-audio' }] }
const sections: Section[] = [
  { type: 'verse', marker: '', label: 'Verse 1', lines: [{ chords: '', lyrics: 'ก' }], slideBreaks: [] },
  { type: 'hook', marker: '**', label: 'Chorus', lines: [{ chords: '', lyrics: 'ข' }], slideBreaks: [] },
]
const raw_content = '[Lyrics only]\n[Section Verse 1]\nก\n\n[Section Chorus]\nข'
const source: SongImportSnapshot = { raw_content, sections, appearance: {
  sections: [
    { index: 0, label: 'Verse 1', design: incoming },
    { index: 1, label: 'Chorus', design: { ...original, layers: [lyric], soundtracks: undefined } },
  ],
} }

describe('incremental EasyWorship song import', () => {
  it('adopts a missing layer angle on a matching chart while keeping a local zero angle', () => {
    const base = { raw_content, sections, appearance: { defaultDesign: original } }
    const incoming = { ...base, appearance: { defaultDesign: {
      ...original, layers: [{ ...caption, rotation: -20 }, { ...film, rotation: -45 }, lyric],
    } } }
    const saved = { ...base, appearance: { defaultDesign: { ...original, layers: [{ ...caption, rotation: 0 }, film, lyric] } } }
    const changed = missingEasyWorshipSongFields(saved, incoming)
    expect(changed.appearance?.defaultDesign?.layers.map(({ rotation }) => rotation)).toEqual([0, -45, undefined])
    expect(missingEasyWorshipSongFields({ ...saved, ...changed }, incoming)).toEqual({})
  })

  it('fills missing native timers and looping while preserving a locally disabled loop and manual advance', () => {
    const playback = { mode: 'timer', delayMs: 2500 } as const
    const source = { raw_content, sections: sections.map((section) => ({ ...section, playback })), appearance: { looping: true } }
    expect(missingEasyWorshipSongFields({ raw_content, sections, appearance: null }, source)).toMatchObject({
      sections: [{ playback }, { playback }], appearance: { looping: true },
    })
    const local = { raw_content, sections: [{ ...sections[0], playback: { mode: 'manual' as const } }, sections[1]],
      appearance: { looping: false } }
    expect(missingEasyWorshipSongFields(local, source)).toEqual({
      sections: [local.sections[0], { ...sections[1], playback }],
    })
  })

  it('restores a missing checked video only from matching bytes and clears its warning', () => {
    const hash = 'a'.repeat(64)
    const missing = { ...film, asset: { ...film.asset, easyWorshipFileHash: hash } }
    const saved: SongImportSnapshot = { raw_content, sections, appearance: {
      defaultDesign: { aspectRatio: 16 / 9, layers: [missing] },
      warnings: [MISSING_VERIFIED_LAYOUT_MEDIA + missing.asset.filename],
    } }
    function incoming(filename: string, digest: string): SongImportSnapshot {
      return { raw_content, sections, appearance: { defaultDesign: { aspectRatio: 16 / 9, layers: [{
        ...missing, asset: { ...missing.asset, filename, easyWorshipFileHash: digest, libraryId: 'restored-video' },
      }] } } }
    }
    expect(missingEasyWorshipSongFields(saved, incoming(missing.asset.filename, 'b'.repeat(64)))).toEqual({})
    const { appearance } = missingEasyWorshipSongFields(saved, incoming('Renamed.mp4', hash))
    expect(appearance?.defaultDesign?.layers[0]).toMatchObject({
      asset: { filename: 'Renamed.mp4', easyWorshipFileHash: hash, libraryId: 'restored-video' },
    })
    expect(appearance?.warnings).toBeUndefined()
  })

  it('recovers files and formatting into a partial layout while keeping local scope overrides', () => {
    const master = { frame: { y: .3 } }
    const saved: SongImportSnapshot = { raw_content, sections, appearance: { slideLayout: master,
      sections: [{ index: 0, label: 'Verse 1', design: original }], warnings: [
        'ไม่พบไฟล์ Stage.wmv ที่อ้างอิงจากเลย์เอาต์', 'ไม่พบไฟล์เสียง Organ.wav ที่อ้างอิงจากเลย์เอาต์',
        'เลย์เอาต์บางท่อนไม่ตรงกับรหัสสไลด์ของเนื้อร้อง', 'คำแจ้งอื่น',
      ] } }
    const patch = missingEasyWorshipSongFields(saved, source)
    const appearance = patch.appearance!
    expect(appearance.slideLayout).toBe(master)
    expect(appearance.warnings).toEqual(['คำแจ้งอื่น'])
    expect(appearance.sections?.[1]).toEqual(source.appearance?.sections?.[1])
    const filled = appearance.sections?.[0].design
    expect(filled?.layers[0]).toEqual(incoming.layers[0])
    expect(filled?.layers[1]).toMatchObject({ frame, asset: { filename: 'Stage.mp4', libraryId: 'restored-film', clip: { startSeconds: 2 } } })
    expect(filled?.soundtracks).toEqual([{ kind: 'audio', filename: 'Organ.wav', role: 'foreground', libraryId: 'restored-audio' }])
    expect(missingEasyWorshipSongFields({ ...saved, ...patch }, source)).toEqual({})
  })

  it('preserves edited text, an existing media assignment, and a changed chart', () => {
    const localLayers = [
      { ...caption, text: 'Local caption', frame: { ...frame, x: .2 } },
      { ...film, asset: { ...film.asset, libraryId: 'choose-this' } }, lyric,
    ] satisfies DesignLayer[]
    const local: SongImportSnapshot = { raw_content, sections, appearance: { sections: [
      { index: 0, label: 'Verse 1', design: { ...original, layers: localLayers, soundtracks: undefined } },
      source.appearance!.sections![1],
    ] } }
    expect(missingEasyWorshipSongFields(local, source)).toEqual({})
    expect(missingEasyWorshipSongFields({ ...local, raw_content: 'Local chart' }, source)).toEqual({})
  })

  it('adds source lyric runs only to matching unformatted chart sections', () => {
    const styled = [{ text: 'ก', paragraph: { index: 0, leftIndent: .5 } }]
    const newSections = [{ ...sections[0], lyricRuns: styled }, sections[1]]
    const old = { raw_content, sections: [{ ...sections[0], slideLayouts: [{ start: 0, layout: { frame: { x: .25 } } }] }, sections[1]] }
    const unformatted = missingEasyWorshipSongFields(old, { raw_content, sections: newSections })
    expect(unformatted.sections?.[0]).toEqual({ ...old.sections[0], lyricRuns: styled })
    const edited = [{ ...old.sections[0], lyricRuns: [{ text: 'ก', style: { bold: true } }] }, sections[1]]
    expect(missingEasyWorshipSongFields({ raw_content, sections: edited }, { raw_content, sections: newSections })).toEqual({})
  })

  it('fills missing effects without replacing an operator cut or an explicit theme choice', () => {
    const transition = { uid: 'sdDXPush', values: { Duration: '750', 'Value-Direction': '3' } }
    const imported = { raw_content, sections: sections.map((section) => ({ ...section, transition })) }
    const localCut = { uid: '', values: {} }
    const old = { raw_content, sections: [sections[0], { ...sections[1], transition: localCut }] }
    expect(missingEasyWorshipSongFields(old, imported).sections).toEqual([
      { ...sections[0], transition }, { ...sections[1], transition: localCut },
    ])
    const reset = { raw_content, sections: [{ ...sections[0], transition: null }, old.sections[1]] }
    expect(missingEasyWorshipSongFields(reset, imported)).toEqual({})
  })

  it('restores media defaults on matching song layouts while keeping rewritten artwork and the existing chart', () => {
    const video = { ...film, asset: { ...film.asset, libraryId: 'source-video' }, fit: 'cover' as const, loop: true }
    const soundtrack = { kind: 'audio' as const, filename: 'Organ.wav', role: 'foreground' as const, libraryId: 'original-organ' }
    const original = { aspectRatio: 16 / 9, layers: [video, lyric], soundtracks: [{ ...soundtrack, repeat: false }] }
    const updated = { ...original, layers: [{ ...video, fit: 'contain' as const, loop: false,
      easyWorshipLegacyPlayback: { fit: 'cover' as const, loop: true },
      asset: { ...video.asset, playback: { muted: true, volume: .45 } } }, lyric],
      soundtracks: [{ ...soundtrack, repeat: true, playback: { volume: .3 } }] }
    const before = { raw_content, sections, appearance: { defaultDesign: original } }
    const after = { raw_content, sections, appearance: { defaultDesign: updated } }
    const patch = missingEasyWorshipSongFields(before, after)
    expect(patch.sections).toBeUndefined()
    expect(patch.appearance?.defaultDesign).toMatchObject({ layers: updated.layers,
      soundtracks: [{ ...soundtrack, repeat: false, playback: { volume: .3 } }] })
    expect(missingEasyWorshipSongFields({ ...before, ...patch }, after)).toEqual({})
    const local = { ...video, asset: { ...video.asset, libraryId: 'local-replacement' } }
    const replacement = { ...before, appearance: { defaultDesign: { ...original, layers: [local, lyric] } } }
    expect(missingEasyWorshipSongFields(replacement, after).appearance?.defaultDesign?.layers[0]).toBe(local)
  })
})
