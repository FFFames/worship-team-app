import { describe, expect, it, vi } from 'vitest'
import { decodeSavedOutputSettings, defaultScriptureOutputSettings, parseEasyWorshipOutputSettings } from './outputSettings'
import { outputSettingsStorageKey, readOutputAppearanceBackup, readOutputSettings, restoreOutputAppearanceBackup, restoreScriptureOutputSettings, saveOutputSettings } from './outputSettingsStorage'
import { matchOutputDisplay } from './outputWindows'

describe('EasyWorship screen margins', () => {
  const settings = [
    '[Live_Output_Monitor]',
    'Left=-1920',
    '[Live_Screen_Margins]',
    'Top=32',
    'Right=16',
    'Bottom=8',
    'Left=40',
    '[FoldBack_Screen_Margins]',
    ' Left = 25 ; overscan',
    'Top=0',
    '[Alt_Screen_Margins]',
    'Left=90',
    '[Alt_Output_Monitor]',
    'Show_Background=0',
    'Show_Foreground=1 ; follow',
    'Left=1200',
    '[Live_Output_Monitor]',
    'Show_Foreground=0',
  ].join('\r\n')
  const expected = {
    margins: { live: { top: 32, right: 16, bottom: 8, left: 40 }, stage: { top: 0, left: 25 }, alternate: { left: 90 } },
    alternateLayers: { background: false, foreground: true },
  }

  it('reads screen margins and alternate output flags independently of physical monitor positions', () => {
    expect(parseEasyWorshipOutputSettings(new TextEncoder().encode(settings))).toEqual(expected)
  })

  it('supports UTF-16 INI files with a byte order mark', () => {
    for (const littleEndian of [true, false]) {
      const bytes = new Uint8Array((settings.length + 1) * 2)
      const view = new DataView(bytes.buffer)
      view.setUint16(0, 0xfeff, littleEndian)
      for (let index = 0; index < settings.length; index++) {
        view.setUint16((index + 1) * 2, settings.charCodeAt(index), littleEndian)
      }
      expect(parseEasyWorshipOutputSettings(bytes)).toEqual(expected)
    }
  })

  it('keeps valid partial values and ignores malformed or out-of-range values', () => {
    const source = '[foldback_screen_margins]\nBoTtOm=15\nLeft=-10\nRight=9999999\nTop=3.5\n[Alt_Output_Monitor]\nShow_Background=no'
    expect(parseEasyWorshipOutputSettings(new TextEncoder().encode(source))).toEqual({
      margins: { live: {}, stage: { bottom: 15 }, alternate: {} },
      alternateLayers: {},
    })
    const stored = decodeSavedOutputSettings('{"live":{"top":7, "right":"14", "left":-8}}')
    expect(stored.live).toEqual({ top: 7, right: 0, bottom: 0, left: 0 })
    expect(stored.alternate).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    expect(stored.alternateLayers).toEqual({ background: true, foreground: true })
    expect(decodeSavedOutputSettings('{"alternateLayers":{"background":false,"foreground":"0"}}').alternateLayers)
      .toEqual({ background: false, foreground: true })
  })
})

describe('physical output display assignments', () => {
  const projector = { label: 'Projector', left: -1920, top: -100, width: 1920, height: 1080 }
  const moved = { ...projector, left: 1920, top: 0, width: 1280, height: 720 }

  it('preserves valid rectangles and loads previous settings without display assignments', () => {
    const settings = decodeSavedOutputSettings(JSON.stringify({
      displays: { live: projector, stage: { ...projector, width: 0 }, alternate: { ...moved, left: '1920' } },
    }))
    expect(settings.displays).toEqual({ live: projector })
    expect(decodeSavedOutputSettings('{"live":{"top":30}}').displays).toEqual({})
  })

  it('remembers the separate Alpha Key monitor and validates its fill source', () => {
    const key = { label: 'Key monitor', left: 2560, top: 0, width: 1920, height: 1080 }
    const settings = decodeSavedOutputSettings(JSON.stringify({ alphaSource: 'alternate', displays: { key, live: projector } }))
    expect(settings.alphaSource).toBe('alternate')
    expect(settings.displays).toEqual({ live: projector, key })
    expect(decodeSavedOutputSettings(null).alphaSource).toBeNull()
    expect(decodeSavedOutputSettings('{"alphaSource":"stage"}').alphaSource).toBeNull()
  })

  it('uses the exact rectangle when two displays have the same label', () => {
    const exact = { ...projector }
    expect(matchOutputDisplay(projector, [moved, exact])).toBe(exact)
    expect(matchOutputDisplay(projector, [moved, { ...moved, left: 3200 }])).toBeUndefined()
  })

  it('recognizes a uniquely named display that moved and skips unrelated screens', () => {
    const other = { ...projector, label: 'Laptop' }
    expect(matchOutputDisplay(projector, [other, moved])).toBe(moved)
    expect(matchOutputDisplay(projector, [other])).toBeUndefined()
    expect(matchOutputDisplay({ ...projector, label: '' }, [{ ...moved, label: '' }])).toBeUndefined()
  })
})

