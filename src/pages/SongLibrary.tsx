/** SongLibrary — main song library page with split-panel layout */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSongs } from '../hooks/useSongs';
import { ChordDisplay } from '../components/ChordDisplay';
import { TransposeControls } from '../components/TransposeControls';

/** Song Library page — left panel lists songs, right panel shows selected song detail */
export default function SongLibrary() {
  const navigate = useNavigate();
  const { songs, loading, error } = useSongs();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transpose, setTranspose] = useState(0);
  const [useFlats, setUseFlats] = useState(false);

  const filteredSongs = useMemo(() => {
    if (!search.trim()) return songs;
    const q = search.toLowerCase();
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.artist && s.artist.toLowerCase().includes(q))
    );
  }, [songs, search]);

  const selectedSong = useMemo(
    () => songs.find((s) => s.id === selectedId) ?? null,
    [songs, selectedId]
  );

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#242424]">
        <h1 className="text-lg font-medium text-[#fafafa]">Song Library</h1>
        <button
          onClick={() => navigate('/songs/new')}
          className="px-4 py-1.5 rounded-full bg-[#3ecf8e] text-[#0f0f0f] text-sm font-medium hover:bg-[#2db87a] transition-colors"
        >
          + New Song
        </button>
      </header>

      {/* Split panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel — song list */}
        <div className="w-80 flex-shrink-0 border-r border-[#242424] flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-[#242424]">
            <input
              type="text"
              placeholder="Search songs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[#171717] border border-[#2e2e2e] text-sm text-[#fafafa] placeholder-[#898989] focus:outline-none focus:border-[#3ecf8e] transition-colors"
            />
          </div>

          {/* Song list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="p-4 text-center text-[#898989] text-sm">Loading songs...</div>
            )}
            {error && (
              <div className="p-4 text-center text-red-400 text-sm">{error}</div>
            )}
            {!loading && !error && filteredSongs.length === 0 && (
              <div className="p-4 text-center text-[#898989] text-sm">No songs found</div>
            )}
            {filteredSongs.map((song) => (
              <button
                key={song.id}
                onClick={() => {
                  setSelectedId(song.id);
                  setTranspose(0);
                }}
                className={`w-full text-left px-4 py-3 border-b border-[#242424] transition-colors ${
                  selectedId === song.id
                    ? 'bg-[#171717] border-l-2 border-l-[#3ecf8e]'
                    : 'hover:bg-[#171717]'
                }`}
              >
                <div className="text-sm font-medium text-[#fafafa] truncate">
                  {song.title}
                </div>
                <div className="text-xs text-[#898989] mt-0.5">
                  {song.artist || 'Unknown'} · {song.original_key}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel — selected song detail */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedSong ? (
            <>
              {/* Song header */}
              <div className="px-6 py-4 border-b border-[#242424]">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-medium text-[#fafafa]">
                      {selectedSong.title}
                    </h2>
                    {selectedSong.artist && (
                      <p className="text-sm text-[#b4b4b4] mt-0.5">{selectedSong.artist}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/songs/${selectedSong.id}/edit`)}
                      className="px-3 py-1.5 rounded border border-[#2e2e2e] text-xs text-[#b4b4b4] hover:text-[#fafafa] hover:border-[#3ecf8e] transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => navigate(`/songs/${selectedSong.id}`)}
                      className="px-3 py-1.5 rounded border border-[#2e2e2e] text-xs text-[#b4b4b4] hover:text-[#fafafa] hover:border-[#3ecf8e] transition-colors"
                    >
                      Full View
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <TransposeControls
                    currentKey={selectedSong.original_key}
                    transpose={transpose}
                    useFlats={useFlats}
                    onTransposeChange={setTranspose}
                    onFlatsToggle={() => setUseFlats((f) => !f)}
                  />
                </div>
              </div>

              {/* Chord chart */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <ChordDisplay
                  content={selectedSong.content_parsed}
                  transpose={transpose}
                  useFlats={useFlats}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3">🎵</div>
                <p className="text-[#898989] text-sm">
                  Select a song from the list to view its chord chart
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
