import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import Home from './routes/Home'
import About from './routes/About'
import VoteDetail from './routes/VoteDetail'

function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto min-h-screen w-[min(1360px,calc(100vw-1rem))] pb-12 pt-2 sm:w-[min(1360px,calc(100vw-2rem))] sm:pt-4">
        <div>
          <header className="relative px-4 py-2 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-6xl justify-center text-center">
              <div className="max-w-2xl">
                <Link className="inline-block" to="/">
                  <span className="document-title text-4xl font-semibold text-foreground sm:text-[3.4rem]">Congress Tracker</span>
                </Link>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-0 sm:px-6 lg:px-8 lg:pt-2">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/votes/:congress/:session/:voteNumber" element={<VoteDetail />} />
              <Route path="/about" element={<About />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
