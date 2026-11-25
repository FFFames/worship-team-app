/** Aspect-fitted renderer for imported EasyWorship-style layered slides. */
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { DesignAsset, DesignElementReflection, DesignElementShadow, DesignFill, DesignLayer, DesignTextRun, DesignTextStyle, SlideDesign } from '../types/slideDesign'
import { readPlaylistMedia } from '../utils/scheduleMedia'
import { PresentationVideo } from './PresentationVideo'
import { PresentationWebFrame } from './PresentationWebFrame'
import { PresentationCamera } from './PresentationCamera'
import { SlideElementBorder } from './SlideElementBorder'
import { SlideElementReflection } from './SlideElementReflection'
import { SlideShapeMediaFilter } from './SlideShapeMediaFilter'
import { ParagraphTextRuns, StyledTextRuns, safeColor, safeFont } from './StyledTextRuns'
import { useMediaClip } from '../hooks/useMediaClip'
import { useFittedText } from '../hooks/useFittedText'
import { mediaClipBounds, mediaClipKey, videoPosterPosition } from '../utils/mediaClip'
import { isOutputBackground, visibleDesignTextRuns } from '../utils/slideDesign'
import { slideAspectRatio, slideRotation, visibleSlideFrame } from '../utils/slideFrame'
import { cameraInputKey, cameraLayerKey, presentationWebUrl, savedCameraInput } from '../utils/livePresentation'
import { resolveDvdAsset } from '../utils/dvdReplacement'
import { mediaVolume } from '../utils/mediaPlayback'
import { elementBorderPaths, elementShadowOffset, reflectionBounds } from '../utils/slideElementEffects'
import { validDesignShapePaths } from '../utils/designClipPaths'
import { shadeShapeFill } from '../utils/slideShapePaint'
import { revealSlideShape } from '../utils/slideShapePresets'

type LayeredVideoPlayback = {
  loop?: boolean; runId?: string
  audio?: boolean; audioPrompt?: boolean
  soundtrackActive?: boolean
  onOutcome?: (id: string, outcome: 'ended' | 'failed') => void
}
type LayeredSlideProps = {
  design: SlideDesign; playlistId?: string; preview?: boolean; className?: string; transparent?: boolean; web?: 'live' | 'passive' | 'mask'; hideText?: boolean; videoPlayback?: LayeredVideoPlayback
  showVideoPosters?: boolean
  clearForeground?: boolean
  cameraPlayback?: { report: (key: string, status: string | null) => void; audio: boolean; audioPrompt: boolean }
  measureText?: boolean
}

