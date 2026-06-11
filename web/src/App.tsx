import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './routes/Home'

function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto min-h-screen w-full max-w-[680px] px-4 py-8 sm:px-6 sm:py-12 lg:max-w-3xl lg:px-10 lg:py-14">
        <Routes>
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
