import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

/** Root application component — sets up routing for all WorshipTeam pages */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="p-8 text-center text-[var(--color-text-secondary)]">WorshipTeam — Song Library (coming soon)</div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
