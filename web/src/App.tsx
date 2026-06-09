import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './routes/Home'

function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto min-h-screen w-full max-w-[720px] px-4 py-10 sm:px-6">
        <Routes>
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