it('restores unconfigured output groups while honoring a previous reset and the local device setup', () => {
  const projector = { label: 'Local projector', left: -1920, top: 0, width: 1920, height: 1080 }
  const stored = new Map([[outputSettingsStorageKey, JSON.stringify({ live: { top: 25 }, displays: { live: projector }, alphaSource: 'live' })]])
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) })
  vi.stubGlobal('window', new EventTarget())
  try {
    const local = readOutputSettings()
    expect(local.scripture).toEqual({ live: defaultScriptureOutputSettings, alternate: defaultScriptureOutputSettings })
    saveOutputSettings({ ...local, live: { ...local.live, top: 0 } })
    expect(readOutputAppearanceBackup()).toEqual({ live: { top: 0, left: 0, right: 0, bottom: 0 } })
    const backup = { live: { top: 60, right: 0, bottom: 0, left: 15 }, stage: { top: 15, right: 3, bottom: 2, left: 1 },
      alternateLayers: { foreground: false, background: false }, scripture: {
        live: { reference: 'before-slide' as const, completePassage: true },
        alternate: { reference: 'reference-only' as const, completePassage: false },
      } }
    expect(restoreOutputAppearanceBackup(backup)).toBe(3)
    expect(restoreOutputAppearanceBackup(backup)).toBe(0)
    expect(readOutputSettings()).toMatchObject({ live: { top: 0, left: 0 }, stage: backup.stage, alternateLayers: backup.alternateLayers,
      scripture: backup.scripture, displays: { live: projector }, alphaSource: 'live' })
  } finally { vi.unstubAllGlobals() }
})

it('imports Scripture output defaults independently and preserves a saved reset on repeat import', () => {
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) })
  vi.stubGlobal('window', new EventTarget())
  const audience = { ...defaultScriptureOutputSettings, verseNumbers: true, fonts: { text: { fontFamily: 'Georgia' } } }
  const broadcast = { ...defaultScriptureOutputSettings, reference: 'reference-only' as const }
  try {
    saveOutputSettings({ ...readOutputSettings(), scripture: { live: audience, alternate: defaultScriptureOutputSettings } })
    expect(restoreScriptureOutputSettings('live', { ...audience, verseNumbers: false })).toBe(false)
    expect(restoreScriptureOutputSettings('alternate', broadcast)).toBe(true)
    expect(readOutputAppearanceBackup().scripture).toEqual({ live: audience, alternate: broadcast })
    saveOutputSettings({ ...readOutputSettings(), scripture: { live: audience, alternate: defaultScriptureOutputSettings } })
    expect(restoreScriptureOutputSettings('alternate', broadcast)).toBe(false)
    expect(readOutputSettings().scripture).toEqual({ live: audience, alternate: defaultScriptureOutputSettings })
    stored.set(outputSettingsStorageKey, JSON.stringify({ configuredAppearance: ['scripture'] }))
    expect(restoreScriptureOutputSettings('alternate', broadcast)).toBe(false)
    stored.clear()
    saveOutputSettings(readOutputSettings(), ['scripture'])
    expect(restoreScriptureOutputSettings('alternate', broadcast)).toBe(false)
    expect(restoreScriptureOutputSettings('live', audience)).toBe(false)
  } finally { vi.unstubAllGlobals() }
})

it('fills missing stage service intervals without resetting style or restoring removed intervals', () => {
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) })
  vi.stubGlobal('window', new EventTarget())
  try {
    const intervals = [{ startDay: 0, startSeconds: 32400, endDay: 0, endSeconds: 36000 }]
    const backup = { foldbackService: { enabled: true, format: 'hh:nn:ss' as const, intervals } }
    saveOutputSettings({ ...readOutputSettings(), foldbackService: { enabled: false } })
    expect(restoreOutputAppearanceBackup(backup)).toBe(1)
    expect(readOutputSettings().foldbackService).toEqual({ enabled: false, intervals })
    expect(restoreOutputAppearanceBackup(backup)).toBe(0)
    saveOutputSettings({ ...readOutputSettings(), foldbackService: { enabled: false, intervals: [] } })
    expect(restoreOutputAppearanceBackup(backup)).toBe(0)
    stored.clear()
    saveOutputSettings({ ...readOutputSettings(), foldbackService: { intervals } })
    expect(restoreOutputAppearanceBackup({ foldbackService: { enabled: true } })).toBe(1)
    expect(readOutputSettings().foldbackService).toEqual({ enabled: true, intervals })
  } finally { vi.unstubAllGlobals() }
})
