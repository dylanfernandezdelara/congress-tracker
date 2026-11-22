import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Theme } from '@astryxdesign/core/theme'

import { useDocumentTheme } from './hooks/useDocumentTheme'
import { trackcongressTheme } from './theme/trackcongress'

import { AppLayout } from './layouts/AppLayout'
import Home from './routes/Home'

const DebugPage = lazy(() => import('./routes/DebugPage'))

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

function App() {
  // The site's own toggle owns light/dark (html[data-theme]); Astryx follows it.
  const mode = useDocumentTheme()
  return (
    <Theme theme={trackcongressTheme} mode={mode}>
    <BrowserRouter future={routerFuture}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route
            path="/debug"
            element={
              <Suspense fallback={<p className="text-ui font-normal text-faint">Loading…</p>}>
                <DebugPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </Theme>
  )
}

export default App
