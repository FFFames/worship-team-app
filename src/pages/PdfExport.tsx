/** PDF Export page — auto-triggers PDF generation on mount for a given playlist */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePlaylist } from '../hooks/usePlaylists';
import { exportPlaylistToPDF } from '../utils/pdfExport';

export default function PdfExport() {
  const { id } = useParams<{ id: string }>();
  const { playlist, songs, loading, error } = usePlaylist(id);
  const [status, setStatus] = useState<'generating' | 'done'>('generating');

  useEffect(() => {
    if (loading || error || !playlist || songs.length === 0) return;

    // Small timeout so the user sees the "Generating..." state
    const timer = setTimeout(() => {
      exportPlaylistToPDF(playlist.name, songs);
      setStatus('done');
    }, 500);

    return () => clearTimeout(timer);
  }, [loading, error, playlist, songs]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-6">
      <div className="bg-[#171717] border border-[#2e2e2e] rounded-lg p-10 max-w-md w-full text-center">
        {loading && (
          <>
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#3ecf8e] border-t-transparent mx-auto mb-4" />
            <p className="text-[#b4b4b4] text-sm">Loading playlist data…</p>
          </>
        )}

        {error && (
          <>
            <p className="text-red-400 text-sm mb-4">Error: {error}</p>
            <Link
              to={`/playlists/${id}`}
              className="text-[#3ecf8e] text-sm hover:underline"
            >
              ← Back to playlist
            </Link>
          </>
        )}

        {!loading && !error && status === 'generating' && (
          <>
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#3ecf8e] border-t-transparent mx-auto mb-4" />
            <p className="text-[#fafafa] text-lg font-medium">Generating PDF…</p>
            <p className="text-[#898989] text-sm mt-1">
              {playlist?.name} · {songs.length} song{songs.length !== 1 ? 's' : ''}
            </p>
          </>
        )}

        {!loading && !error && status === 'done' && (
          <>
            <div className="text-4xl mb-4">✅</div>
            <p className="text-[#fafafa] text-lg font-medium">Download started!</p>
            <p className="text-[#898989] text-sm mt-1 mb-6">
              {playlist?.name}.pdf
            </p>
            <Link
              to={`/playlists/${id}`}
              className="inline-block px-5 py-2 rounded-full bg-[#3ecf8e] text-[#0f0f0f] text-sm font-medium hover:brightness-110 transition"
            >
              ← Back to playlist
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
