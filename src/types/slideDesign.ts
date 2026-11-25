/** Stored slide designs shared by the library and the audience display. */

import type { MediaCatalogReference, MediaClip, MediaPlayback, VideoAlphaMode } from './media'
import type { DvdClip } from './dvdClip'
import type { FeedAsset } from './liveFeed'
import type { ScriptureFrameSource } from './scripture'
import type { TextEffects } from '../utils/alertTextEffects'

export type DesignFrame = { x: number; y: number; width: number; height: number }

export type DesignFill =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; angle: number; stops: { color: string; position: number }[] }

export type DesignShapeFill = 'none' | 'norm' | 'darken' | 'darkenLess' | 'lightenLess' | 'lighten'

export type DesignShapePath = {
  d: string
  fill: DesignShapeFill
  stroke: boolean
}

export type SlideShapePreset = 'rectangle' | 'roundRect' | 'ellipse' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon'
  | 'star' | 'arrow' | 'chevron' | 'cross' | 'line'

export type SlideShapeSettings = { preset: SlideShapePreset; adjustment?: number }

export type DesignAsset = {
  kind: 'image' | 'video'
  filename: string
  libraryId?: string
  mediaCatalog?: MediaCatalogReference
  archivePath?: string
  mediaImportId?: string
  easyWorshipFileHash?: string
  easyWorshipFileSize?: number
  easyWorshipSourceLocationId?: string
  sourcePath?: string
  importSourceId?: string
  importName?: string
  clip?: MediaClip
  posterSeconds?: number
  alphaMode?: VideoAlphaMode
  playback?: MediaPlayback
  dvd?: DvdClip
}

export type DesignSoundtrack = Omit<DesignAsset, 'kind' | 'dvd' | 'posterSeconds'> & {
  inheritedFromMaster?: true
  kind: 'audio'
  role: 'foreground' | 'background'
  repeat?: boolean
  powerPointMediaId?: string
  powerPointTransitionSound?: true
  /** Earlier imports omitted false repeat. */
  easyWorshipLegacyRepeat?: false
}

export type DesignTextStyle = {
  color?: string
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
  shadow?: boolean
  shadowColor?: string
  outlineColor?: string
  fitText?: boolean
  padding?: number
}

/** Paragraph distances in em at the text box's current font size. */
export type DesignParagraphFormat = {
  index: number
  leftIndent?: number
  rightIndent?: number
  firstLineIndent?: number
  spaceBefore?: number
  spaceAfter?: number
  lineSpacing?: { mode: 'multiple' | 'minimum' | 'exact'; value: number }
  list?: DesignParagraphList | false
  /** Insets relative to the display, used when projecting a reference. */
  outputInsets?: DesignTextLayout['insets']
}

export type DesignListStyle = 'bullet' | 'literal' | 'decimal' | 'upper-roman' | 'lower-roman' | 'upper-alpha' | 'lower-alpha'
export type DesignParagraphList = {
  style: DesignListStyle
  punctuation?: 'period' | 'parenthesis' | 'parentheses'
  text?: string
  level?: number
  start?: number
}

export type DesignTextRun = {
  text: string
  align?: DesignTextStyle['align']
  paragraph?: DesignParagraphFormat
  style?: Pick<DesignTextStyle, 'color' | 'fontFamily' | 'bold' | 'italic' | 'underline'> & {
    sizeScale?: number
    /** Output overrides are applied to presentation copies of the stored text. */
    output?: { fontRatio?: number; effects?: TextEffects }
    fontOpacity?: number
    strike?: boolean
    baseline?: 'super' | 'sub' | 'normal'
    outline?: false | { color?: string; width?: number }
    textShadow?: false | { color?: string; blur?: number; offset?: number; angle?: number }
  }
}

export type DesignTextLayout = {
  insets?: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>
  sizing?: 'fit' | 'fixed'
}

export type DesignElementBorder = {
  color: string
  opacity: number
  /** Thickness as a fraction of the slide height. */
  width: number
  position: 'outer' | 'center' | 'inner'
  join: 'round' | 'miter' | 'bevel'
}

export type DesignElementShadow = {
  /** Source element ID shared by its background and foreground. */
  group: string
  color: string
  opacity: number
  /** Blur and distance as fractions of the slide height. */
  blur: number
  offset: number
  /** Degrees counterclockwise from screen right. */
  angle: number
}

export type DesignElementReflection = {
  /** Source element ID shared by its background and foreground. */
  group: string
  opacity: number
  /** Fraction of the reflected frame visible before the fade reaches zero. */
  size: number
  /** Blur and gap as fractions of the slide height. */
  blur: number
  distance: number
}

export type ElementEffectChanges = {
  elementBorder?: DesignElementBorder | false
  elementShadow?: Omit<DesignElementShadow, 'group'> | false
  elementReflection?: Omit<DesignElementReflection, 'group'> | false
}

export type SongElementEffectChange = {
  /** Defaults to the current lyric frame, including when an output uses another theme. */
  layerId?: string
  effects: ElementEffectChanges
}

