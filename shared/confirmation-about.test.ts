import { describe, expect, it } from 'vitest'

import {
  buildOfficialConfirmationAbout,
  confirmationHeadline,
  confirmationOppositionNote,
  isNominationDescriptionEcho,
  isRedundantConfirmationAbout,
  isThinConfirmationBackground,
  selectConfirmationAbout,
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

describe('isRedundantConfirmationAbout', () => {
  it('flags identity restatements', () => {
    expect(
      isRedundantConfirmationAbout(
        'Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.',
      ),
    ).toBe(true)
  })

  it('flags Congress.gov nomination boilerplate', () => {
    expect(
      isRedundantConfirmationAbout(
        'Walter Clayton, of New York, to be Director of National Intelligence, vice Tulsi Gabbard.',
      ),
    ).toBe(true)
  })

  it('keeps substantive person background', () => {
    expect(
      isRedundantConfirmationAbout(
        'Jane Doe previously led California’s energy commission and grid programs.',
      ),
    ).toBe(false)
  })

  it('keeps multi-sentence official About that includes an identity clause', () => {
    expect(
      isRedundantConfirmationAbout(
        'Jane Doe was confirmed as Secretary of Energy. She previously led California grid programs.',
      ),
    ).toBe(false)
  })

  it('keeps a single sentence that mixes identity with bio cues', () => {
    expect(
      isRedundantConfirmationAbout(
        'Jane Doe was confirmed as Secretary of Energy after leading California’s grid programs.',
      ),
    ).toBe(false)
  })

  it('flags single-sentence nominated-identity lines', () => {
    expect(
      isRedundantConfirmationAbout(
        'Walter Clayton, of New York, was nominated to serve as Director of National Intelligence.',
      ),
    ).toBe(true)
  })

  it('flags nominated-identity lines with middle initials', () => {
    expect(
      isRedundantConfirmationAbout(
        'Erica G. Schwartz was nominated to serve as Director of the Centers for Disease Control and Prevention.',
      ),
    ).toBe(true)
  })

  it('keeps multi-sentence backgrounds that mention the nomination', () => {
    expect(
      isRedundantConfirmationAbout(
        'Jane Doe was nominated to be Secretary of Energy in 2026. She previously led California grid programs.',
      ),
    ).toBe(false)
  })
})

describe('isNominationDescriptionEcho', () => {
  it('treats description echoes as rewrite-worthy', () => {
    const description =
      'Walter Clayton, of New York, to be Director of National Intelligence, vice Tulsi Gabbard.'
    expect(isNominationDescriptionEcho(description, description)).toBe(true)
  })

  it('does not treat identity confirmed-as lines as description echoes', () => {
    expect(
      isNominationDescriptionEcho(
        'Walter Clayton of NY was confirmed as Director of National Intelligence.',
        'Walter Clayton, of New York, to be Director of National Intelligence, vice Tulsi Gabbard.',
      ),
    ).toBe(false)
  })
})

describe('isThinConfirmationBackground', () => {
  it('treats description echoes as thin', () => {
    const description =
      'Walter Clayton, of New York, to be Director of National Intelligence, vice Tulsi Gabbard.'
    expect(isThinConfirmationBackground(description, description)).toBe(true)
  })

  it('keeps a real person blurb', () => {
    expect(
      isThinConfirmationBackground(
        'Walter Joseph "Jay" Clayton III previously chaired the SEC.',
        'Walter Clayton, of New York, to be Director of National Intelligence, vice Tulsi Gabbard.',
      ),
    ).toBe(false)
  })
})

describe('selectConfirmationAbout', () => {
  it('prefers Wikipedia person extract over identity official About', () => {
    expect(
      selectConfirmationAbout({
        officialAbout:
          'Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.',
        wikipediaExtract:
          'Jane Doe is an American energy official who previously led state programs.',
      }),
    ).toEqual({
      text: 'Jane Doe is an American energy official who previously led state programs.',
      source: 'wikipedia',
    })
  })

  it('hides redundant official About when Wikipedia is missing', () => {
    expect(
      selectConfirmationAbout({
        officialAbout:
          'Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.',
        wikipediaExtract: null,
      }),
    ).toEqual({ text: null, source: null })
  })
})

describe('confirmationHeadline', () => {
  it('prefers stored rewrite headline', () => {
    expect(
      confirmationHeadline({
        storedHeadline: 'Jane Doe confirmed as Energy Secretary',
        nominees: [{ display_name: 'Jane Doe', state: 'CA' }],
        positionTitle: 'Secretary of Energy',
        description: null,
        citation: 'PN100',
      }),
    ).toBe('Jane Doe confirmed as Energy Secretary')
  })

  it('falls back to name + role', () => {
    expect(
      confirmationHeadline({
        storedHeadline: null,
        nominees: [{ display_name: 'Jane Doe', state: 'CA' }],
        positionTitle: 'Secretary of Energy',
        description: null,
        citation: 'PN100',
      }),
    ).toBe('Jane Doe confirmed as Secretary of Energy')
  })

  it('ignores stored headlines that mislabel the confirmation as a nomination', () => {
    expect(
      confirmationHeadline({
        storedHeadline: 'Erica Schwartz nominated as CDC Director',
        nominees: [{ display_name: 'Erica Schwartz', state: 'FL' }],
        positionTitle: 'Director of the Centers for Disease Control and Prevention',
        description: null,
        citation: 'PN932',
      }),
    ).toBe(
      'Erica Schwartz confirmed as Director of the Centers for Disease Control and Prevention',
    )
  })

  it('keeps stored headlines that name both nomination and confirmation', () => {
    expect(
      confirmationHeadline({
        storedHeadline: 'Senate confirms nominated CDC Director Erica Schwartz',
        nominees: [{ display_name: 'Erica Schwartz', state: 'FL' }],
        positionTitle: 'Director of the Centers for Disease Control and Prevention',
        description: null,
        citation: 'PN932',
      }),
    ).toBe('Senate confirms nominated CDC Director Erica Schwartz')
  })
})

describe('confirmationOppositionNote', () => {
  it('summarizes the largest opposing caucus', () => {
    expect(
      confirmationOppositionNote([
        { party: 'R', yeas: 53, nays: 0, party_line: 'yea' },
        { party: 'D', yeas: 5, nays: 40, party_line: 'nay' },
      ]),
    ).toBe('Most Democrats voted against confirmation (D 5–40).')
  })

  it('returns null when no party majority opposed', () => {
    expect(
      confirmationOppositionNote([
        { party: 'R', yeas: 50, nays: 0, party_line: 'yea' },
        { party: 'D', yeas: 40, nays: 5, party_line: 'yea' },
      ]),
    ).toBeNull()
  })
})
