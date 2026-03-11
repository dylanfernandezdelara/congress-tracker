import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import Home from './routes/Home'
import About from './routes/About'
import VoteDetail from './routes/VoteDetail'

function navLinkClass(isActive: boolean): string {
  return [
    'relative px-1 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition-colors after:absolute after:bottom-0 after:left-0 after:h-px after:transition-all',
    isActive
      ? 'text-foreground after:w-full after:bg-primary'
      : 'text-muted-foreground after:w-0 after:bg-primary hover:text-foreground',
  ].join(' ')
}

function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto min-h-screen w-[min(1360px,calc(100vw-1rem))] pb-12 pt-3 sm:w-[min(1360px,calc(100vw-2rem))] sm:pt-5">
        <div className="document-frame">
          <header className="relative border-b border-border/70 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <Link className="inline-block" to="/">
                  <span className="document-kicker">Senate Pulse</span>
                </Link>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  A ranked public-interest briefing on consequential Senate votes, designed as a
                  working packet rather than a dashboard.
                </p>
              </div>

              <nav
                className="flex gap-5 overflow-x-auto pb-1 lg:justify-end"
                aria-label="Primary navigation"
              >
                <NavLink className={({ isActive }) => navLinkClass(isActive)} to="/">
                  Briefing
                </NavLink>
                <NavLink className={({ isActive }) => navLinkClass(isActive)} to="/about">
                  About
                </NavLink>
              </nav>
            </div>
          </header>

          <main className="px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
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
