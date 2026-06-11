import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './routes/Home'

function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto min-h-full w-full max-w-[640px] px-6 py-16 sm:py-20">
        <Routes>
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
