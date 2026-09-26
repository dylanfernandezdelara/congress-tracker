import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MemberAvatar } from './MemberAvatar'

/* jsdom never loads images, and the avatar shows its <img> only once the photo has loaded. Stand in for a
   browser that loads every image. */
class LoadingImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  complete = false
  naturalWidth = 0
  set src(_value: string) {
    queueMicrotask(() => {
      this.complete = true
      this.naturalWidth = 64
      this.onload?.()
    })
  }
}

describe('MemberAvatar', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the photo once it loads', async () => {
    vi.stubGlobal('Image', LoadingImage)
    const { container } = render(<MemberAvatar name="Brian Fitzpatrick" photoUrl="https://example.test/bf.jpg" variant="profile" />)
    await vi.waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/bf.jpg')
    })
  })

  it('shows initials when there is no photo', () => {
    const { container } = render(<MemberAvatar name="Brian Fitzpatrick" photoUrl="" variant="defector" />)
    expect(screen.getByText('BF')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})
