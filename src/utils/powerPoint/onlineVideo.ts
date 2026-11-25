import { YOUTUBE_VIDEO_ID_PATTERN } from '../youtube'

/** Accepts only provider player URLs or links that identify a single video. */
export function powerPointOnlineVideoUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 4096) return undefined
  let url: URL
  try { url = new URL(value.trim().replace(/^\/\//, 'https://')) } catch { return undefined }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined
  const host = url.hostname
  const path = url.pathname.replace(/\/$/, '')
  const params = url.searchParams
  const fragment = new URLSearchParams(url.hash.slice(1))

  if (['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    const privacyEnhanced = host.endsWith('youtube-nocookie.com')
    const id = host === 'youtu.be' ? path.slice(1)
      : !privacyEnhanced && path === '/watch' ? params.get('v')
      : /^\/(?:embed|shorts|v)\/([^/]+)$/.exec(path)?.[1]
    if (!id || id === 'videoseries' || !YOUTUBE_VIDEO_ID_PATTERN.test(id)) return undefined
    const player = new URL(`https://${privacyEnhanced ? 'www.youtube-nocookie.com' : 'www.youtube.com'}/embed/${id}`)
    const start = params.get('start') ?? params.get('t') ?? fragment.get('t') ?? ''
    const end = params.get('end') ?? ''
    if (/^\d{1,8}$/.test(start)) player.searchParams.set('start', start)
    else {
      const time = /^(?:(\d{1,4})h)?(?:(\d{1,4})m)?(?:(\d{1,4})s)?$/.exec(start)
      if (time && start) player.searchParams.set('start', String(Number(time[1] ?? 0) * 3600 + Number(time[2] ?? 0) * 60 + Number(time[3] ?? 0)))
    }
    if (/^\d{1,8}$/.test(end) && Number(end) > Number(player.searchParams.get('start'))) player.searchParams.set('end', end)
    return player.href
  }

  if (!['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) return undefined
  const match = host === 'player.vimeo.com' ? /^\/video\/(\d{1,12})$/.exec(path) : /^\/(\d{1,12})(?:\/([a-f\d]{10}))?$/.exec(path)
  if (!match) return undefined
  const player = new URL(`https://player.vimeo.com/video/${match[1]}`)
  const hash = match[2] ?? params.get('h') ?? ''
  if (/^[a-f\d]{10}$/.test(hash)) player.searchParams.set('h', hash)
  const time = fragment.get('t') ?? ''
  if (/^(?:\d{1,6}m(?:\d{1,6}s)?|\d{1,6}s)$/.test(time)) player.hash = `t=${time}`
  return player.href
}

export function powerPointOnlineVideoHtml(value: string | undefined): string | undefined {
  if (!value || value.length > 32_768) return undefined
  const template = document.createElement('template')
  template.innerHTML = value
  for (const frame of template.content.querySelectorAll('iframe[src]')) {
    const url = powerPointOnlineVideoUrl(frame.getAttribute('src') ?? undefined)
    if (url) return url
  }
  return undefined
}
