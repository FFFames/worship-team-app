/** PlaylistCard — Individual playlist card for grid layout
 *
 * Mirrors SongCard design — reuses the same OKLCH CSS classes
 * (.song-card, .song-card-header, .song-icon, etc.)
 */

import { Link } from 'react-router-dom'
import type { Playlist } from '../types/database'

interface PlaylistCardProps {
  playlist: Playlist
  onDelete?: (playlist: Playlist) => void
}

export function PlaylistCard({ playlist, onDelete }: PlaylistCardProps) {
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

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDelete?.(playlist)
  }

  return (
    <Link
      to={`/playlists/${playlist.id}`}
      className="song-card"
      style={{ textDecoration: 'none' }}
    >
      {/* Action buttons (shown on hover) */}
      <div className="song-actions">
        <button
          className="song-action-btn"
          aria-label="ลบ"
          onClick={handleDeleteClick}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>

      {/* Card header with icon and date badge */}
      <div className="song-card-header">
        <div className="song-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </div>
        {playlist.date && (
          <span className="song-key">{new Date(playlist.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
        )}
      </div>

      {/* Title and notes */}
      <h3 className="song-title">{playlist.name}</h3>
      <p className="song-artist">{playlist.notes?.slice(0, 80) || 'ไม่มีคำอธิบาย'}</p>

      {/* Metadata */}
      <div className="song-meta">
        <div className="song-meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          แก้ไข {formatTimeAgo(playlist.updated_at)}
        </div>
      </div>
    </Link>
  )
}
