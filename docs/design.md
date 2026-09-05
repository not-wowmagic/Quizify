# Quizify design direction

This is the visual contract for Quizify. It describes a focused study tool with
its own point of view, not a generic AI dashboard. If a new component does not
help a learner read, answer, review, or recover from an interruption, it should
not compete for attention.

## North star

Quizify should feel like a well-made study instrument: blue field notes, paper
cards, clear marks, and small moments of feedback. The interface can be warm and
encouraging, but it should never perform “AI magic” through purple gradients,
glowing controls, decorative motion, or a wall of rounded containers.

The product has one presentation mode. There is no dark-theme switch or dark
theme-specific control styling in the interface.

## Visual language

The active Meadow palette is the product identity. It is intentionally limited
to a deep blue workspace, pale blue paper surfaces, dark ink, and a saffron
accent.

| Role | Value | Use |
| --- | --- | --- |
| Field blue | `#2E5D8A` | Page background and quiet depth |
| Paper blue | `#C6DFEF` | Setup, runner, summary, and score surfaces |
| Ink | `#142639` | Headings, question text, and primary contrast |
| Water | `#7298B9` | Secondary text, inactive controls, and dividers |
| Saffron | `#F6C649` | Attention, selected state, and key calls to action |
| Focus teal | `#0B6E8E` | Keyboard focus and links |

Use color to explain state, not to decorate every surface. Success and error
states should remain distinguishable through text and borders as well as hue.
Do not introduce a new accent without a concrete interaction that needs it.

### Surfaces and shape

- Treat the blue workspace as the canvas and pale cards as paper placed on it.
- Cards use a modest radius and a quiet border. One restrained shadow is enough.
- Glass effects are optional and subordinate: a little translucency can help a
  surface sit in the field, but blur must not reduce text contrast or turn every
  element into frosted glass.
- Do not use large decorative gradients, gradient text, neon glows, or mesh
  backgrounds.
- Buttons are compact rectangles with readable labels. Reserve pill shapes for
  status badges and compact filters, never for every action.
- Icons are supporting marks, not labels. Keep them close to their text,
  `aria-hidden` when decorative, and remove them when they make a small layout
  harder to scan.

## Typography

Use the humanist system sans stack used by the app:
`"Avenir Next", "Segoe UI Variable", "Segoe UI", sans-serif`.

Typography should do the hierarchy work. Use strong ink headings, comfortable
question text, and small uppercase labels only for metadata. Do not use a
display font, all-caps paragraphs, or arbitrary font-size jumps to manufacture
personality. A monospace face is reserved for literal counts, IDs, and exported
technical content.

Suggested hierarchy:

- Page title: 2–3rem, heavy, left aligned on wide screens.
- Workspace title: 1.25–1.5rem, heavy.
- Question text: 1–1.125rem, bold enough to scan without shouting.
- Body and answer text: 0.9375–1rem with a relaxed line height.
- Metadata: 0.75–0.8125rem, medium contrast, never the only way to understand
  an action.

## Layout rules

The experience is a readable single column, not a marketing hero surrounded by
cards. Keep the main reading measure around 60–72rem and let the question list
own the page.

- Setup should show the source input first, then question parameters, then the
  generate action.
- The paste area reports characters and words beside the input and makes the
  100-character minimum explicit.
- The runner header should be compact. On small screens, secondary actions live
  in a `More` menu; the question and its answer choices stay primary.
- Preserve the current quiz while regeneration runs. Show progress, cancel, and
  retry in context instead of replacing the page with an empty setup state.
- On mobile, content should size to its contents. Never give a column child a
  desktop flex basis that creates a tall empty card.
- Use real links for navigation destinations so open-in-new-tab and keyboard
  browsing continue to work. Use buttons for state changes and submissions.

## Component behavior

### Setup

The setup card accepts upload, paste, web, and camera sources. Every source has
one clear next action. Loading states distinguish reading a file from generating
a quiz. Generation exposes a cancel action; failed generation leaves the input
intact and exposes retry.

### Runner

The runner keeps the title, question count, format, and language in a compact
header. Desktop may show the common actions inline. Mobile uses `More` for
export, share, visibility, summary, and settings. The active question list
never disappears while a replacement quiz is being generated.

### History

Deletion is reversible in intent: ask for confirmation before the destructive
request and make the specific attempt clear. Empty, loading, error, and filtered
states all explain what happened and what the learner can do next.

### Completion

The score card leads with the result and next useful actions. It does not need a
celebration icon, emoji, rotating quote, or green halo to communicate success.
Answer feedback uses text, border, and contrast so it remains understandable
without relying on color alone.

## Motion and accessibility

Motion is functional: use it to reveal a new summary, acknowledge a completed
action, or show asynchronous work. Avoid perpetual ambient animation and
transitioning every property. Respect `prefers-reduced-motion` and never hide
focus indicators.

Interactive controls need visible labels or an accessible name. Form fields
need labels and useful descriptions. Async status belongs in an announced
`status` or `alert` region. Destructive actions need confirmation or undo.
Keyboard order, touch targets, contrast, and text resizing are part of the
design—not a final polish pass.

## Review checklist

Before shipping a screen, ask:

1. Does it look recognizably like Quizify’s blue-paper study instrument?
2. Is the learner’s next action obvious without decorative explanation?
3. Are icons earning their space and aligned with the text they support?
4. Does the mobile layout remain compact and usable at narrow widths?
5. Can the user cancel, retry, navigate, refresh, and recover without losing
   work?
6. Does the screen still work with a keyboard, reduced motion, and no emoji or
   color-only cues?
