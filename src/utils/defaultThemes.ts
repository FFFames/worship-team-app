import type { DesignAsset, DesignSlide, SlideDesign } from '../types/slideDesign'
import { applyPresentationBackground, applyPresentationLayout, isFullCanvasMediaSlide } from './slideDesign'
import { backfillDesignMediaPlayback, backfillDesignSlidePlayback } from './designSlidePlayback'
import { mediaObjectFit } from './mediaPlayback'
import { restoreSlideGeometry } from './designLayerGeometry'

export const themeOutputs = ['live', 'alternate'] as const
export const themeSubjects = ['song', 'scripture', 'presentation'] as const
export const defaultThemeSubjects = [...themeSubjects, 'logo'] as const
export const themeOutputLabels = { live: 'จอผู้ชม', alternate: 'จอถ่ายทอดสด' }
export const themeSubjectLabels = { song: 'เพลง', scripture: 'พระคัมภีร์', presentation: 'งานนำเสนอ', logo: 'โลโก้พักจอ' }
export type ThemeOutput = typeof themeOutputs[number]
export type ThemeSubject = typeof themeSubjects[number]
export type DefaultThemeSubject = typeof defaultThemeSubjects[number]
export type DefaultThemeSlot = `${ThemeOutput}:${DefaultThemeSubject}`
export type DefaultTheme = { id: string; title: string; slides: DesignSlide[]; looping?: boolean }
export type OutputDefaultThemes = Partial<Record<DefaultThemeSlot, DefaultTheme | null>>

export const defaultThemesStorageKey = 'worshipteam.default-themes.v1'
export const defaultThemesChanged = 'worshipteam:default-themes'

export function logoMediaTheme(id: string, title: string, asset: DesignAsset, repeat?: boolean): DefaultTheme {
  return { id, title, slides: [{ id: 'logo', label: title, design: { aspectRatio: 16 / 9, layers: [{
    id: 'logo-media', kind: 'media', asset, frame: { x: 0, y: 0, width: 1, height: 1 },
    fit: mediaObjectFit(asset.playback, true) ?? 'contain', ...(asset.kind === 'video' ? { loop: repeat ?? true } : {}),
  }] } }] }
}

export function decodeDefaultThemes(serialized: string | null): OutputDefaultThemes {
  if (!serialized) return {}
  try {
    const data = JSON.parse(serialized)
    const themes: OutputDefaultThemes = {}
    for (const output of themeOutputs) {
      for (const subject of defaultThemeSubjects) {
        const key: DefaultThemeSlot = `${output}:${subject}`
        const value = data?.[key]
        if (value === null) themes[key] = null
        else if (typeof value?.id === 'string' && typeof value.title === 'string' && Array.isArray(value.slides)
          && value.slides.every((slide: DesignSlide) => typeof slide?.label === 'string'
            && (slide.template === undefined || typeof slide.template === 'string') && Array.isArray(slide.design?.layers))) {
          themes[key] = value
        }
      }
    }
    return themes
  } catch {
    return {}
  }
}

export function readDefaultThemes() {
  return decodeDefaultThemes(localStorage.getItem(defaultThemesStorageKey))
}

export function saveDefaultThemes(patch: OutputDefaultThemes, preserveExisting = false) {
  const current = readDefaultThemes()
  let updates = 0
  for (const [slot, theme] of Object.entries(patch)) {
    const key = slot as DefaultThemeSlot
    if (preserveExisting && current[key] !== undefined) continue
    current[key] = theme
    updates++
  }
  if (updates) {
    localStorage.setItem(defaultThemesStorageKey, JSON.stringify(current))
    window.dispatchEvent(new Event(defaultThemesChanged))
  }
  return updates
}

export function backfillAssignedThemeDetails(id: string, slides: readonly DesignSlide[]) {
  const updates: OutputDefaultThemes = {}
  for (const [slot, theme] of Object.entries(readDefaultThemes())) {
    if (theme?.id !== id) continue
    const updated = backfillDesignSlidePlayback(theme.slides, slides)
    const media = backfillDesignMediaPlayback(updated.slides, slides)
    const geometry = restoreSlideGeometry(media.slides, slides)
    if (updated.count || media.count || geometry.slides !== media.slides) updates[slot as DefaultThemeSlot] = { ...theme, slides: geometry.slides }
  }
  if (Object.keys(updates).length) saveDefaultThemes(updates)
}

export function chooseDefaultTheme(
  themes: OutputDefaultThemes | undefined, output: ThemeOutput, subject: ThemeSubject, section?: string,
): SlideDesign | undefined {
  return chooseDefaultThemeSlide(themes, output, subject, section)?.design
}

export function chooseDefaultThemeSlide(
  themes: OutputDefaultThemes | undefined, output: ThemeOutput, subject: ThemeSubject, section?: string,
): DesignSlide | undefined {
  const slides = themes?.[`${output}:${subject}`]?.slides
  if (!slides?.length) return undefined
  const candidates = subject === 'presentation' ? slides : slides.filter((slide) =>
    slide.design.layers.some((layer) => layer.kind === 'text' && layer.slot === 'content'))
  const label = section?.trim().toLowerCase()
  const role = label?.replace(/\s+\d+$/, '')
  const match = (name?: string) => name && candidates.find((slide) =>
    slide.template?.toLowerCase() === name || slide.label.toLowerCase() === name)
  return match(label) || match(role) || (subject === 'presentation' && match('content')) || candidates[0]
}

export function hasPresentationFields(slides: DesignSlide[]): boolean {
  return slides.some((slide) => slide.design.layers.some((layer) => layer.kind === 'text' && layer.presentationField))
}

export function alternatePresentationDesign(
  themes: OutputDefaultThemes, template: string | undefined, label: string, slide: SlideDesign,
): SlideDesign {
  if (isFullCanvasMediaSlide(slide)) return slide
  const layouts = themes['alternate:presentation']?.slides
  const layoutType = template?.trim().toUpperCase()
  const matching = layoutType && layouts?.find((layout) => layout.template?.trim().toUpperCase() === layoutType)
  if (matching && layouts && hasPresentationFields(layouts)
    && (layoutType === 'BLANK' || slide.layers.some((layer) => layer.kind === 'text' && layer.presentationField))) {
    return applyPresentationLayout(matching.design, slide)
  }
  const backdrop = chooseDefaultTheme(themes, 'alternate', 'presentation', template ?? label)
  return backdrop ? applyPresentationBackground(backdrop, slide, true) : slide
}
