import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from './layouts/AppLayout'
import Home from './routes/Home'
import StatsPage from './routes/StatsPage'

const DebugPage = lazy(() => import('./routes/DebugPage'))

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

function App() {
  return (
    <BrowserRouter future={routerFuture}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route
            path="/debug"
            element={
              <Suspense fallback={<p className="text-[13px] text-faint">Loading…</p>}>
                <DebugPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
