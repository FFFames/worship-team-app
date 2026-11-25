/** Display labels and slide conversion shared by schedule screens. */

import type { PlaylistCue, PlaylistCueAsset, PlaylistSong, Section, Song } from '../types/database'
import type { AppliedSlideTheme, DesignTextRun, SlideDesign, SlidePlaybackSettings, SlideTransition, SongElementEffectChange } from '../types/slideDesign'
import { buildSlides, type LyricLayout, type Slide } from './slideBuilder'
import { applyPresentationBackground, applyThemeText, designSoundtrackAssets } from './slideDesign'
import { chooseDefaultThemeSlide, type OutputDefaultThemes, type ThemeSubject } from './defaultThemes'
import { resolveSlideTransition } from './slideTransitions'
import { arrangedCueSlides, reflowSongCueSlide, songSlideLyricRuns } from './songCueLayout'
import { applySongLyricRuns } from './songLyricFormatting'
import { librarySectionCue, preparedLibrarySection, songLibrarySections } from './songLibrarySlides'
import { applySongSlideLayout, carrySongArtwork, mergeSongSlideLayout } from './songSlideLayout'
import { getSectionSlideLabel } from './chordParser'
import { legacyScriptureReference, scriptureDesignWithoutSavedReference, scriptureFlowDesign, scripturePassageReference, scriptureReference,
  type ScriptureReference } from './scriptureOutput'

export const CUE_LABELS: Record<PlaylistCue['kind'], string> = {
  song: 'เพลง',
  scripture: 'ข้อพระคัมภีร์',
  presentation: 'งานนำเสนอ',
  image: 'ภาพ',
  video: 'วิดีโอ',
  audio: 'เสียง',
  web: 'เว็บ',
  camera: 'กล้อง',
  powerpoint: 'PowerPoint',
  unknown: 'รายการจาก EasyWorship',
}

export function songOutputLabel(label: string): string | undefined {
  const name = label.trim()
  return name && !/^(?:slide|สไลด์)\s+\d+$/i.test(name) ? name : undefined
}

export type PlaylistSlide = Slide & {
  assets?: PlaylistCueAsset[]; subtitle?: string; design?: SlideDesign; template?: string
  speakerNotes?: string
  lyricRuns?: DesignTextRun[]
  songElementEffects?: SongElementEffectChange[]
  scripture?: ScriptureReference
  advanceMs?: number; transition?: SlideTransition; localTransition?: SlideTransition; playback?: SlidePlaybackSettings; defaultTheme?: boolean
}

export function songSectionDesign(song: Pick<Song, 'appearance'>, sections: Section[], index: number): SlideDesign | undefined {
  const appearance = song.appearance
  const label = sections[index]?.label?.trim().toLowerCase()
  if (!appearance || !label) return appearance?.defaultDesign
  const matched = appearance.sections?.filter((entry) => entry.label.trim().toLowerCase() === label) ?? []
  return matched.find((entry) => entry.index === index)?.design
    ?? (matched.length === 1 && sections.filter((section) => section.label?.trim().toLowerCase() === label).length === 1 ? matched[0].design : undefined)
    ?? appearance.defaultDesign
}

export function getSongPresentationSlides(song: Song, layout: LyricLayout, theme?: AppliedSlideTheme, defaults?: OutputDefaultThemes): PlaylistSlide[] {
  const sections = songLibrarySections(song)
  return sections.flatMap((section, index) => {
    const libraryDesign = songSectionDesign(song, sections, index)
    const fallback = libraryDesign ? undefined : chooseDefaultThemeSlide(defaults, 'live', 'song', section.label)
    const design = theme ? carrySongArtwork(theme.design, libraryDesign) : libraryDesign ?? fallback?.design
    const localTransition = section.transition ?? undefined
    const transition = resolveSlideTransition(localTransition, theme ? theme.transition : fallback?.transition)
    const effects = { ...(transition ? { transition } : {}), ...(localTransition ? { localTransition } : {}),
      ...(section.playback ? { playback: section.playback } : {}) }
    const assets = designSoundtrackAssets(libraryDesign) ?? designSoundtrackAssets(design)
    const master = song.appearance?.slideLayout
    const prepared = Array.isArray(section.slideBreaks)
    if (prepared || section.lyricRuns) {
      const slides = prepared ? preparedLibrarySection(section, design, master)
        : reflowSongCueSlide(librarySectionCue(section, design), layout).map((slide) => applySongSlideLayout(slide, master))
      return slides.flatMap((slide) => slide.lines.some((line) => line.trim()) ? [{
        sectionType: section.type, sectionLabel: slide.label, lines: slide.lines, design: slide.design, assets,
        lyricRuns: songSlideLyricRuns(slide), ...effects,
        songElementEffects: slide.slideLayout?.elementEffects ?? master?.elementEffects,
      }] : [])
    }
    return buildSlides([section], layout).map((slide) => {
      const themed = design && applyThemeText(design, slide.lines.join('\n'))
      const projected = applySongSlideLayout({ label: slide.sectionLabel, lines: slide.lines, design: themed }, master).design
      return { ...slide, sectionLabel: getSectionSlideLabel(section) || slide.sectionLabel, songElementEffects: master?.elementEffects,
        ...(projected ? { design: projected } : {}), ...(assets?.length ? { assets } : {}), ...effects }
    })
  })
}

