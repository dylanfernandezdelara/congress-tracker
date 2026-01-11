import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './routes/Home'
import About from './routes/About'

function App() {
  return (
    <BrowserRouter>
      <div className="appShell">
        <nav className="appNav">
          <Link className="appNav__link" to="/">
            Home
          </Link>
          <Link className="appNav__link" to="/about">
            About
          </Link>
        </nav>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App

