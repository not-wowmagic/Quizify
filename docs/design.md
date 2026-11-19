# Quizify design direction

This is the visual contract for Quizify. It describes a focused study tool with
its own point of view, not a generic AI dashboard. If a new component does not
help a learner read, answer, review, or recover from an interruption, it should
not compete for attention.

## North star

Quizify should feel like a well-made study instrument: monochrome field notes,
paper cards, clear marks, and small moments of feedback. The interface can be
warm and encouraging, but it should never perform “AI magic” through purple
gradients, glowing controls, decorative motion, or a wall of rounded containers.

The product has one presentation mode. There is no dark-theme switch or dark
theme-specific control styling in the interface.

## Visual language

The active Meadow palette is the product identity. It is intentionally limited
to a light gray workspace, white paper surfaces, near-black ink, and grayscale
signals.

| Role | Value | Use |
| --- | --- | --- |
| Paper gray | `#F5F5F5` | Page background and quiet depth |
| Card white | `#FFFFFF` | Setup, runner, summary, and score surfaces |
| Ink | `#0A0A0A` | Headings, question text, primary contrast, borders, and hard shadows |
| Graphite | `#5C5C5C` | Secondary text, inactive labels, and dividers |
| Wash | `#F0F0F0` | Secondary fills, disabled controls, and quiet buttons |
| Focus ink | `#0A0A0A` | Keyboard focus and links |

Use contrast, icons, and text to explain state, not hue. Success and error
states must remain distinguishable through label, icon, and border as well as
tone. Do not introduce a new accent without a concrete interaction that needs it.

### Surfaces and shape

- Treat the light gray workspace as the canvas and white cards as paper placed on it.
- Give primary sheets an ink border and a hard offset shadow; keep secondary
  cards lighter so the hierarchy stays obvious at a glance.
- The active theme uses opaque paper surfaces. Reserve translucency for overlays
  and transient states; blur must never reduce text contrast.
- Do not use large decorative gradients, gradient text, neon glows, or mesh
  backgrounds. A restrained dot screen or rule pattern is enough texture.
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

1. Does it look recognizably like Quizify’s black-and-white study instrument?
2. Is the learner’s next action obvious without decorative explanation?
3. Are icons earning their space and aligned with the text they support?
4. Does the mobile layout remain compact and usable at narrow widths?
5. Can the user cancel, retry, navigate, refresh, and recover without losing
   work?
6. Does the screen still work with a keyboard, reduced motion, and no emoji or
   color-only cues?
