import { describe, expect, it } from 'vitest'
import { keyboardJumpIndex, parseEasyWorshipHotkeys } from './presentationKeyboard'

describe('EasyWorship presentation keyboard', () => {
  it('reads native aliases and modifiers, keeping conflicting or disabled-version commands out of the active set', () => {
    const source = new TextEncoder().encode(`\ufeff[HotKeys]\r\nSlideNextKeys=78,39,32,0\r\n
    GoLiveNextKeys=34\nGoLivePrevKeys=33\nBlackScreenKeys=C-66\nClearScreenKeys=S-C-67
    SlidePrevKeys=80, 39, 37\nJumpChorusKeys=67\n[Settings]\nJumpChorusKeys=82`)
    const result = parseEasyWorshipHotkeys(source, 'HotKeys.2.ini')
    expect(result.profile.bindings).toEqual({
      KeyN: 'nextSlide', ArrowRight: 'nextSlide', Space: 'nextSlide', PageDown: 'goLive',
      'Ctrl+KeyB': 'black', 'Ctrl+Shift+KeyC': 'clear', KeyP: 'previousSlide', ArrowLeft: 'previousSlide', KeyC: 'chorus',
    })
    expect(result.ignored).toEqual(['GoLivePrevKeys · 33', 'SlidePrevKeys · 39'])
  })

  it('reads an older UTF-16 file and rejects unrelated INI files', () => {
    const text = '[HotKeys]\r\nScheduleNextKeys=39\r\nSlideNextKeys=40, 78\r\nBlackScreenKeys=190\r\n'
    const bytes = Uint8Array.from([255, 254, ...Array.from(text).flatMap((character) => [character.charCodeAt(0), 0])])
    expect(parseEasyWorshipHotkeys(bytes, 'HotKeys.ini').profile.bindings).toEqual({
      ArrowRight: 'nextCue', ArrowDown: 'nextSlide', KeyN: 'nextSlide', Period: 'black',
    })
    expect(() => parseEasyWorshipHotkeys(new TextEncoder().encode('[Settings]'), 'Settings.ini')).toThrow(/HotKeys/)
  })

  it('selects explicit section numbers in imported cues even where older cue records used verse as a fallback', () => {
    const slides = [
      { sectionType: 'verse', sectionLabel: 'Verse 1' },
      { sectionType: 'verse', sectionLabel: 'Verse 1' },
      { sectionType: 'verse', sectionLabel: 'Chorus 2' },
      { sectionType: 'verse', sectionLabel: 'Pre-Chorus 3' },
      { sectionType: 'hook', sectionLabel: 'Hook' },
      { sectionType: 'outro', sectionLabel: 'Outro' },
    ] as const
    expect(keyboardJumpIndex(slides, 'chorus', 2)).toBe(2)
    expect(keyboardJumpIndex(slides, 'preChorus', 3)).toBe(3)
    expect(keyboardJumpIndex(slides, 'chorus', 1)).toBe(4)
    expect(keyboardJumpIndex(slides, 'ending', 1)).toBe(5)
    expect(keyboardJumpIndex(slides, 'verse', 8)).toBe(-1)
    expect(keyboardJumpIndex(slides, 'slideNumber', 3)).toBe(2)
    expect(keyboardJumpIndex([
      { sectionType: 'verse', sectionLabel: '1' },
      { sectionType: 'verse', sectionLabel: '1' },
      { sectionType: 'verse', sectionLabel: '2' },
    ], 'verse', 2)).toBe(2)
  })
})
