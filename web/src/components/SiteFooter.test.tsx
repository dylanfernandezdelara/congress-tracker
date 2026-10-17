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

  it('hides the support note until a payment link is configured', () => {
    render(<SiteFooter supportUrl={null} />)

    expect(screen.queryByText(/chip in/i)).not.toBeInTheDocument()
  })

  it('links the support note to the payment link in a new tab', () => {
    render(<SiteFooter supportUrl="https://buy.stripe.com/test_123" />)

    const link = screen.getByRole('link', { name: /chip in/i })
    expect(link).toHaveAttribute('href', 'https://buy.stripe.com/test_123')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText(/not tax-deductible/i)).toBeInTheDocument()
  })
})
