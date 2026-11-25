/** SongLibrary — Grid layout of song cards
 *
 * Design system:
 * - Warm-tinted dark neutrals (OKLCH)
 * - Accent emerald used sparingly
 * - Balanced, breathable layouts
 * - Kanit display/body + Source Code Pro mono
 * - Exponential ease-out motion only; staggered card entrance
 */

import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useSongs } from '../hooks/useSongs'
import { SongCard } from '../components/SongCard'
import { useCollectionFilter } from '../hooks/useCollectionFilter'
import { LibraryCollectionControls } from '../components/LibraryCollectionControls'
import { prepareSongCollectionFilter } from '../utils/songCollectionRules'
import { orderedSongList, songSort } from '../utils/songList'
import { motion } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** Song Library page — grid of song cards */
export default function SongLibrary() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const searchScope = params.get('scope') === 'lyrics' ? 'lyrics' : 'metadata'
  const sortBy = songSort(params.get('sort'), 'updated')
  const searchQuery = params.get('q') ?? ''
  const collectionFilter = useCollectionFilter('songs')
  const activeCollection = collectionFilter.selected
  const collection = useMemo(() => activeCollection && prepareSongCollectionFilter(activeCollection.leaves), [activeCollection])
  const { songs, loading, error } = useSongs(true, searchScope, { collectionDetails: collection?.needsDetails, query: searchQuery })
  const filteredSongs = useMemo(() => orderedSongList(songs, sortBy, collection?.includesSong), [songs, sortBy, collection])
  function changeFilter(key: 'scope' | 'sort' | 'q', value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }

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
          <p>{activeCollection ? activeCollection.collection.path.join(' › ')
            : songs.length > 0 ? `${songs.length} เพลง · จัดการคอร์ดเพลงทั้งหมดของคุณในที่เดียว` : 'จัดการคอร์ดเพลงทั้งหมดของคุณในที่เดียว'}</p>
        </div>
        <div className="page-actions flex-wrap">
          <Link to="/songs/history" className="btn-secondary">ประวัติการใช้เพลง</Link>
          <Link to={{ pathname: '/songs/print', search: params.toString() }} className="btn-secondary">พิมพ์รายชื่อเพลง</Link>
          <Link to="/import/easyworship" className="btn-secondary">ย้ายโปรไฟล์ EasyWorship</Link>
          <Link to="/songs/import" className="btn-secondary">นำเข้า EasyWorship</Link>
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
            aria-label="ค้นหาเพลง"
            className="search-input"
            placeholder={searchScope === 'lyrics' ? 'ค้นหาคำในเนื้อเพลง…' : 'ค้นหาชื่อเพลงหรือศิลปิน…'}
            value={searchQuery}
            onChange={(event) => changeFilter('q', event.target.value)}
          />
        </div>

        <select aria-label="ค้นหาจาก" className="sort-dropdown" value={searchScope}
          onChange={(event) => changeFilter('scope', event.target.value)}>
          <option value="metadata">ชื่อเพลงหรือศิลปิน</option>
          <option value="lyrics">เนื้อเพลง</option>
        </select>

        {/* Sort dropdown */}
        <select aria-label="เรียงเพลง" className="sort-dropdown" value={sortBy} onChange={(event) => changeFilter('sort', event.target.value)}>
          <option value="updated">เรียงตาม: ล่าสุด</option>
          <option value="title">เรียงตาม: ชื่อ A-Z</option>
          <option value="artist">เรียงตาม: ศิลปิน</option>
        </select>
      </div>

      <section id="song-collections" aria-label="กลุ่มและโฟลเดอร์เพลง" className="mb-4! flex flex-wrap items-center gap-3">
        <LibraryCollectionControls filter={collectionFilter} resources={['songs']} label="กลุ่มเพลง" createLabel="สร้างกลุ่มเพลง" editLabel="แก้ไขกลุ่มเพลง">
          {activeCollection && !loading && (
            <p className="text-sm text-[var(--fg-secondary)]" role="status">
              {filteredSongs.length} เพลง
              {activeCollection.collection.unresolvedSongs > 0 && ` · ${activeCollection.collection.unresolvedSongs} เพลงไม่มีข้อมูลในไฟล์ต้นทาง`}
            </p>
          )}
        </LibraryCollectionControls>
      </section>

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
        <div className="songs-grid">
          {filteredSongs.map((song) => (
            <SongCard key={song.id} song={song} onEdit={handleEdit} />
          ))}
        </div>
      )}

      {!loading && !error && filteredSongs.length === 0 && searchQuery.trim() && (
        <p className="empty-state" role="status">ไม่พบเพลงที่ตรงกับคำค้น</p>
      )}
      {!loading && !error && filteredSongs.length === 0 && !searchQuery.trim() && activeCollection && (
        <p className="empty-state" role="status">ยังไม่มีเพลงจากกลุ่มนี้ในคลัง</p>
      )}
      {!loading && !error && filteredSongs.length === 0 && !searchQuery.trim() && !activeCollection && (
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
          </div>
        </div>
      )}
    </div>
  )
}
