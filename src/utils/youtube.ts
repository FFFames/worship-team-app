/** Utilities for validating YouTube URLs and converting them to privacy-enhanced embeds. */

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

export function getYouTubeVideoId(value: string): string | null {
  const input = value.trim()
  if (!input) return null

  try {
    const url = new URL(input.startsWith('http://') || input.startsWith('https://') ? input : `https://${input}`)
    if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null

    let videoId = ''
    if (url.hostname.toLowerCase().endsWith('youtu.be')) {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? ''
    } else if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v') ?? ''
    } else {
      const [kind, id] = url.pathname.split('/').filter(Boolean)
      if (kind === 'embed' || kind === 'shorts' || kind === 'live') videoId = id ?? ''
    }

    return YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null
  } catch {
    return null
  }
}

export function getYouTubeEmbedUrl(value: string): string | null {
  const videoId = getYouTubeVideoId(value)
  return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null
}