type DesignLayerBase = { id: string; frame: DesignFrame; opacity?: number; rotation?: number; songArtwork?: true; inheritedFromMaster?: true;
  /** Closed contours in coordinates relative to the layer's frame. */
  clipPaths?: string[]
  /** Ordered paths with their saved fill mode and stroke visibility. */
  shapePaths?: DesignShapePath[]
  /** A local shape choice, or an explicit rectangular frame over imported geometry. */
  presetShape?: SlideShapeSettings | false
  elementBorder?: DesignElementBorder | false
  elementShadow?: DesignElementShadow | false
  elementReflection?: DesignElementReflection | false }

export type PresentationField = 'title' | 'subtitle' | 'content' | 'scripture'

export type DesignLayer = DesignLayerBase & (
  | { kind: 'fill'; fill: DesignFill; role?: 'foreground' | 'background'; shape?: 'roundRect' | 'ellipse'; outline?: { color: string; width: number } }
  | { kind: 'web'; url: string; role?: 'foreground' | 'background'; hideScrollbars?: boolean; powerPointMedia?: true }
  | { kind: 'camera'; asset: FeedAsset }
  | {
    kind: 'media'
    role?: 'foreground' | 'background'
    asset: DesignAsset
    fit?: 'cover' | 'contain' | 'fill'
    loop?: boolean
    powerPointMedia?: true
    /** The pre-playback-import values, used to match existing native layouts. */
    easyWorshipLegacyPlayback?: { fit?: 'cover' | 'contain' | 'fill'; loop?: boolean }
    crop?: { left: number; top: number; right: number; bottom: number }
  }
  | { kind: 'text'; text: string; runs?: DesignTextRun[]; slot?: 'content' | 'reference'; presentationField?: PresentationField;
    style?: DesignTextStyle; textLayout?: DesignTextLayout; scriptureSource?: ScriptureFrameSource }
)

export type SlideDesign = {
  aspectRatio: number
  layers: DesignLayer[]
  powerPointBuild?: PowerPointBuild
  inheritBackground?: boolean
  /** Tracks that inherited Feed layers have already been materialized, even after an operator removes them. */
  cameraMasterImported?: true
  backgroundMasterImported?: true
  /** Fingerprint of the editable PowerPoint layout that this rendered slide can replace. */
  powerPointLayoutBeforeRendering?: string
  powerPointLayoutBeforeMedia?: string
  /** Remembers that the table layers were imported, even if subsequently removed in the editor. */
  powerPointTablesImported?: true
  /** Link slots already resolved by an import, including media an operator later removed. */
  powerPointResolvedMediaLinks?: string[]
  powerPointStopTransitionSound?: true
  soundtracks?: DesignSoundtrack[]
}

/** Visibility changes applied together by one advance on an editable PowerPoint slide. */
export type PowerPointBuild = { layerId: string; visible: boolean }[][]

export type SongArtworkLayer = Extract<DesignLayer, { kind: 'text' | 'media' | 'camera' | 'fill' }>
export type SongArtworkChange =
  | { action: 'add' | 'update'; layer: SongArtworkLayer }
  | { action: 'hide'; id: string }
export type SongArtwork = { changes?: SongArtworkChange[]; order?: string[] }

/** An operator's background, lyric placement and foreground layers on a song slide. */
export type SongSlideLayout = {
  frame?: Partial<DesignFrame>
  style?: Pick<DesignTextStyle, 'align' | 'verticalAlign' | 'fontSize' | 'fitText'>
  background?: { kind: 'fill'; fill: DesignFill } | { kind: 'media'; asset: DesignAsset; loop?: boolean } | { kind: 'camera'; asset: FeedAsset }
  artwork?: SongArtwork
  elementEffects?: SongElementEffectChange[]
}

export type SongAppearance = {
  looping?: boolean
  defaultDesign?: SlideDesign
  slideLayout?: SongSlideLayout
  sections?: { index: number; label: string; design: SlideDesign }[]
  warnings?: string[]
}

export type AppliedSlideTheme = { title: string; design: SlideDesign; transition?: SlideTransition }

/** An empty UID explicitly cuts. An omitted UID can inherit a theme effect. */
export type SlideTransition = { uid?: string; values: Record<string, string> }

export type SlidePlaybackSettings = {
  mode?: 'manual' | 'timer' | 'media'
  delayMs?: number
  loop?: boolean
  restart?: boolean
}

export type DesignSlide = {
  id: string
  label: string
  speakerNotes?: string
  songLabel?: string
  design: SlideDesign
  template?: string
  advanceMs?: number
  transition?: SlideTransition
  transitionEdited?: true
  playback?: SlidePlaybackSettings
}

export type DesignKind = 'presentation' | 'song-theme' | 'scripture-theme' | 'text-theme' | 'presentation-theme'

export type DesignSource = {
  format: 'easyworship' | 'powerpoint'
  uid: string
  catalogUid?: string
  author?: string
  copyright?: string
  description?: string
  collectionDetails?: { tags?: string; filename?: string; folder?: string }
}

export type DesignContent = {
  slides: DesignSlide[]
  notes?: string
  looping?: boolean
  source?: DesignSource
  webLayersImported?: true
  dvdLayersImported?: true
  cameraLayersImported?: true
  easyWorshipChecksumImportId?: string
  /** Index of the former combined border/reflection warning in the import identity. */
  easyWorshipDecorationWarningAt?: number
  warnings?: string[]
}

export type LibraryDesign = {
  id: string
  title: string
  kind: DesignKind
  content: DesignContent
  created_at: string
}
