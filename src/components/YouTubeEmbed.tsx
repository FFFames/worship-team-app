/** Responsive, lazy-loaded YouTube player shared by song detail and stage views. */

import { getYouTubeEmbedUrl } from '../utils/youtube'

interface YouTubeEmbedProps {
  url: string
  title: string
  compact?: boolean
}

export function YouTubeEmbed({ url, title, compact = false }: YouTubeEmbedProps) {
  const embedUrl = getYouTubeEmbedUrl(url)
  if (!embedUrl) return null

  return (
    <div
      className="surface"
      style={{
        width: '100%',
        maxWidth: compact ? 560 : 800,
        margin: compact ? '0 auto var(--space-lg)' : '0 0 var(--space-lg)',
        overflow: 'hidden',
        aspectRatio: '16 / 9',
      }}
    >
      <iframe
        src={embedUrl}
        title={`YouTube: ${title}`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
      />
    </div>
  )
}