export function playlistThemeSubject(entry: PlaylistSong | undefined): ThemeSubject | undefined {
  const kind = entry?.cue?.kind
  if (kind === 'song' || kind === 'scripture' || kind === 'presentation') return kind
  if (!kind && entry?.song) return 'song'
  return undefined
}

export function playlistCueLooping(entry: PlaylistSong | undefined) {
  return entry?.cue ? entry.cue.looping : entry?.song?.appearance?.looping
}

export function getPlaylistSlides(entry: PlaylistSong | undefined, layout: LyricLayout, defaults?: OutputDefaultThemes): PlaylistSlide[] {
  const cue = entry?.cue
  const appliedTheme = entry?.slide_theme ?? undefined
  const theme = appliedTheme?.design
  if (cue) {
    const slides = cue.slides.length > 0 ? arrangedCueSlides(cue) : [{ label: cue.label, lines: [], assets: cue.assets }]
    const legacyReference = legacyScriptureReference(cue)
    const passage = cue.kind === 'scripture' ? scripturePassageReference(cue) : undefined
    return slides.map((slide, index) => {
      const sectionLabel = slide.label || cue.label
      const songLayout = cue.kind === 'song' ? mergeSongSlideLayout(cue.slideLayout, slide.slideLayout) : undefined
      const subtitle = cue.kind === 'scripture' ? sectionLabel : undefined
      const lyricRuns = cue.kind === 'song' || cue.kind === 'scripture' ? songSlideLyricRuns(slide) : undefined
      const subject = playlistThemeSubject(entry)
      const fallbackSlide = subject && chooseDefaultThemeSlide(defaults, 'live', subject, slide.template ?? sectionLabel)
      const fallback = fallbackSlide?.design
      const themeAudio = slide.assets?.some((asset) => asset.kind === 'audio') ? undefined
        : designSoundtrackAssets(theme ?? fallback)
      const assets = entry?.background_asset || themeAudio?.length
        ? [...(entry?.background_asset ? [entry.background_asset] : []), ...(slide.assets ?? []), ...(themeAudio ?? [])]
        : slide.assets
      const themed = (base: SlideDesign) => cue.kind === 'song'
        ? carrySongArtwork(applySongLyricRuns(base, slide.lines.join('\n'), lyricRuns), slide.design)
        : applySongLyricRuns(base, slide.lines.join('\n'), lyricRuns)
      let design = theme && (cue.kind === 'song' || cue.kind === 'scripture')
        ? themed(theme)
        : slide.design && subtitle && (slide.scriptureRange || legacyReference)
          ? scriptureDesignWithoutSavedReference(slide.design, slide.lines, subtitle, legacyReference)
        : slide.design
      const scriptureFlow = cue.kind === 'scripture' && cue.scriptureFlow && !slide.design
      const defaultTheme = (fallback || scriptureFlow) && !design && !songLayout?.background
      const usesTheme = appliedTheme && (cue.kind === 'song' || cue.kind === 'scripture')
      const inheritedTransition = usesTheme ? appliedTheme.transition
        : (!design || subject === 'presentation') ? fallbackSlide?.transition : undefined
      const transition = resolveSlideTransition(slide.transition, inheritedTransition)
      if (scriptureFlow) design = scriptureFlowDesign(slide.lines.join('\n'), theme ?? fallback, lyricRuns)
      else if (fallback) {
        if (!design) design = themed(fallback)
        else if (subject === 'presentation') design = applyPresentationBackground(fallback, design, false)
      }
      if (songLayout) design = applySongSlideLayout({ ...slide, design, lyricRuns }, songLayout).design
      return {
        sectionType: slide.sectionType ?? 'verse',
        sectionLabel,
        lines: slide.lines,
        ...(slide.speakerNotes ? { speakerNotes: slide.speakerNotes } : {}),
        assets,
        ...(lyricRuns ? { lyricRuns } : {}),
        ...(songLayout?.elementEffects?.length ? { songElementEffects: songLayout.elementEffects } : {}),
        ...(subtitle ? { subtitle } : {}),
        ...(subtitle ? { scripture: scriptureReference(cue, sectionLabel, index, passage) } : {}),
        ...(design ? { design } : {}),
        ...(slide.template ? { template: slide.template } : {}),
        ...(defaultTheme ? { defaultTheme: true } : {}),
        ...(slide.advanceMs ? { advanceMs: slide.advanceMs } : {}),
        ...(transition ? { transition } : {}),
        ...(slide.transition ? { localTransition: slide.transition } : {}),
        ...(slide.playback ? { playback: slide.playback } : {}),
      }
    })
  }

  const song = entry?.song
  return song ? getSongPresentationSlides(song, layout, appliedTheme, defaults).map((slide) => ({
    ...slide,
    assets: entry?.background_asset ? [entry.background_asset, ...(slide.assets ?? [])] : slide.assets,
  })) : []
}
