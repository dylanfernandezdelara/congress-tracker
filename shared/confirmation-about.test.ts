import { describe, expect, it } from 'vitest'

import {
  buildOfficialConfirmationAbout,
  wikipediaExtractAddsDetail,
} from './confirmation-about'

describe('buildOfficialConfirmationAbout', () => {
  it('builds an identity line from official nomination fields', () => {
    expect(
      buildOfficialConfirmationAbout({
        nominees: [{ display_name: 'Jane Doe', state: 'CA' }],
        positionTitle: 'Secretary of Energy',
        organization: 'Department of Energy',
        description: 'Jane Doe, of California, to be Secretary of Energy.',
      }),
    ).toBe(
      'Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.',
    )
  })

  it('falls back to cleaned description when name/role are missing', () => {
    expect(
      buildOfficialConfirmationAbout({
        nominees: [],
        positionTitle: null,
        organization: null,
        description: 'A nomination for a federal post. (local sample)',
      }),
    ).toBe('A nomination for a federal post.')
  })
})

describe('wikipediaExtractAddsDetail', () => {
  it('hides redundant wiki text', () => {
    expect(
      wikipediaExtractAddsDetail(
        'Jane Doe of CA was confirmed as Secretary of Energy.',
        'Jane Doe of CA was confirmed as Secretary of Energy.',
      ),
    ).toBe(false)
  })

  it('keeps wiki text that adds substance', () => {
    expect(
      wikipediaExtractAddsDetail(
        'Jane Doe of CA was confirmed as Secretary of Energy.',
        'Jane Doe is an American energy official who previously led state programs.',
      ),
    ).toBe(true)
  })
})
