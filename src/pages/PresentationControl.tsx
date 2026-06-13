/** PresentationControl — Professional dual-screen control panel for live presentation
 *
 * Design system:
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Mobile-responsive with tab navigation
 * - Three-column layout: songs (264px) | slides (flex) | controls (320px)
 * - Kanit font for display/body, Source Code Pro for chords
 * - Exponential ease-out motion curves only
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePlaylist } from '../hooks/usePlaylists'
import { useVideoBackgrounds } from '../hooks/useVideoBackgrounds'
import { parseChordLyrics } from '../utils/chordParser'
import { usePresentationStore } from '../store/presentationStore'
import {
  createControlChannel,
  type PresentationMessage,
} from '../utils/presentationChannel'
import type { Section } from '../types/database'

/** Split a section's lyrics into "blocks" for presentation pages */
function sectionToBlocks(section: Section, _transpose: number): string[][] {
  void _transpose
  const lyricLines = section.lines
    .filter((l) => l.lyrics.trim())
    .map((l) => l.lyrics)

  const blocks: string[][] = []
  for (let i = 0; i < lyricLines.length; i += 2) {
    const block: string[] = [lyricLines[i]]
    if (i + 1 < lyricLines.length) block.push(lyricLines[i + 1])
    if (i + 2 < lyricLines.length && block.length < 3) {
      block.push(lyricLines[i + 2])
      i++
    }
    blocks.push(block)
  }
  return blocks
}