const clamp = (value: number, min: number, max: number, fallback: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

function fillStyle(fill: DesignFill): React.CSSProperties {
  if (fill.type === 'solid') return { backgroundColor: safeColor(fill.color, '#000') }
  const angle = clamp(fill.angle, -360, 360, 0)
  const stops = fill.stops.slice(0, 16).map((stop) => `${safeColor(stop.color, '#000')} ${clamp(stop.position, 0, 1, 0) * 100}%`)
  return { background: `linear-gradient(${angle}deg, ${stops.length ? stops.join(', ') : '#000, #000'})` }
}

function frameStyle(frame: DesignLayer['frame']): React.CSSProperties {
  const { x, y, width, height } = visibleSlideFrame(frame)
  return {
    position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%`,
  }
}

function mediaKey(asset: DesignAsset, playlistId?: string) {
  return asset.libraryId ? `library:${asset.libraryId}` : asset.archivePath && playlistId ? `schedule:${playlistId}:${asset.archivePath}` : null
}

function MediaLayer({ layer, playlistId, preview, posterSeconds, style, videoPlayback, suspended, renderSurface }: {
  layer: Extract<DesignLayer, { kind: 'media' }>; playlistId?: string; preview?: boolean; posterSeconds?: number
  style: CSSProperties; videoPlayback?: LayeredVideoPlayback; suspended: boolean; renderSurface: boolean
}) {
  const [loaded, setLoaded] = useState<{ key: string; url: string }>()
  const [audioBlocked, setAudioBlocked] = useState(false)
  const video = useRef<HTMLVideoElement | null>(null)
  const pausedForClear = useRef(false)
  const key = mediaKey(layer.asset, playlistId)
  const { onOutcome } = videoPlayback ?? {}
  const isVideo = layer.asset.kind === 'video'
  const loop = !preview && (videoPlayback?.loop ?? layer.loop ?? true)
  const bindClip = useMediaClip(posterSeconds === undefined ? layer.asset.clip : undefined, loop, () => onOutcome?.(layer.id, 'ended'))
  const bindVideo = useCallback((element: HTMLVideoElement | null) => {
    video.current = element
    bindClip(element)
  }, [bindClip])
  const url = loaded?.key === key ? loaded?.url : undefined
  const dvd = Boolean(layer.asset.dvd)
  const playback = layer.asset.playback ?? layer.asset.dvd?.playback
  const hasAudioSettings = dvd || playback?.muted !== undefined || playback?.volume !== undefined
  const volume = mediaVolume(playback)
  const audible = hasAudioSettings && !preview && !suspended && Boolean(videoPlayback?.audio)
    && (!videoPlayback?.soundtrackActive || layer.powerPointMedia) && playback?.muted !== true && volume > 0

  useLayoutEffect(() => {
    const player = video.current
    if (!url || !player || preview) return
    const resume = pausedForClear.current
    pausedForClear.current = suspended
    if (hasAudioSettings) {
      player.volume = volume
      player.muted = !audible
      setAudioBlocked(false)
    }
    if (suspended) {
      player.pause()
      return
    }
    if ((resume && player.ended) || (!audible && !resume)) return
    let current = true
    void player.play().catch((error: unknown) => {
      if (!current || !(error instanceof DOMException) || error.name !== 'NotAllowedError') return
      player.muted = true
      setAudioBlocked(true)
      void player.play().catch(() => {})
    })
    return () => { current = false }
  }, [url, hasAudioSettings, volume, audible, suspended, preview])
  useEffect(() => {
    if (!key) {
      if (isVideo) onOutcome?.(layer.id, 'failed')
      return
    }
    let cancelled = false
    const read = readPlaylistMedia(playlistId, layer.asset.archivePath, layer.asset.libraryId)
    let objectUrl: string | undefined
    void read.then((blob) => {
      if (!blob || cancelled) {
        if (!cancelled && isVideo) onOutcome?.(layer.id, 'failed')
        return
      }
      objectUrl = URL.createObjectURL(blob)
      setLoaded({ key, url: objectUrl })
    }).catch(() => { if (!cancelled && isVideo) onOutcome?.(layer.id, 'failed') })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [key, layer.asset.libraryId, layer.asset.archivePath, playlistId, isVideo, layer.id, onOutcome])
  if (!url) return null
  const fitted = { ...style, objectFit: layer.fit ?? 'contain' }
  if (layer.asset.kind === 'image' && layer.crop) {
    const left = clamp(layer.crop.left, -2, 1, 0)
    const top = clamp(layer.crop.top, -2, 1, 0)
    const width = 1 - left - clamp(layer.crop.right, -2, 1, 0)
    const height = 1 - top - clamp(layer.crop.bottom, -2, 1, 0)
    if (width > 0 && height > 0) return (
      <div style={{ ...style, overflow: 'hidden' }}>
        <img src={url} alt="" aria-hidden="true" style={{
          position: 'absolute', objectFit: 'fill', maxWidth: 'none', maxHeight: 'none',
          width: `${100 / width}%`, height: `${100 / height}%`, left: `${-100 * left / width}%`, top: `${-100 * top / height}%`,
        }} />
      </div>
    )
  }
  return layer.asset.kind === 'image'
    ? <img src={url} alt="" aria-hidden="true" style={fitted} />
    : <>
      <PresentationVideo src={url} ref={bindVideo} alphaMode={layer.asset.alphaMode} renderSurface={renderSurface} aria-hidden="true" style={fitted}
        muted={!audible || audioBlocked} playsInline
        loop={loop && !mediaClipKey(layer.asset.clip)} autoPlay={!preview && !suspended}
        preload={posterSeconds === undefined ? undefined : 'auto'}
        onLoadedMetadata={posterSeconds === undefined ? undefined : ({ currentTarget: player }) => {
          const time = videoPosterPosition(posterSeconds, player.duration)
            ?? mediaClipBounds(layer.asset.clip ?? {}, player.duration)?.start
          if (time !== undefined && time !== player.currentTime) player.currentTime = time
        }}
        onError={() => onOutcome?.(layer.id, 'failed')} onAlphaError={() => onOutcome?.(layer.id, 'failed')} />
      {audible && audioBlocked && videoPlayback?.audioPrompt && (
        <div style={{ ...style, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <button type="button" className="pointer-events-auto rounded-md bg-black/90 px-3! py-2! text-sm text-white"
            onClick={() => {
              const player = video.current
              if (!player) return
              player.muted = false
              void player.play().then(() => setAudioBlocked(false)).catch(() => { player.muted = true })
            }}>{dvd ? 'เปิดเสียงคลิป DVD' : 'เปิดเสียงวิดีโอ'}</button>
        </div>
      )}
    </>
}

function textStyle(style: DesignTextStyle | undefined): React.CSSProperties {
  const vertical = style?.verticalAlign ?? 'center'
  return {
    color: safeColor(style?.color, '#fff'), fontFamily: safeFont(style?.fontFamily), fontSize: `${clamp(style?.fontSize ?? 0.045, 0.01, 0.3, 0.045) * 100}cqh`,
    fontWeight: style?.bold ? 700 : 400, fontStyle: style?.italic ? 'italic' : 'normal', textDecoration: style?.underline ? 'underline' : 'none', textAlign: style?.align ?? 'center',
    display: 'flex', alignItems: vertical === 'top' ? 'flex-start' : vertical === 'bottom' ? 'flex-end' : 'center', justifyContent: style?.align === 'left' ? 'flex-start' : style?.align === 'right' ? 'flex-end' : 'center', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
    textShadow: style?.shadow ? `0 2px 4px ${safeColor(style.shadowColor, 'rgba(0,0,0,.8)')}` : undefined,
    WebkitTextStroke: style?.outlineColor ? `0.035em ${safeColor(style.outlineColor, '#000')}` : undefined,
    paintOrder: style?.outlineColor ? 'stroke fill' : undefined,
  }
}

function richText(runs: DesignTextRun[], base: DesignTextStyle | undefined) {
  if (runs.some((run) => run.paragraph)) return <ParagraphTextRuns runs={runs} base={base} />
  if (!runs.some((run) => run.align)) return <StyledTextRuns runs={runs} base={base} />
  const paragraphs: { align: DesignTextRun['align']; runs: DesignTextRun[] }[] = []
  for (const run of runs) {
    const align = run.align ?? base?.align ?? 'center'
    const previous = paragraphs[paragraphs.length - 1]
    if (previous?.align === align) previous.runs.push(run)
    else paragraphs.push({ align, runs: [run] })
  }
  return paragraphs.map(({ align, runs: paragraph }, index) => (
    <span key={index} className="block" style={{ textAlign: align }}><StyledTextRuns runs={paragraph} base={base} /></span>
  ))
}

function FittedText({ layer, runs, style }: { layer: Extract<DesignLayer, { kind: 'text' }>; runs?: DesignTextRun[]; style: CSSProperties }) {
  const { text } = layer
  const frameRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  useFittedText(frameRef, textRef, { text, runs, style })

  return (
    <div ref={frameRef} style={style}>
      <span ref={textRef} className="block min-w-0 w-full" style={{ lineHeight: 1.25 }}>{runs ? richText(runs, layer.style) : text}</span>
    </div>
  )
}

function elementShadowFilter(shadow: DesignElementShadow) {
  const { x, y } = elementShadowOffset(shadow)
  const blur = clamp(shadow.blur, 0, 0.2, 0) * 100
  const color = /^#[0-9a-f]{6}$/i.test(shadow.color) ? shadow.color : '#000000'
  const alpha = Math.round(clamp(shadow.opacity, 0, 1, 1) * 255).toString(16).padStart(2, '0')
  return `drop-shadow(${(x * 100).toFixed(6)}cqh ${(y * 100).toFixed(6)}cqh ${blur}cqh ${color}${alpha})`
}

function visibleReflection(layer: DesignLayer): DesignElementReflection | undefined {
  const reflection = layer.elementReflection
  if (reflection && reflection.size > 0 && reflection.opacity > 0) return reflection
}

function sameReflection(first?: DesignElementReflection, next?: DesignElementReflection) {
  if (!first || !next) return first === next
  return first.group === next.group && first.opacity === next.opacity && first.size === next.size
    && first.blur === next.blur && first.distance === next.distance
}

export function LayeredSlide({ design, playlistId, preview, showVideoPosters = true, clearForeground = false, className, transparent = false, web, hideText,
  videoPlayback, cameraPlayback, measureText }: LayeredSlideProps) {
  const maskId = useId()
  const aspect = slideAspectRatio(design.aspectRatio)
  const layers = useMemo(() => design.layers.map((layer) => layer ? revealSlideShape(layer, aspect) : layer), [design.layers, aspect])
  const masks = layers.flatMap((layer, index) => layer?.clipPaths?.length ? [{ index, paths: layer.clipPaths }] : [])
  const styledPaths = useMemo(() => layers.map((layer) => validDesignShapePaths(layer?.shapePaths) ? layer.shapePaths : undefined), [layers])
  const shadedMedia = layers.map((layer, index) => (layer?.kind === 'media' || layer?.kind === 'camera')
    && styledPaths[index]?.some(({ fill }) => fill !== 'none' && fill !== 'norm'))
  const background = transparent ? 'transparent' : '#000'
  return (
    <div className={className} style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background, containerType: 'size' }}>
      <div style={{ position: 'relative', width: `min(100cqw, ${aspect * 100}cqh)`, aspectRatio: aspect, overflow: 'hidden', background, containerType: 'size' }}>
        {(masks.length > 0 || styledPaths.some(Boolean)) && <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
          <defs>
            {masks.map(({ index, paths }) => <clipPath key={index} id={`${maskId}-${index}`} clipPathUnits="objectBoundingBox">
              {paths.map((path, pathIndex) => <path key={pathIndex} d={path} />)}
            </clipPath>)}
            {styledPaths.map((paths, index) => {
              if (!paths) return null
              if (shadedMedia[index]) return <SlideShapeMediaFilter key={index} id={`${maskId}-shade-${index}`} paths={paths} />
              if (layers[index].kind !== 'fill') return null
              return paths.map(({ fill, d }, pathIndex) => fill !== 'none' && <clipPath key={`${index}-${pathIndex}`}
                id={`${maskId}-fill-${index}-${pathIndex}`} clipPathUnits="objectBoundingBox"><path d={d} /></clipPath>)
            })}
          </defs>
        </svg>}
        {paintLayers()}
      </div>
    </div>
  )

  function paintLayers() {
    const painted = []
    const reflectionEngine = !measureText && typeof CSS !== 'undefined'
      ? CSS.supports('-webkit-box-reflect', 'below 0px') ? 'webkit'
        : CSS.supports('background-image', '-moz-element(#source)') ? 'gecko' : undefined
      : undefined
    for (let index = 0; index < layers.length; index++) {
      const layer = layers[index]
      if (!layer?.frame) continue
      const shadow = layer.elementShadow || undefined
      const reflection = reflectionEngine ? visibleReflection(layer) : undefined
      const filter = shadow?.opacity ? elementShadowFilter(shadow) : undefined
      if (!filter && !reflection) {
        painted.push(paintLayer(layer, index))
        continue
      }
      const start = index
      // Paint one effect on the source element's combined visuals.
      while (index + 1 < layers.length) {
        const next = layers[index + 1]
        if (!next?.frame) break
        const nextShadow = next.elementShadow
        if (filter && (!nextShadow || nextShadow.group !== shadow?.group || elementShadowFilter(nextShadow) !== filter)) break
        if (!filter && nextShadow && nextShadow.opacity > 0) break
        if (reflectionEngine && !sameReflection(reflection, visibleReflection(next))) break
        index++
      }
      const group = layers.slice(start, index + 1)
      if (reflection && reflectionEngine) {
        const bounds = reflectionBounds(group, aspect)
        painted.push(<SlideElementReflection key={`reflection:${layer.id}`} reflection={reflection}
          shadow={filter ? shadow : undefined} order={start} aspect={aspect} engine={reflectionEngine} {...bounds}>
          {group.map((item, offset) => paintLayer(item, start + offset, bounds.top))}
        </SlideElementReflection>)
      } else {
        painted.push(<div key={`shadow:${layer.id}`} className="pointer-events-none absolute inset-0"
          style={{ zIndex: start, filter }} data-element-shadow={shadow?.group}>
          {group.map((item, offset) => paintLayer(item, start + offset))}
        </div>)
      }
    }
    return painted
  }

  function paintLayer(layer: DesignLayer, index: number, reflectionTop?: number) {
    if (!layer?.frame) return null
    const hidden = clearForeground && !isOutputBackground(layer)
    if (hidden && layer.kind !== 'media') return null
    const position: CSSProperties = {
      ...frameStyle(layer.frame),
      ...(reflectionTop === undefined ? {} : {
        top: `${(visibleSlideFrame(layer.frame).y - reflectionTop) * 100}cqh`,
        height: `${visibleSlideFrame(layer.frame).height * 100}cqh`,
      }),
      zIndex: index,
      ...(layer.rotation ? { transform: `rotate(${slideRotation(layer.rotation)}deg)` } : {}),
    }
    const style: CSSProperties = {
      ...position,
      opacity: clamp(layer.opacity ?? 1, 0, 1, 1),
      ...(hidden || (layer.kind !== 'text' && styledPaths[index]?.every(({ fill }) => fill === 'none')) ? { visibility: 'hidden' } : {}),
      ...(layer.clipPaths?.length ? { clipPath: `url("#${maskId}-${index}")` } : {}),
      ...(shadedMedia[index] ? { filter: `url("#${maskId}-shade-${index}")` } : {}),
    }
    const visual = renderLayer(layer, index, style, hidden, reflectionTop !== undefined || Boolean(shadedMedia[index]))
    return layer.elementBorder && !hidden ? <Fragment key={layer.id}>
      {visual}
      <SlideElementBorder border={layer.elementBorder} paths={elementBorderPaths(layer, aspect)} styledPaths={styledPaths[index]}
        style={position} id={`${maskId}-border-${index}`} />
    </Fragment> : visual
  }

  function renderLayer(layer: DesignLayer, index: number, style: CSSProperties, hidden: boolean, renderSurface: boolean) {
    if (layer.kind === 'fill' && styledPaths[index]) return (
      <div key={layer.id} style={style}>
        {styledPaths[index].map(({ fill }, pathIndex) => fill !== 'none' && <div key={pathIndex} className="absolute inset-0"
          data-shape-fill={fill} style={{ ...fillStyle(shadeShapeFill(layer.fill, fill)),
            clipPath: `url("#${maskId}-fill-${index}-${pathIndex}")` }} />)}
      </div>
    )
    if (layer.kind === 'fill') return (
      <div key={layer.id} style={{
        ...style,
        ...fillStyle(layer.fill),
        borderRadius: layer.shape === 'ellipse' ? '50%' : layer.shape === 'roundRect' ? '2cqh' : undefined,
        outline: layer.outline ? `${clamp(layer.outline.width, 0, 0.1, 0) * 100}cqh solid ${safeColor(layer.outline.color, 'transparent')}` : undefined,
        outlineOffset: layer.outline ? `-${clamp(layer.outline.width, 0, 0.1, 0) * 50}cqh` : undefined,
      }} />
    )
    if (layer.kind === 'media') {
      const asset = resolveDvdAsset(layer.asset)
      const loopingVideo = layer.loop && asset.kind === 'video' && mediaKey(asset, playlistId)
      const runId = layer.asset.kind === 'video' ? videoPlayback?.runId : undefined
      const key = runId ? `${layer.id}:${runId}` : loopingVideo ? `${loopingVideo}:${index}` : layer.id
      const clipKey = mediaClipKey(asset.clip)
      const posterSeconds = preview && showVideoPosters && asset.kind === 'video' ? asset.posterSeconds : undefined
      const previewKey = posterSeconds === undefined ? '' : `:poster:${posterSeconds}`
      if (preview && asset.dvd && !mediaKey(asset, playlistId)) return (
        <div key={layer.id} style={{ ...style, fontSize: '3cqh' }}
          className="grid place-content-center overflow-hidden bg-black/85 px-2 text-center text-white">{asset.dvd.name}</div>
      )
      return <MediaLayer key={`${key}${clipKey ? `:${clipKey}` : ''}${previewKey}`}
        layer={asset === layer.asset ? layer : { ...layer, asset }} style={style} playlistId={playlistId} preview={preview}
        posterSeconds={posterSeconds} videoPlayback={videoPlayback} suspended={hidden} renderSurface={renderSurface} />
    }
    if (layer.kind === 'camera') {
      if (preview) return <div key={layer.id} style={{ ...style, fontSize: '3cqh' }}
        className="grid place-content-center overflow-hidden bg-black/85 px-2 text-center text-white">{layer.asset.filename}</div>
      const input = cameraPlayback && (savedCameraInput(cameraInputKey(playlistId ?? '', layer.asset))
        ?? savedCameraInput(cameraInputKey('', layer.asset)))
      if (!input || !cameraPlayback) return null
      return <div key={layer.id} style={{ ...style, overflow: 'hidden' }} data-camera-layer={layer.id}>
        <PresentationCamera deviceId={input.deviceId} feedKey={cameraLayerKey(layer.id)} background={layer.asset.role === 'background'}
          hasText={false} label={layer.asset.filename} feedVideo={layer.asset.feedVideo} renderSurface={renderSurface}
          audioDeviceId={cameraPlayback.audio ? input.audioDeviceId : undefined}
          audioLevel={cameraPlayback.audio ? input.audioLevel : undefined} audioPrompt={cameraPlayback.audioPrompt}
          report={cameraPlayback.report} />
      </div>
    }
    if (layer.kind === 'web') {
      if (layer.powerPointMedia) {
        return web === 'live' && !hidden ? <PresentationWebFrame key={layer.id} url={layer.url} onlineVideo
          title="วิดีโอออนไลน์จาก PowerPoint" style={{ ...style, pointerEvents: 'auto', backgroundColor: 'transparent' }} /> : null
      }
      const url = presentationWebUrl(layer.url)
      if (!url) return null
      if (web === 'mask') return <div key={layer.id} aria-hidden="true" style={{ ...style, backgroundColor: '#000' }} />
      if (web) return <PresentationWebFrame key={layer.id} url={url} hideScrollbars={layer.hideScrollbars} passive={web === 'passive'}
        title={`${web === 'passive' ? 'เว็บบนจอแสดงผล' : 'เว็บบนจอผู้ชม'} · ${new URL(url).hostname}`} style={{ ...style, pointerEvents: 'auto' }} />
      if (preview) return <div key={layer.id} style={{ ...style, fontSize: '3cqh' }}
        className="grid place-content-center overflow-hidden bg-black/85 px-2 text-center text-white">
        {new URL(url).hostname}
      </div>
      return null
    }
    if (hideText) return null
    const runs = visibleDesignTextRuns(layer)
    const insets = layer.textLayout?.insets
    const padding = layer.style?.padding === undefined ? '1%' : `${clamp(layer.style.padding, 0, 0.2, 0) * 100}cqh`
    const inset = (value: number | undefined, unit: 'cqw' | 'cqh') =>
      value === undefined ? padding : `${clamp(value, 0, 1, 0) * 100}${unit}`
    const textFrameStyle: CSSProperties = {
      ...style, ...textStyle(layer.style),
      ...(layer.elementShadow !== undefined ? { textShadow: undefined } : {}),
      ...(runs ? { textDecoration: 'none' } : {}),
      padding: `${inset(insets?.top, 'cqh')} ${inset(insets?.right, 'cqw')} ${inset(insets?.bottom, 'cqh')} ${inset(insets?.left, 'cqw')}`,
      boxSizing: 'border-box',
    }
    const fit = layer.textLayout?.sizing ? layer.textLayout.sizing === 'fit' : layer.style?.fitText
    if (measureText) return <div key={layer.id} style={textFrameStyle} data-measure-text={layer.slot}>
      <span className="block min-w-0 w-full" style={{ lineHeight: 1.25 }}>{runs ? richText(runs, layer.style) : layer.text}</span>
    </div>
    if (fit) return <FittedText key={layer.id} layer={layer} runs={runs} style={textFrameStyle} />
    return <div key={layer.id} style={textFrameStyle}>
      {runs ? <span className="block min-w-0 w-full">{richText(runs, layer.style)}</span> : layer.text}
    </div>
  }
}

export default LayeredSlide
