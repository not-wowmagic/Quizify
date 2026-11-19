# Quizify design direction

This is the visual contract for Quizify. It describes a focused study tool with
its own point of view, not a generic AI dashboard. If a new component does not
help a learner read, answer, review, or recover from an interruption, it should
not compete for attention.

## North star

Quizify should feel like a well-made study instrument: paper in light mode, ink
in dark mode, clear marks, and small moments of feedback. The interface can be
warm and encouraging, but it should never perform “AI magic” through purple
gradients, glowing controls, decorative motion, or a wall of rounded containers.

The product ships light and dark modes. A persistent toggle in the top bar
applies the learner's choice across the app, and both modes must hold the same
hierarchy.

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

## Visual language

Both modes share the same editorial structure: paper sheets, ink borders, hard
offset shadows, and a dot-screen canvas. Color is reserved for action, state,
and data.

### Light

| Role | Value | Use |
| --- | --- | --- |
| Background | `#ffffff` | Page canvas and card paper |
| Text | `#1a1a1a` | Headings and body copy |
| Muted | `#8a8a8a` | Soft muted tone: large text, icons, dividers |
| Border | `#b8b8b8` | Card outlines and quiet dividers |
| Primary | `#3b7dd8` | Primary actions, active tabs, focus |
| Accent | `#d68c27` | Secondary signal and the session kicker |
| Purple | `#7b5bb6` | Matching pair tags and text links |
| Green | `#3d9a57` | Correct answers and positive data |
| Red | `#d1383d` | Errors and incorrect answers |
| Cyan | `#318795` | Matching pair tags and secondary data |

Small muted text uses `#6b6b6b` (5.33:1 on white) because `#8a8a8a` is 3.45:1
and fails AA at body size. Interactive control edges use `#8a8a8a` for 3.45:1
against white; `#b8b8b8` is reserved for card outlines where the hard shadow
carries the boundary. Primary buttons use `#0a0a0a` text on `#3b7dd8` for
4.82:1. Text links use the purple (`#7b5bb6`, 5.23:1 on white) because the
primary blue is not AA as small text; the blue is reserved for filled actions,
active states, and focus, where it carries dark text.

### Dark

| Role | Value | Use |
| --- | --- | --- |
| Background | `#0a0a0a` | App canvas |
| Panel | `#141414` | Cards and raised surfaces |
| Element | `#1e1e1e` | Hover fills and raised controls |
| Border | `#484848` | Card outlines |
| Text | `#eeeeee` | Headings and body copy |
| Muted | `#808080` | Secondary text and labels |
| Primary | `#fab283` | Primary actions, active tabs, focus |
| Accent | `#9d7cd8` | Secondary signal and the session kicker |
| Blue | `#5c9cf5` | Matching pair tags and links |
| Green | `#7fd88f` | Correct answers and positive data |
| Red | `#e06c75` | Errors and incorrect answers |
| Cyan | `#56b6c2` | Matching pair tags and secondary data |
| Yellow | `#e5c07b` | Medium difficulty and data |
| Warning | `#f5a742` | Warning states |

Small muted text uses `#808080` on `#141414` (4.66:1). Interactive control edges
use `#808080` for 5.01:1 against the canvas. Primary peach, purple, blue, green,
cyan, yellow, and warning fills use `#0a0a0a` text, all above 4.5:1. Red fills
also use `#0a0a0a` text at 6.2:1.

### Chrome

| Role | Value | Use |
| --- | --- | --- |
| Page background | `#0c0c0c` | Outermost dark canvas |
| Primary text | `#fafafa` | Brand mark and strongest text |
| Muted text | `#8f8f8f` | Chrome metadata and secondary labels |
| Borders | `#2e2e2e` | Top bar rules and quiet separators |
| Link | `#4f8bff` | Links in dark mode |
| Favicon tile | `#131010` | Favicon and app icon tile |
| Logo inner square | `#5a5858` | Logo inner shape |

Use contrast, icons, and text to explain state. Success and error states must
remain distinguishable through label, icon, and border as well as tone. Do not
introduce a new accent without a concrete interaction that needs it.

### Surfaces and shape

- Treat the page canvas as the desk and the card color as paper placed on it.
- Give primary sheets an ink border and a hard offset shadow; keep secondary
  cards lighter so the hierarchy stays obvious at a glance.
- The active theme uses opaque surfaces. Reserve translucency for overlays
  and transient states; blur must never reduce text contrast.
- The dot screen is the identity motif: a printed study-sheet texture that
  separates the canvas from the paper. Keep it quiet; it must never compete with
  question text.
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
design, not a final polish pass.

## Review checklist

Before shipping a screen, ask:

1. Does it look recognizably like Quizify in both light and dark modes?
2. Is the learner’s next action obvious without decorative explanation?
3. Are icons earning their space and aligned with the text they support?
4. Does the mobile layout remain compact and usable at narrow widths?
5. Can the user cancel, retry, navigate, refresh, and recover without losing
   work?
6. Does the screen still work with a keyboard, reduced motion, and no emoji or
   color-only cues?
