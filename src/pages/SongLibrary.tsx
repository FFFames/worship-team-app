/** SongLibrary — Grid layout of song cards
 *
 * Design system:
 * - Warm-tinted dark neutrals (OKLCH)
 * - Accent emerald used sparingly
 * - Balanced, breathable layouts
 * - Kanit display/body + Source Code Pro mono
 * - Exponential ease-out motion only; staggered card entrance
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSongs } from '../hooks/useSongs'
import { SongCard } from '../components/SongCard'
import { motion } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** Song Library page — grid of song cards */
export default function SongLibrary() {
  const navigate = useNavigate()
  const { songs, loading, error, searchQuery, setSearchQuery } = useSongs()
  const [sortBy, setSortBy] = useState('updated')

  // Filter songs by search and sort
  const filteredSongs = useMemo(() => {
    let result = [...songs]

    // Apply search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.artist && s.artist.toLowerCase().includes(q))
      )
    }

    // Apply sorting
    result.sort((a, b) => {
      if (sortBy === 'updated') {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title, 'th')
      }
      if (sortBy === 'artist') {
        return (a.artist || '').localeCompare(b.artist || '', 'th')
      }
      return 0
    })

    return result
  }, [songs, searchQuery, sortBy])

  const handleCreateNew = () => {
    navigate('/songs/new')
  }

  const handleEdit = (song: { id: string }) => {
    navigate(`/songs/${song.id}/edit`)
  }

  return (
    <div style={{ minHeight: '60vh' }}>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: easeOutExpo }}
        className="page-header"
      >
        <div className="page-title">
          <h1>คลังเพลง</h1>
          <p>{songs.length > 0 ? `${songs.length} เพลง · จัดการคอร์ดเพลงทั้งหมดของคุณในที่เดียว` : 'จัดการคอร์ดเพลงทั้งหมดของคุณในที่เดียว'}</p>
        </div>
        <div className="page-actions">
          <button onClick={handleCreateNew} className="btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17 }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            สร้างเพลงใหม่
          </button>
        </div>
      </motion.div>

      {/* Filter bar */}
      <div className="filter-bar">
        {/* Search box */}
        <div className="search-box">
          <div className="search-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="ค้นหาเพลง..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Sort dropdown */}
        <select className="sort-dropdown" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="updated">เรียงตาม: ล่าสุด</option>
          <option value="title">เรียงตาม: ชื่อ A-Z</option>
          <option value="artist">เรียงตาม: ศิลปิน</option>
        </select>
      </div>

      {/* Songs grid or empty state */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-3xl) 0' }}>
          <div className="spinner" />
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-3xl) 0' }}>
          <p style={{ color: 'var(--status-error-text)' }}>{error}</p>
        </div>
      )}

      {!loading && !error && filteredSongs.length > 0 && (
        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }} className="songs-grid">
          {filteredSongs.map((song) => (
            <motion.div
              key={song.id}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: easeOutExpo } } }}
            >
              <SongCard song={song} onEdit={handleEdit} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {!loading && !error && filteredSongs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <h2>ยังไม่มีเพลง</h2>
          <p>เริ่มต้นสร้างเพลงแรกของคุณ หรือนำเข้าจากไฟล์ที่มีอยู่</p>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleCreateNew} className="btn-primary">สร้างเพลงใหม่</button>
            <button className="btn-secondary">นำเข้าเพลง</button>
          </div>
        </div>
      )}
    </div>
  )
}
