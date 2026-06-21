/** PDF Export page — auto-triggers PDF generation on mount for a given playlist
 *
 * Design system:
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Kanit font for display/body
 * - Exponential ease-out motion curves only
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePlaylist } from '../hooks/usePlaylists';
import { exportPlaylistToPDF } from '../utils/pdfExport';

export default function PdfExport() {
  const { id } = useParams<{ id: string }>();
  const { playlist, songs, loading, error } = usePlaylist(id);
  const [status, setStatus] = useState<'generating' | 'done' | 'error'>('generating');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (loading || error || !playlist || songs.length === 0) return;

    const timer = setTimeout(() => {
      exportPlaylistToPDF(playlist.name, songs)
        .then(() => setStatus('done'))
        .catch((err) => {
          console.error('PDF export failed:', err);
          setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
          setStatus('error');
        });
    }, 500);

    return () => clearTimeout(timer);
  }, [loading, error, playlist, songs]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--bg-primary)', padding: '0 var(--space-lg)' }}
    >
      <div
        className="card-elevated fade-in"
        style={{ maxWidth: '28rem', width: '100%', textAlign: 'center' }}
      >
        {loading && (
          <>
            <div className="spinner" style={{ margin: '0 auto var(--space-md)' }} />
            <p style={{ color: 'var(--fg-secondary)', fontSize: '0.875rem' }}>
              Loading playlist data…
            </p>
          </>
        )}
        {error && (
          <>
            <p style={{ color: 'var(--status-error-text)', fontSize: '0.875rem', marginBottom: 'var(--space-md)' }}>
              Error: {error}
            </p>
            <Link
              to={`/playlists/${id}`}
              style={{
                color: 'var(--accent)',
                fontSize: '0.875rem',
                textDecoration: 'underline',
                fontFamily: 'var(--font-display)',
              }}
            >
              ← Back to playlist
            </Link>
          </>
        )}
        {!loading && !error && status === 'generating' && (
          <>
            <div className="spinner" style={{ margin: '0 auto var(--space-md)' }} />
            <p style={{ color: 'var(--fg-primary)', fontSize: '1.125rem', fontWeight: 500, fontFamily: 'var(--font-display)' }}>
              Generating PDF…
            </p>
            <p style={{ color: 'var(--fg-tertiary)', fontSize: '0.875rem', marginTop: 'var(--space-xs)' }}>
              {playlist?.name} · {songs.length} song{songs.length !== 1 ? 's' : ''}
            </p>
            <p style={{ color: 'var(--fg-tertiary)', fontSize: '0.75rem', marginTop: 'var(--space-sm)' }}>
              Loading Thai font…
            </p>
          </>
        )}
        {!loading && !error && status === 'done' && (
          <>
            <div
              style={{
                width: '48px',
                height: '48px',
                margin: '0 auto var(--space-md)',
                background: 'var(--accent-bg)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                fontSize: '1.5rem',
              }}
            >
              ✓
            </div>
            <p style={{ color: 'var(--fg-primary)', fontSize: '1.125rem', fontWeight: 500, fontFamily: 'var(--font-display)' }}>
              Download started!
            </p>
            <p style={{ color: 'var(--fg-tertiary)', fontSize: '0.875rem', marginTop: 'var(--space-xs)', marginBottom: 'var(--space-xl)' }}>
              {playlist?.name}.pdf
            </p>
            <Link
              to={`/playlists/${id}`}
              className="btn-primary"
              style={{ fontSize: '0.875rem' }}
            >
              ← Back to playlist
            </Link>
          </>
        )}
        {!loading && !error && status === 'error' && (
          <>
            <div
              style={{
                width: '48px',
                height: '48px',
                margin: '0 auto var(--space-md)',
                background: 'var(--status-error-bg)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--status-error-text)',
                fontSize: '1.5rem',
              }}
            >
              ✕
            </div>
            <p style={{ color: 'var(--fg-primary)', fontSize: '1.125rem', fontWeight: 500, fontFamily: 'var(--font-display)' }}>
              Export failed
            </p>
            <p style={{ color: 'var(--status-error-text)', fontSize: '0.875rem', marginTop: 'var(--space-xs)', marginBottom: 'var(--space-xl)' }}>
              {errorMsg}
            </p>
            <Link
              to={`/playlists/${id}`}
              className="btn-primary"
              style={{ fontSize: '0.875rem' }}
            >
              ← Back to playlist
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
