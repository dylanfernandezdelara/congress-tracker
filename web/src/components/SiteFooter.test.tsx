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

  it('says bill summaries are model-written and checked against the text', () => {
    render(<SiteFooter />)

    const note = screen.getByText(/written by a language model/i)
    expect(note).toHaveTextContent(/from the bill’s text/i)
    expect(note).toHaveTextContent(/from its title or the CRS summary/i)
    expect(note).toHaveTextContent(/screened for numbers and wording/i)
    expect(note).toHaveTextContent(/official CRS summary/i)
  })
})
