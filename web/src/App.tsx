import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AppLayout } from './layouts/AppLayout'
import Home from './routes/Home'
import StatsPage from './routes/StatsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/stats" element={<StatsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
