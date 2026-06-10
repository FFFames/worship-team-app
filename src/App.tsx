/** Root application component — sets up routing for all WorshipTeam pages */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';

/** Placeholder page for routes not yet implemented */
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-center">
        <h2
          className="text-xl font-medium mb-2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {title}
        </h2>
        <p style={{ color: 'var(--color-text-muted)' }}>Coming soon</p>
      </div>
    </div>
  );
}

/** Song Library — home page showing all songs */
function SongLibraryPage() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-center">
        <h2
          className="text-xl font-medium mb-2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Song Library
        </h2>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Select a song from the sidebar or create a new one
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* All routes share the Layout (sidebar + outlet) */}
        <Route element={<Layout />}>
          {/* Song routes */}
          <Route path="/" element={<SongLibraryPage />} />
          <Route path="/songs/new" element={<PlaceholderPage title="Song Editor" />} />
          <Route path="/songs/:id" element={<PlaceholderPage title="Song Detail" />} />
          <Route path="/songs/:id/edit" element={<PlaceholderPage title="Song Editor" />} />

          {/* Playlist routes */}
          <Route path="/playlists" element={<PlaceholderPage title="Playlists" />} />
          <Route path="/playlists/:id" element={<PlaceholderPage title="Playlist Detail" />} />
          <Route path="/playlists/:id/stage" element={<PlaceholderPage title="Stage View" />} />
          <Route path="/playlists/:id/present" element={<PlaceholderPage title="Presentation" />} />
          <Route path="/playlists/:id/pdf" element={<PlaceholderPage title="PDF Export" />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
