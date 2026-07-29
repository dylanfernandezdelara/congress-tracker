export type TerminalFeedKind = 'law' | 'law_unsigned' | 'vetoed'

export type SettledTerminalStatus =
  | 'became_law_unsigned'
  | 'became_law_signed'
  | 'became_law'
  | 'enacted_over_veto'
  | 'vetoed'
  | 'pocket_vetoed'

export type TerminalStatusPresentation = {
  feedKind: TerminalFeedKind
  chipLabel: string
  pipelineLabel: string
}

/** Single source for chip + pipeline wording for settled law/veto outcomes. */
export const TERMINAL_STATUS_PRESENTATION: Record<
  SettledTerminalStatus,
  TerminalStatusPresentation
> = {
  became_law_unsigned: {
    feedKind: 'law_unsigned',
    chipLabel: 'Law — unsigned',
    pipelineLabel: 'Became law — unsigned',
  },
  became_law_signed: {
    feedKind: 'law',
    chipLabel: 'Law',
    pipelineLabel: 'Signed into law',
  },
  became_law: {
    feedKind: 'law',
    chipLabel: 'Law',
    pipelineLabel: 'Became law',
  },
  enacted_over_veto: {
    feedKind: 'law',
    chipLabel: 'Law — veto overridden',
    pipelineLabel: 'Enacted over veto',
  },
  vetoed: {
    feedKind: 'vetoed',
    chipLabel: 'Vetoed',
    pipelineLabel: 'Vetoed',
  },
  pocket_vetoed: {
    feedKind: 'vetoed',
    chipLabel: 'Vetoed',
    pipelineLabel: 'Pocket vetoed',
  },
}
