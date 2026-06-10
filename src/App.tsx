/** Root application component — React Router setup with lazy-loaded pages */

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'

// Lazy load pages
const SongLibrary = lazy(() => import('./pages/SongLibrary'))
const SongEditor = lazy(() => import('./pages/SongEditor'))
const SongDetail = lazy(() => import('./pages/SongDetail'))
const PlaylistList = lazy(() => import('./pages/PlaylistList'))
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail'))
const StageView = lazy(() => import('./pages/StageView'))
const PresentationControl = lazy(() => import('./pages/PresentationControl'))
const PresenterScreen = lazy(() => import('./pages/PresenterScreen'))
const PdfExport = lazy(() => import('./pages/PdfExport'))

/** Fullscreen loading spinner for Suspense fallback */
function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-[#2e2e2e] border-t-[#3ecf8e] rounded-full animate-spin" />
    </div>
  )
}

/** Wraps lazy components with Suspense */
function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Routes wrapped in Layout (top bar + outlet) */}
        <Route element={<Layout />}>
          <Route path="/" element={<LazyPage><SongLibrary /></LazyPage>} />
          <Route path="/songs/new" element={<LazyPage><SongEditor /></LazyPage>} />
          <Route path="/songs/:id" element={<LazyPage><SongDetail /></LazyPage>} />
          <Route path="/songs/:id/edit" element={<LazyPage><SongEditor /></LazyPage>} />
          <Route path="/playlists" element={<LazyPage><PlaylistList /></LazyPage>} />
          <Route path="/playlists/:id" element={<LazyPage><PlaylistDetail /></LazyPage>} />
          <Route path="/playlists/:id/stage" element={<LazyPage><StageView /></LazyPage>} />
          <Route path="/playlists/:id/present" element={<LazyPage><PresentationControl /></LazyPage>} />
          <Route path="/playlists/:id/pdf" element={<LazyPage><PdfExport /></LazyPage>} />
        </Route>

        {/* Fullscreen presenter — no Layout wrapper */}
        <Route path="/presenter" element={<LazyPage><PresenterScreen /></LazyPage>} />
      </Routes>
    </BrowserRouter>
  )
}
