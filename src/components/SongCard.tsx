/** SongCard — Individual song card for grid layout
 *
 * Design system:
 * - Warm-tinted dark neutrals (OKLCH)
 * - Accent emerald used sparingly (icon + hover line)
 * - Kanit display/body + Source Code Pro mono for the key
 * - Exponential ease-out motion only
 */

import { Link } from 'react-router-dom'
import type { Song } from '../types/database'

interface SongCardProps {
  song: Song
  onEdit?: (song: Song) => void
}

export function SongCard({ song, onEdit }: SongCardProps) {
  // Format relative time (Thai)
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'วันนี้'
    if (diffDays === 1) return 'เมื่อวาน'
    if (diffDays < 7) return `${diffDays} วันที่แล้ว`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} สัปดาห์ที่แล้ว`
    return `${Math.floor(diffDays / 30)} เดือนที่แล้ว`
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onEdit?.(song)
  }

  return (
    <Link to={`/songs/${song.id}`} className="song-card" style={{ textDecoration: 'none' }}>
      {/* Action buttons (shown on hover) */}
      <div className="song-actions">
        <button className="song-action-btn" aria-label="แก้ไข" onClick={handleEditClick}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      {/* Card header with icon and key */}
      <div className="song-card-header">
        <div className="song-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        {song.original_key && <span className="song-key">{song.original_key}</span>}
      </div>

      {/* Title and artist */}
      <h3 className="song-title">{song.title}</h3>
      <p className="song-artist">{song.artist || 'Unknown artist'}</p>

      {/* Metadata */}
      <div className="song-meta">
        <div className="song-meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          แก้ไข {formatTimeAgo(song.updated_at)}
        </div>
      </div>
    </Link>
  )
}
