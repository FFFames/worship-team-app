/** Sidebar — Left panel with song list, playlists, and quick actions */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSongs } from '../hooks/useSongs';
import { usePlaylists } from '../hooks/usePlaylists';

/** Sidebar navigation component with search, song list, playlists, and quick actions */
export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { songs } = useSongs();
  const { playlists } = usePlaylists();
  const [searchQuery, setSearchQuery] = useState('');

  // Extract current song id from URL
  const pathParts = location.pathname.split('/');
  const currentSongId = pathParts[1] === 'songs' && pathParts[2] && pathParts[2] !== 'new'
    ? pathParts[2]
    : null;

  // Filter songs by search query
  const filteredSongs = songs.filter((song) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      song.title.toLowerCase().includes(q) ||
      (song.artist?.toLowerCase().includes(q) ?? false)
    );
  });

  // Check if a route is active
  const isRouteActive = (path: string) => location.pathname === path;
  const isSongsActive = location.pathname === '/' || location.pathname.startsWith('/songs');
  const isPlaylistsActive = location.pathname.startsWith('/playlists');

  return (
    <div
      className="h-full flex flex-col"
      style={{
        background: 'var(--color-bg-page)',
        borderRight: '1px solid var(--color-border-standard)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
      >
        <span className="text-lg font-semibold" style={{ color: 'var(--color-accent)' }}>
          ♫
        </span>
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          WorshipTeam
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          type="text"
          placeholder="Search songs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-md outline-none transition-colors"
          style={{
            background: 'var(--color-bg-deepest)',
            border: '1px solid var(--color-border-subtle)',
            color: 'var(--color-text-primary)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-accent)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
          }}
        />
      </div>

      {/* Songs section */}
      <div className="px-3 pt-1 pb-1">
        <button
          onClick={() => navigate('/')}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium uppercase tracking-wider cursor-pointer"
          style={{
            color: isSongsActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
        >
          <span>Songs</span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {songs.length}
          </span>
        </button>
      </div>

      {/* Song list */}
      <div className="flex-1 overflow-y-auto px-2">
        {filteredSongs.map((song) => {
          const isActive = song.id === currentSongId;
          return (
            <button
              key={song.id}
              onClick={() => navigate(`/songs/${song.id}`)}
              className="w-full text-left px-3 py-2 rounded-md mb-0.5 transition-colors cursor-pointer"
              style={{
                background: isActive ? 'var(--color-bg-deepest)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--color-bg-deepest)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div
                className="text-sm truncate"
                style={{
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {song.title}
              </div>
              {song.artist && (
                <div
                  className="text-xs truncate"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {song.artist}
                </div>
              )}
            </button>
          );
        })}

        {filteredSongs.length === 0 && searchQuery && (
          <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No songs found
          </div>
        )}
      </div>

      {/* Playlists section */}
      <div
        className="px-3 py-2"
        style={{ borderTop: '1px solid var(--color-border-subtle)' }}
      >
        <button
          onClick={() => navigate('/playlists')}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium uppercase tracking-wider cursor-pointer"
          style={{
            color: isPlaylistsActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
        >
          <span>Playlists</span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {playlists.length}
          </span>
        </button>

        {/* Playlist items */}
        <div className="mt-1 max-h-32 overflow-y-auto">
          {playlists.map((playlist) => {
            const isActive = isRouteActive(`/playlists/${playlist.id}`);
            return (
              <button
                key={playlist.id}
                onClick={() => navigate(`/playlists/${playlist.id}`)}
                className="w-full text-left px-3 py-1.5 rounded-md mb-0.5 text-sm transition-colors cursor-pointer"
                style={{
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  background: isActive ? 'var(--color-bg-deepest)' : 'transparent',
                  fontWeight: isActive ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--color-bg-deepest)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                {playlist.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div
        className="px-3 py-3 flex gap-2"
        style={{ borderTop: '1px solid var(--color-border-subtle)' }}
      >
        <button
          onClick={() => navigate('/songs/new')}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors cursor-pointer"
          style={{
            background: 'var(--color-accent)',
            color: '#0f0f0f',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.85';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          + Song
        </button>
        <button
          onClick={() => {
            const name = prompt('Playlist name:');
            if (name?.trim()) {
              navigate('/playlists');
            }
          }}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors cursor-pointer"
          style={{
            border: '1px solid var(--color-border-standard)',
            color: 'var(--color-text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-text-secondary)';
            e.currentTarget.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-standard)';
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }}
        >
          + Playlist
        </button>
      </div>
    </div>
  );
}
