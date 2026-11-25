/** Root application component — React Router setup with lazy-loaded pages */

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'

// Lazy load pages
const SongLibrary = lazy(() => import('./pages/SongLibrary'))
const SongListPrint = lazy(() => import('./pages/SongListPrint'))
const SongHistory = lazy(() => import('./pages/SongHistory'))
const SongHistoryPrint = lazy(() => import('./pages/SongHistoryPrint'))
const EasyWorshipImport = lazy(() => import('./pages/EasyWorshipImport'))
const EasyWorshipProfileImport = lazy(() => import('./pages/EasyWorshipProfileImport'))
const EasyWorshipScheduleImport = lazy(() => import('./pages/EasyWorshipScheduleImport'))
const SongEditor = lazy(() => import('./pages/SongEditor'))
const SongDetail = lazy(() => import('./pages/SongDetail'))
const ScriptureLibrary = lazy(() => import('./pages/ScriptureLibrary'))
const MediaLibrary = lazy(() => import('./pages/MediaLibrary'))
const SlideDesignLibrary = lazy(() => import('./pages/SlideDesignLibrary'))
const PlaylistList = lazy(() => import('./pages/PlaylistList'))
const PlaylistPackageImport = lazy(() => import('./pages/PlaylistPackageImport'))
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail'))
const StageView = lazy(() => import('./pages/StageView'))
const PresentationControl = lazy(() => import('./pages/PresentationControl'))
const PresentationRemote = lazy(() => import('./pages/PresentationRemote'))
const PresenterScreen = lazy(() => import('./pages/PresenterScreen'))
const FoldbackScreen = lazy(() => import('./pages/FoldbackScreen'))
const OutputSettings = lazy(() => import('./pages/OutputSettings'))
const DefaultThemes = lazy(() => import('./pages/DefaultThemes'))
const AlertTemplates = lazy(() => import('./pages/AlertTemplates'))
const PdfExport = lazy(() => import('./pages/PdfExport'))
const SchedulePrint = lazy(() => import('./pages/SchedulePrint'))

/** Fullscreen loading spinner for Suspense fallback */
function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-subtle)', borderTopColor: 'var(--accent)' }} />
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
          <Route path="/songs/import" element={<LazyPage><EasyWorshipImport /></LazyPage>} />
          <Route path="/songs/history" element={<LazyPage><SongHistory /></LazyPage>} />
          <Route path="/import/easyworship" element={<LazyPage><EasyWorshipProfileImport /></LazyPage>} />
          <Route path="/settings/output" element={<LazyPage><OutputSettings /></LazyPage>} />
          <Route path="/settings/themes" element={<LazyPage><DefaultThemes /></LazyPage>} />
          <Route path="/alerts" element={<LazyPage><AlertTemplates /></LazyPage>} />
          <Route path="/songs/new" element={<LazyPage><SongEditor /></LazyPage>} />
          <Route path="/songs/:id" element={<LazyPage><SongDetail /></LazyPage>} />
          <Route path="/songs/:id/edit" element={<LazyPage><SongEditor /></LazyPage>} />
          <Route path="/scripture" element={<LazyPage><ScriptureLibrary /></LazyPage>} />
          <Route path="/media" element={<LazyPage><MediaLibrary /></LazyPage>} />
          <Route path="/designs" element={<LazyPage><SlideDesignLibrary /></LazyPage>} />
          <Route path="/playlists" element={<LazyPage><PlaylistList /></LazyPage>} />
          <Route path="/playlists/import" element={<LazyPage><EasyWorshipScheduleImport /></LazyPage>} />
          <Route path="/playlists/package" element={<LazyPage><PlaylistPackageImport /></LazyPage>} />
          <Route path="/playlists/:id" element={<LazyPage><PlaylistDetail /></LazyPage>} />
          <Route path="/playlists/:id/stage" element={<LazyPage><StageView /></LazyPage>} />
          <Route path="/playlists/:id/present" element={<LazyPage><PresentationControl /></LazyPage>} />
          <Route path="/playlists/:id/pdf" element={<LazyPage><PdfExport /></LazyPage>} />
        </Route>

        {/* Fullscreen presenter — no Layout wrapper */}
        <Route path="/presenter" element={<LazyPage><PresenterScreen /></LazyPage>} />
        <Route path="/remote" element={<LazyPage><PresentationRemote /></LazyPage>} />
        <Route path="/playlists/:id/foldback" element={<LazyPage><FoldbackScreen /></LazyPage>} />
        <Route path="/playlists/:id/print" element={<LazyPage><SchedulePrint /></LazyPage>} />
        <Route path="/songs/print" element={<LazyPage><SongListPrint /></LazyPage>} />
        <Route path="/songs/history/print" element={<LazyPage><SongHistoryPrint /></LazyPage>} />
      </Routes>
    </BrowserRouter>
  )
}
