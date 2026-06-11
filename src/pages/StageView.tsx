/** Stage View page — dark, high-contrast chord chart display for on-stage use.
 *  Shows all songs in a playlist with chords+lyrics, per-song transpose, and auto-scroll. */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePlaylist } from '../hooks/usePlaylists';
import { ChordDisplay } from '../components/ChordDisplay';
import { parseChordLyrics } from '../utils/chordParser';
import { transposeKey } from '../utils/transpose';

export default function StageView() {
  const { id } = useParams<{ id: string }>();
  const { playlist, songs, loading, error, setTranspose } = usePlaylist(id);
  const [autoScroll, setAutoScroll] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll: scroll the container down 1px every 40ms (~25px/sec)
  useEffect(() => {
    if (autoScroll) {
      scrollIntervalRef.current = setInterval(() => {
        if (mainRef.current) {
          mainRef.current.scrollTop += 1;
        }
      }, 40);
    } else if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [autoScroll]);

  // Keyboard shortcut: Escape to stop auto-scroll
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAutoScroll(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleTranspose = useCallback(
    async (psId: string, current: number, delta: number) => {
      await setTranspose(psId, current + delta);
    },
    [setTranspose],
  );

  const scrollToSong = (songId: string) => {
    const el = document.getElementById(`song-${songId}`);
    if (el && mainRef.current) {
      // Scroll within the container, accounting for sticky nav height
      const navHeight = 48;
      const elTop = el.offsetTop - mainRef.current.offsetTop - navHeight;
      mainRef.current.scrollTo({ top: elTop, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-[#0f0f0f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#3ecf8e] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full bg-[#0f0f0f] flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">Error: {error}</p>
          <Link to={`/playlists/${id}`} className="text-[#3ecf8e] text-sm hover:underline">
            ← Back to playlist
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0f0f0f] text-[#fafafa]" ref={mainRef}>
      {/* ---- Sticky mini song list ---- */}
      <nav className="sticky top-0 z-50 bg-[#171717]/95 backdrop-blur border-b border-[#2e2e2e] px-4 py-2">
        <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
          <Link
            to={`/playlists/${id}`}
            className="text-[#898989] text-xs hover:text-[#fafafa] transition shrink-0"
          >
            ← Back
          </Link>
          <span className="text-[#898989] text-xs hidden sm:inline">|</span>
          <h1 className="text-sm font-medium text-[#b4b4b4] truncate max-w-[200px]">
            {playlist?.name}
          </h1>
          <div className="flex-1" />
          <div className="flex items-center gap-1 flex-wrap">
            {songs.map((ps, idx) => {
              const song = ps.song;
              if (!song) return null;
              return (
                <button
                  key={ps.id}
                  onClick={() => scrollToSong(ps.id)}
                  className="text-xs px-2 py-0.5 rounded bg-[#242424] text-[#b4b4b4] hover:bg-[#2e2e2e] hover:text-[#fafafa] transition truncate max-w-[140px]"
                  title={song.title}
                >
                  {idx + 1}. {song.title}
                </button>
              );
            })}
          </div>
          <span className="text-[#898989] text-xs hidden sm:inline">|</span>
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`text-xs px-3 py-1 rounded-full transition shrink-0 ${
              autoScroll
                ? 'bg-[#3ecf8e] text-[#0f0f0f] font-medium'
                : 'bg-[#242424] text-[#b4b4b4] hover:bg-[#2e2e2e]'
            }`}
          >
            {autoScroll ? '⏸ Stop Scroll' : '▶ Auto Scroll'}
          </button>
        </div>
      </nav>

      {/* ---- Song content ---- */}
      <main className="max-w-5xl mx-auto px-2 md:px-4 py-6">
        {songs.length === 0 && (
          <p className="text-center text-[#898989] text-lg py-20">
            No songs in this playlist.
          </p>
        )}

        {songs.map((ps, idx) => {
          const song = ps.song;
          if (!song) return null;

          const transpose = ps.transpose ?? 0;
          const transposedKey =
            transpose !== 0
              ? transposeKey(song.original_key, transpose)
              : song.original_key;

          return (
            <article
              key={ps.id}
              id={`song-${ps.id}`}
              className="mb-12 scroll-mt-20"
            >
              {/* Song header */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="text-[#898989] text-sm font-mono w-6 shrink-0">
                  {idx + 1}
                </span>
                <h2 className="text-xl font-medium text-[#fafafa]">{song.title}</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-[#242424] text-[#3ecf8e] font-mono">
                  {transposedKey}
                </span>

                {/* Compact transpose controls */}
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => handleTranspose(ps.id, transpose, -1)}
                    className="w-8 h-8 md:w-7 md:h-7 flex items-center justify-center rounded bg-[#242424] text-[#b4b4b4] hover:bg-[#2e2e2e] hover:text-[#fafafa] text-sm transition"
                    title="Transpose down 1 semitone"
                  >
                    −
                  </button>
                  <span className="text-xs text-[#898989] w-8 text-center font-mono">
                    {transpose > 0 ? `+${transpose}` : transpose}
                  </span>
                  <button
                    onClick={() => handleTranspose(ps.id, transpose, 1)}
                    className="w-8 h-8 md:w-7 md:h-7 flex items-center justify-center rounded bg-[#242424] text-[#b4b4b4] hover:bg-[#2e2e2e] hover:text-[#fafafa] text-sm transition"
                    title="Transpose up 1 semitone"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Chord display — larger fonts for stage readability */}
              <ChordDisplay
                sections={song.sections ?? parseChordLyrics(song.raw_content).sections}
                transpose={transpose}
                className="pl-2 md:pl-6"
              />

              {/* Divider */}
              {idx < songs.length - 1 && (
                <div className="border-b border-[#242424] mt-8" />
              )}
            </article>
          );
        })}
      </main>
    </div>
  );
}
