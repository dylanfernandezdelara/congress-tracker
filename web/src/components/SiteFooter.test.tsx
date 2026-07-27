import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SiteFooter } from './SiteFooter'

describe('SiteFooter', () => {
  it('states the site is independent and unofficial', () => {
    render(<SiteFooter />)

    const disclaimer = screen.getByText(/independent, unofficial website/i)
    expect(disclaimer).toBeInTheDocument()
    expect(disclaimer).toHaveTextContent(/not affiliated with/i)
    expect(disclaimer).toHaveTextContent(/U\.S\. Congress/i)
  })
})
