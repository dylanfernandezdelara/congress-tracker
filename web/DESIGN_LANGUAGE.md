# Web Design Language

> **Note:** The app is in a product reset with a minimal placeholder shell. This document preserves the intended visual direction for the next UI build.

This document defines the visual direction for the `web/` application.
It is intentionally directional rather than exhaustive. Use it to make
consistent design decisions, not to block sensible improvements.

If the product direction changes, update this document first or alongside
the UI changes so future work has a clear reference point.

## Purpose

The site should feel like a modern congressional briefing packet:

- serious without feeling bureaucratic
- academic without feeling old-fashioned
- tactile without becoming a novelty
- readable at a glance, but rewarding when read closely

The target mood is closer to a research memo, archive box, legislative
dossier, or marked-up hearing packet than a startup dashboard or a
consumer news feed.

## Primary Reference

The visual inspiration from [Paper](https://paper.design/roadmap) is useful
because it treats the page like a physical working surface. The transferable
ideas are:

- warm paper tones instead of flat white
- subtle texture and construction lines
- quiet spacing and large typographic blocks
- a feeling that panels are placed on a desk, not floating in glass

What should not be copied literally:

- playful product-marketing flourishes
- decorative shapes that do not support the content
- a design-tool aesthetic that competes with the subject matter

Use paper as the substrate, not as costume.

## Core Principles

### 1. Information Should Feel Edited

The interface should look curated and deliberate. Important items are
framed clearly, secondary details are quieter, and metadata should not
compete with the story of the page.

### 2. Physicality Should Support Trust

Texture, grain, rules, stamps, and paper-like layering are welcome when
subtle. They should make the site feel grounded and tangible, not themed.

### 3. Typography Carries the Tone

Type is the main expression of authority here. Strong typographic contrast
matters more than decorative components. Headlines can feel editorial;
supporting UI text should feel measured and scholarly.

### 4. Data Should Read Like Evidence

Vote tallies, dates, bill identifiers, and party breakdowns should feel
precise and inspectable. Prefer structures that resemble notes, ledgers,
indexes, or annotated records over generic dashboard cards.

### 5. Restraint Beats Ornament

Avoid adding visual gestures unless they strengthen hierarchy, improve
legibility, or reinforce the briefing-packet metaphor.

## Visual Character

### Color

Prefer a narrow palette built around:

- paper tones: ivory, oat, bone, faded parchment
- ink tones: charcoal, graphite, muted black
- annotation tones: restrained navy or slate blue
- signal tones: muted rust, oxblood, forest, or institutional green

Use saturated colors sparingly. Red and green should primarily communicate
vote outcomes or status, not general decoration.

The page should feel mostly neutral, with accent color used like an editor's
marking pen rather than a marketing highlight.

### Texture

Backgrounds can use subtle grain, wash, drafting lines, or faint grid/rule
patterns. Texture should remain low-contrast and never interfere with text.

### Shape

Favor rectangles, clipped corners, tabs, ruled sections, and modest radii.
Large soft pills and highly inflated cards should be the exception, not the
default.

## Typography

Typography should balance editorial voice with institutional clarity.

- Headlines: serif or high-character display typography with a measured,
  scholarly tone
- Interface text: neutral humanist or civic sans
- Data labels and microcopy: compact, disciplined, and understated

Prefer contrast in scale, weight, and case over contrast created through
color blocks.

### Typographic Behavior

- Headings should be calm and confident, not loud
- Labels may use uppercase sparingly for metadata or docket markers
- Long explanatory copy should remain highly readable and never feel cramped
- Numbers, dates, and identifiers should align cleanly and scan quickly

## Layout And Composition

Pages should feel composed like a packet assembled from distinct inserts.

- Build clear page scaffolding before adding local ornament
- Let major sections breathe
- Use rules, columns, insets, marginal notes, and grouped metadata
- Prefer fewer, stronger sections over many equally weighted cards
- Keep the primary content visible early, especially on desktop landing views

The home page should read like a front-page briefing.
The vote detail page should read like an annotated case file.
The about page should read like an editorial statement or project note.

Introductory framing should stay compact enough that users reach the main
briefing content immediately. A page should not spend most of its initial
viewport on a decorative hero.

Current-day context matters. Archived or stale legislative activity must be
labeled clearly and must not be promoted as the active daily briefing.

## Components

### Surfaces

Surfaces should feel like sheets, folders, briefs, or evidence blocks.

- Prefer layered paper panels over glassmorphism
- Use border rules and shadows conservatively
- Use contrast in paper tone before reaching for blur or heavy elevation

### Navigation

Navigation should feel utilitarian and light. It is part of the document
frame, not a dominant product shell.

### Status And Metadata

Metadata should often be inline, tabular, stamped, or arranged in small
definition groups. Avoid turning every fact into a pill.

### Actions

Buttons and links should feel purposeful and editorial. They can resemble
document controls, stamps, or underlined references, but should still feel
native to the web and clearly interactive.

## Motion

Motion should be minimal and meaningful.

- subtle section reveals
- gentle paper-like shifts or lifts
- no ornamental bouncing, glowing, or busy micro-animation

If an animation draws more attention than the information, it is too strong.

## Imagery And Diagramming

When visual embellishment is needed, prefer:

- linework
- ruled diagrams
- dossier-like callouts
- restrained map or chamber references

Avoid stock-photo energy, patriotic cliches, or decorative icon overload.

## Accessibility And Usability

This design language should never justify reduced clarity.

- maintain strong text contrast
- preserve clear hover and focus states
- ensure texture never obscures copy
- keep mobile layouts as legible as desktop layouts
- let dense information collapse gracefully on small screens

## Guardrails

When adding or revising UI, prefer:

- fewer surfaces with stronger hierarchy
- typographic emphasis before color emphasis
- evidence-like data presentation
- muted, tactile backgrounds
- components that feel editorial and institutional

Avoid:

- glassmorphism as the default
- glossy startup gradients
- oversized pill collections
- ornamental patriotic motifs
- decorative elements that do not strengthen the content

## Working Rule

Before shipping a UI change, ask:

1. Does this feel like a credible legislative briefing artifact?
2. Does the visual treatment increase trust and readability?
3. Is the page led by type, structure, and evidence rather than decoration?

If the answer is no, revise the design or update this document.
