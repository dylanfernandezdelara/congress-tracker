import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './routes/Home'
import About from './routes/About'

function App() {
  return (
    <BrowserRouter>
      <div>
        <nav style={{ marginBottom: '20px', padding: '15px', background: 'white', borderRadius: '8px' }}>
          <Link to="/" style={{ marginRight: '20px', textDecoration: 'none', color: '#0066cc' }}>
            Home
          </Link>
          <Link to="/about" style={{ textDecoration: 'none', color: '#0066cc' }}>
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

