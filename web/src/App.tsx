import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Home from './routes/Home'
import About from './routes/About'
import VoteDetail from './routes/VoteDetail'

function navLinkClass(isActive: boolean): string {
  return [
    'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
    isActive
      ? 'border-slate-300 bg-white text-slate-900 shadow-sm'
      : 'border-stone-200 bg-white/70 text-stone-600 hover:border-stone-300 hover:text-stone-900',
  ].join(' ')
}

function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto min-h-screen w-[min(1240px,calc(100vw-1.5rem))] pb-16 pt-4 sm:w-[min(1240px,calc(100vw-2rem))]">
        <nav className="mb-4 flex gap-2 overflow-x-auto pb-1 sm:justify-end">
          <NavLink className={({ isActive }) => navLinkClass(isActive)} to="/">
            Briefing
          </NavLink>
          <NavLink className={({ isActive }) => navLinkClass(isActive)} to="/about">
            About
          </NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/votes/:congress/:session/:voteNumber" element={<VoteDetail />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