export default function PresentationControl() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playlist, songs, loading, error } = usePlaylist(id)
  const { backgrounds } = useVideoBackgrounds()
  const store = usePresentationStore()
  const channelRef = useRef<ReturnType<typeof createControlChannel> | null>(null)

  // Mobile tab state
  const [activeTab, setActiveTab] = useState<'songs' | 'lyrics' | 'controls'>('lyrics')

  // Build all lyric blocks for current song
  const currentSong = songs[store.currentSongIndex]
  const currentSections = currentSong?.song?.raw_content
    ? (currentSong.song.sections ?? parseChordLyrics(currentSong.song.raw_content).sections)
    : []

  const allBlocks: { sectionType: string; lines: string[] }[] = []
  for (const section of currentSections) {
    const blocks = sectionToBlocks(section, 0)
    for (const block of blocks) {
      allBlocks.push({ sectionType: section.type, lines: block })
    }
  }

  // Init BroadcastChannel on mount
  useEffect(() => {
    channelRef.current = createControlChannel()
    return () => {
      channelRef.current?.close()
    }
  }, [])

  // Set playlist ID in store
  useEffect(() => {
    if (id) store.setPlaylistId(id)
  }, [id])

  /** Send a message to the presenter window */
  const send = useCallback((msg: PresentationMessage) => {
    channelRef.current?.send(msg)
  }, [])

  // Open the presenter window
  const openPresenter = useCallback(() => {
    window.open('/presenter', 'worshipteam-presenter', 'width=1280,height=720')
  }, [])

  // Song change
  const selectSong = useCallback(
    (index: number) => {
      store.setSongIndex(index)
      store.setBlockIndex(0)
      setActiveTab('lyrics')
      const song = songs[index]
      if (song?.song) {
        const sections = song.song?.raw_content
          ? (song.song.sections ?? parseChordLyrics(song.song.raw_content).sections)
          : []
        const t = song.transpose ?? 0
        const blocks = sections.flatMap((s) => sectionToBlocks(s, t))
        if (blocks.length > 0) {
          send({ type: 'SHOW_LYRICS', lyrics: blocks[0].join('\n'), background: store.videoBackground?.url })
        }
      }
    },
    [songs, store, send],
  )

  // Block change
  const selectBlock = useCallback(
    (index: number) => {
      store.setBlockIndex(index)
      if (allBlocks[index]) {
        send({
          type: 'SHOW_LYRICS',
          lyrics: allBlocks[index].lines.join('\n'),
          background: store.videoBackground?.url,
        })
      }
    },
    [allBlocks, store, send],
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/playlists')
      } else if (e.key === 'ArrowRight') {
        const nextBlock = Math.min(store.currentBlockIndex + 1, allBlocks.length - 1)
        if (nextBlock !== store.currentBlockIndex) {
          selectBlock(nextBlock)
        }
      } else if (e.key === 'ArrowLeft') {
        const prevBlock = Math.max(store.currentBlockIndex - 1, 0)
        if (prevBlock !== store.currentBlockIndex) {
          selectBlock(prevBlock)
        }
      } else if (e.key === 'p' || e.key === 'P') {
        openPresenter()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [store.currentBlockIndex, allBlocks.length, selectBlock, openPresenter, navigate])

  // Welcome / Black
  const showWelcome = useCallback(() => {
    store.showWelcome()
    send({ type: 'SHOW_WELCOME', background: store.videoBackground?.url })
  }, [store, send])

  const showBlack = useCallback(() => {
    store.showBlack()
    send({ type: 'SHOW_BLACK' })
  }, [send])

  const changeBackground = useCallback(
    (url: string) => {
      const bg = backgrounds.find((b) => b.url === url) ?? null
      store.setVideoBackground(bg)
      send({ type: 'SET_BACKGROUND', url })
    },
    [backgrounds, store, send],
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (error || !playlist) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', marginBottom: 'var(--space-md)', color: 'var(--status-error-text)' }}>{error ?? 'Playlist not found'}</p>
          <button
            onClick={() => navigate('/playlists')}
            style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', textDecoration: 'underline' }}
          >
            ← Back to playlists
          </button>
        </div>
      </div>
    )
  }

  const currentSectionName = allBlocks[store.currentBlockIndex]?.sectionType ?? 'Select a slide'

  return (
    <main style={{ display: 'flex', flex: 1, overflow: 'hidden', margin: 'calc(var(--space-3xl) * -1) calc(var(--space-lg) * -1)' }}>
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
        {/* Mobile Tab Navigation - hidden on desktop */}
        <div className="flex md:hidden" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
          <button
            onClick={() => setActiveTab('songs')}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              transition: 'color 150ms var(--ease-out)',
              color: activeTab === 'songs' ? 'var(--accent)' : 'var(--fg-tertiary)',
              borderBottom: activeTab === 'songs' ? '2px solid var(--accent)' : 'none',
            }}
          >
            Songs
          </button>
          <button
            onClick={() => setActiveTab('lyrics')}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              transition: 'color 150ms var(--ease-out)',
              color: activeTab === 'lyrics' ? 'var(--accent)' : 'var(--fg-tertiary)',
              borderBottom: activeTab === 'lyrics' ? '2px solid var(--accent)' : 'none',
            }}
          >
            Lyrics
          </button>
          <button
            onClick={() => setActiveTab('controls')}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              transition: 'color 150ms var(--ease-out)',
              color: activeTab === 'controls' ? 'var(--accent)' : 'var(--fg-tertiary)',
              borderBottom: activeTab === 'controls' ? '2px solid var(--accent)' : 'none',
            }}
          >
            Controls
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left Panel - Songs List */}
          <div
            className={activeTab !== 'songs' ? 'hidden md:flex md:w-64 md:shrink-0' : 'md:flex md:w-64 md:shrink-0'}
            style={{ flexDirection: 'column', borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--fg-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Songs
              </h3>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {songs.map((ps, idx) => {
                const song = ps.song
                if (!song) return null
                return (
                  <button
                    key={ps.id}
                    onClick={() => selectSong(idx)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-subtle)',
                      fontSize: '14px',
                      transition: 'background 150ms var(--ease-out)',
                      borderLeft: '2px solid transparent',
                      background: idx === store.currentSongIndex ? 'rgba(62, 207, 142, 0.08)' : 'transparent',
                      borderLeftColor: idx === store.currentSongIndex ? 'var(--accent)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (idx !== store.currentSongIndex) {
                        e.currentTarget.style.background = 'var(--bg-tertiary)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (idx !== store.currentSongIndex) {
                        e.currentTarget.style.background = 'transparent'
                      }
                    }}
                  >
                    <div style={{
                      color: 'var(--fg-primary)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {song.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--fg-tertiary)', marginTop: '2px' }}>
                      {song.artist ?? 'Unknown'}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Center Panel - Lyrics Grid */}
          <div
            className={activeTab !== 'lyrics' ? 'hidden md:flex md:flex-1' : 'md:flex md:flex-1'}
            style={{ flexDirection: 'column', minWidth: 0 }}
          >
            <div style={{
              padding: '12px 24px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--fg-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {currentSong?.song?.title ?? 'Select a song'}
              </span>
              <button
                onClick={openPresenter}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  background: 'var(--accent)',
                  color: 'var(--bg-primary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 150ms var(--ease-out)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'oklch(0.65 0.15 160)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
              >
                Open Presenter
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                {allBlocks.map((block, idx) => (
                  <button
                    key={idx}
                    onClick={() => selectBlock(idx)}
                    style={{
                      textAlign: 'left',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '2px solid',
                      transition: 'all 150ms var(--ease-out)',
                      borderColor: idx === store.currentBlockIndex ? 'var(--accent)' : 'var(--border-subtle)',
                      background: idx === store.currentBlockIndex ? 'rgba(62, 207, 142, 0.08)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (idx !== store.currentBlockIndex) {
                        e.currentTarget.style.borderColor = 'var(--border-default)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (idx !== store.currentBlockIndex) {
                        e.currentTarget.style.borderColor = 'var(--border-subtle)'
                      }
                    }}
                  >
                    <div style={{ fontSize: '12px', color: 'var(--fg-tertiary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                      {block.sectionType}
                    </div>
                    {block.lines.map((line, li) => (
                      <div key={li} style={{
                        fontSize: '14px',
                        color: 'var(--fg-primary)',
                        lineHeight: 1.6
                      }}>
                        {line}
                      </div>
                    ))}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel - Controls & Preview */}
          <div
            className={activeTab !== 'controls' ? 'hidden md:flex md:w-80 md:shrink-0' : 'md:flex md:w-80 md:shrink-0'}
            style={{ flexDirection: 'column', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}
          >
            <div style={{ flex: 1, padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--fg-tertiary)', textTransform: 'uppercase', marginBottom: '12px' }}>
                Display Preview
              </div>
              <div style={{
                aspectRatio: '16 / 9',
                background: 'black',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}>
                {store.isBlacked ? (
                  <div style={{ width: '100%', height: '100%', background: 'black' }} />
                ) : store.isShowingWelcome ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>♫</div>
                    <div style={{ fontSize: '14px', color: 'var(--fg-secondary)' }}>Welcome</div>
                  </div>
                ) : allBlocks[store.currentBlockIndex] ? (
                  <div style={{ textAlign: 'center', padding: '16px' }}>
                    {allBlocks[store.currentBlockIndex].lines.map((line, i) => (
                      <div key={i} style={{
                        fontSize: '14px',
                        color: 'white',
                        lineHeight: 1.6
                      }}>
                        {line}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--fg-tertiary)' }}>No content</div>
                )}
              </div>

              {/* Controls - moved under preview */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <button
                    onClick={showWelcome}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--fg-secondary)',
                      background: 'transparent',
                      cursor: 'pointer',
                      transition: 'all 150ms var(--ease-out)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--fg-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--fg-secondary)'}
                  >
                    Welcome
                  </button>
                  <button
                    onClick={showBlack}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--fg-secondary)',
                      background: 'transparent',
                      cursor: 'pointer',
                      transition: 'all 150ms var(--ease-out)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--fg-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--fg-secondary)'}
                  >
                    Black
                  </button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--fg-tertiary)', marginBottom: '4px' }}>
                    Video Background
                  </label>
                  <select
                    value={store.videoBackground?.url ?? ''}
                    onChange={(e) => changeBackground(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '12px',
                      color: 'var(--fg-primary)'
                    }}
                  >
                    <option value="">None</option>
                    {backgrounds.map((bg) => (
                      <option key={bg.id} value={bg.url}>
                        {bg.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--fg-tertiary)' }}>
                  <span>{store.currentSongIndex + 1}/{songs.length}</span>
                  <span>•</span>
                  <span>{currentSectionName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
