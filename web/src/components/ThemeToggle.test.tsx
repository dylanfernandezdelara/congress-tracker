import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ThemeToggle } from './ThemeToggle'

function setThemeMeta(content: string) {
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', content)
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = 'light'
    setThemeMeta('#fafafa')
    localStorage.clear()
  })

  it('renders with light default and toggles theme, localStorage, and meta theme-color', () => {
    render(<ThemeToggle />)

    const button = screen.getByRole('button', { name: 'Switch to dark theme' })
    expect(button).toBeInTheDocument()

    fireEvent.click(button)

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0a0a0a',
    )
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#fafafa',
    )
  })
})
