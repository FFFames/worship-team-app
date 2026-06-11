/** PresentationControl — dual-screen control panel for live presentation.
 *  Left panel: song list with manual switching.
 *  Right panel: lyrics block preview + control buttons (welcome, black, video bg).
 *  Communicates with PresenterScreen via BroadcastChannel. */

import { useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePlaylist } from '../hooks/usePlaylists'
import { useVideoBackgrounds } from '../hooks/useVideoBackgrounds'
import { parseChordLyrics } from '../utils/chordParser'
import { usePresentationStore } from '../store/presentationStore'
import {
  createControlChannel,
  type PresentationMessage,
} from '../utils/presentationChannel'
import type { Section } from '../types/database'

/** Split a section's lyrics into "blocks" of 2–3 sentences for presentation pages */
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
  const { playlist, songs, loading, error } = usePlaylist(id)
  const { backgrounds } = useVideoBackgrounds()
  const store = usePresentationStore()
  const channelRef = useRef<ReturnType<typeof createControlChannel> | null>(null)

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
      // Send first block
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

  // Welcome / Black / Background
  const showWelcome = useCallback(() => {
    store.showWelcome()
    send({ type: 'SHOW_WELCOME', background: store.videoBackground?.url })
  }, [store, send])

  const showBlack = useCallback(() => {
    store.showBlack()
    send({ type: 'SHOW_BLACK' })
  }, [store, send])

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
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#2e2e2e] border-t-[#3ecf8e] rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !playlist) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-3">{error ?? 'Playlist not found'}</p>
          <Link to="/playlists" className="text-[#3ecf8e] text-xs hover:underline">
            ← Back to playlists
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left panel — song list */}
      <div className="w-64 shrink-0 border-r border-[#2e2e2e] bg-[#141414] flex flex-col">
        <div className="px-4 py-3 border-b border-[#2e2e2e]">
          <h3 className="text-xs font-medium text-[#898989] uppercase tracking-wider">Songs</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {songs.map((ps, idx) => {
            const song = ps.song
            if (!song) return null
            return (
              <button
                key={ps.id}
                onClick={() => selectSong(idx)}
                className={`w-full text-left px-4 py-3 border-b border-[#1e1e1e] text-sm transition-colors ${
                  idx === store.currentSongIndex
                    ? 'bg-[rgba(62,207,142,0.08)] border-l-2 border-l-[#3ecf8e]'
                    : 'border-l-2 border-l-transparent hover:bg-[#1a1a1a]'
                }`}
              >
                <div className="text-[#fafafa] font-medium truncate">{song.title}</div>
                <div className="text-xs text-[#898989] mt-0.5">{song.artist ?? 'Unknown'}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Center panel — lyrics blocks */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-3 border-b border-[#2e2e2e] flex items-center justify-between">
          <span className="text-sm font-medium text-[#fafafa] truncate">
            {currentSong?.song?.title ?? 'Select a song'}
          </span>
          <button
            onClick={openPresenter}
            className="px-3 py-1.5 rounded-full bg-[#3ecf8e] text-[#0f0f0f] text-xs font-medium hover:bg-[#2db87a] transition-colors"
          >
            Open Presenter
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            {allBlocks.map((block, idx) => (
              <button
                key={idx}
                onClick={() => selectBlock(idx)}
                className={`text-left p-4 rounded-lg border transition-colors ${
                  idx === store.currentBlockIndex
                    ? 'border-[#3ecf8e] bg-[rgba(62,207,142,0.08)]'
                    : 'border-[#2e2e2e] hover:border-[#363636]'
                }`}
              >
                <div className="text-xs text-[#898989] mb-2 uppercase">{block.sectionType}</div>
                {block.lines.map((line, li) => (
                  <div key={li} className="text-sm text-[#fafafa] leading-relaxed">
                    {line}
                  </div>
                ))}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — preview + controls */}
      <div className="w-80 shrink-0 border-l border-[#2e2e2e] bg-[#141414] flex flex-col">
        {/* Preview of what's on screen */}
        <div className="flex-1 p-4">
          <div className="text-xs text-[#898989] uppercase mb-3">Display Preview</div>
          <div className="aspect-video bg-black rounded-lg flex items-center justify-center overflow-hidden">
            {store.isBlacked ? (
              <div className="w-full h-full bg-black" />
            ) : store.isShowingWelcome ? (
              <div className="text-center">
                <div className="text-2xl text-[#fafafa]">♫</div>
                <div className="text-sm text-[#b4b4b4] mt-2">Welcome</div>
              </div>
            ) : allBlocks[store.currentBlockIndex] ? (
              <div className="text-center px-4">
                {allBlocks[store.currentBlockIndex].lines.map((line, i) => (
                  <div key={i} className="text-white text-sm leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-[#898989]">No content</div>
            )}
          </div>
        </div>

        {/* Control buttons */}
        <div className="p-4 border-t border-[#2e2e2e] space-y-3">
          <div className="flex gap-2">
            <button
              onClick={showWelcome}
              className={`flex-1 px-3 py-2 rounded text-xs border transition-colors ${
                store.isShowingWelcome
                  ? 'border-[#3ecf8e] text-[#3ecf8e] bg-[rgba(62,207,142,0.1)]'
                  : 'border-[#2e2e2e] text-[#b4b4b4] hover:text-[#fafafa]'
              }`}
            >
              Welcome
            </button>
            <button
              onClick={showBlack}
              className={`flex-1 px-3 py-2 rounded text-xs border transition-colors ${
                store.isBlacked
                  ? 'border-[#3ecf8e] text-[#3ecf8e] bg-[rgba(62,207,142,0.1)]'
                  : 'border-[#2e2e2e] text-[#b4b4b4] hover:text-[#fafafa]'
              }`}
            >
              Black
            </button>
          </div>

          {/* Video background dropdown */}
          <div>
            <label className="block text-xs text-[#898989] mb-1">Video Background</label>
            <select
              value={store.videoBackground?.url ?? ''}
              onChange={(e) => changeBackground(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[#171717] border border-[#2e2e2e] text-xs text-[#fafafa] focus:outline-none focus:border-[#3ecf8e]"
            >
              <option value="">None</option>
              {backgrounds.map((bg) => (
                <option key={bg.id} value={bg.url}>
                  {bg.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
