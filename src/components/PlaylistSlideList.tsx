import type { PlaylistSong } from '../types/database'
import { getPlaylistSlides } from '../utils/playlistCues'
import { designTextLines } from '../utils/slideDesign'

export function PlaylistSlideList({ entry }: { entry: PlaylistSong }) {
  const slides = getPlaylistSlides(entry, 'stanza')
  if (!slides.length) return <p className="mt-2! text-sm text-[var(--fg-secondary)]">รายการนี้ไม่มีสไลด์</p>

  return <ol className="mt-3! grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {slides.map((slide, index) => {
      const lines = slide.lines.length ? slide.lines : slide.design ? designTextLines(slide.design) : []
      const media = [...new Set([
        ...(slide.assets?.map(({ filename }) => filename) ?? []),
        ...(slide.design?.layers.flatMap((layer) => layer.kind === 'media' ? [layer.asset.filename]
          : layer.kind === 'web' ? [layer.url] : []) ?? []),
      ])]
      return <li key={index} className="min-w-0 rounded-md bg-[var(--bg-tertiary)] p-2.5 text-sm wrap-anywhere">
        <p className="font-medium">{index + 1}. {slide.sectionLabel || 'สไลด์'}</p>
        {lines.length > 0 && <p className="mt-1! whitespace-pre-line text-[var(--fg-secondary)]">{lines.join('\n')}</p>}
        {media.length > 0 && <p className="mt-1! text-xs text-[var(--fg-secondary)]">{media.join(' · ')}</p>}
      </li>
    })}
  </ol>
}
