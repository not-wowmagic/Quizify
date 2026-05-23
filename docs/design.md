# Quizify Design System & Language Specification

This document defines the visual guidelines, design tokens, component states, and layout structure of the Quizify application. Use this specification to redesign or rebuild the interface using modern UI design tools (such as Google Stitch or Figma).

---

## 1. Visual Design Philosophy
Quizify is a clean, modern, and delightful educational tool. The design goals are:
- **Focused Learning:** A clean, distraction-free environment that maximizes readability of quiz questions and explanations.
- **Intellectual and Calming Tone:** Muted blue-grey palettes paired with friendly, supportive details (like motivational quotes and success green accent details) to lower text anxiety.
- **Delightful & Modern (Glassmorphism):** Dotted grid backgrounds, subtle gradient backdrops, soft glass borders, card overlays, and smooth transitions that make the app feel alive and premium.

---

## 2. Design Tokens (Color & Styling)

### Color Palette (Tailwind & CSS Custom Properties)

#### Light Mode
| Token | Tailwind Class / Variable | HSL / Hex Value | Purpose |
| :--- | :--- | :--- | :--- |
| **Background** | `bg-background` | `hsl(210, 40%, 98%)` to `hsl(210, 40%, 90%)` | Radial gradient background (light blue to clean white) |
| **Foreground** | `text-foreground` | `hsl(222.2, 84%, 4.9%)` | Dark slate for maximum text contrast |
| **Primary** | `bg-primary` | `hsl(206, 83%, 53%)` / `#6699CC` | Muted blue for core branding, CTA buttons, and icons |
| **Accent / Success** | `bg-accent` | `hsl(151, 46%, 74%)` / `#A0D6B4` | Pale green for correct answer states and highlight badges |
| **Destructive** | `bg-destructive` | `hsl(0, 84.2%, 60.2%)` | Soft crimson red for incorrect answer states |
| **Card Background** | `bg-card` | `hsl(0, 0%, 100% / 60%)` | White card overlay with glassmorphic transparency |
| **Border** | `border-border` | `hsl(214.3, 31.8%, 91.4%)` | Subtle borders for card dividers and inputs |

#### Dark Mode
| Token | Tailwind Class / Variable | HSL / Hex Value | Purpose |
| :--- | :--- | :--- | :--- |
| **Background** | `bg-background` | `hsl(224, 71%, 4%)` | Deep midnight navy background with dotted grid pattern (`background-size: 2rem 2rem`) |
| **Foreground** | `text-foreground` | `hsl(210, 40%, 98%)` | Near-white for high legibility |
| **Primary** | `bg-primary` | `hsl(210, 40%, 98%)` | Inverted primary (clean white) for high-contrast visibility |
| **Secondary** | `bg-secondary` | `hsl(215, 28%, 17%)` | Dark slate background for inputs, selectors, and secondary actions |
| **Success** | `bg-success` | `hsl(145, 63%, 42%)` | Deep green for dark mode correct answer highlight |
| **Destructive** | `bg-destructive` | `hsl(0, 63%, 31%)` | Muted maroon for dark mode incorrect answer highlight |
| **Border** | `border-border` | `hsl(215, 28%, 17%)` | Dark grey slate borders for containment |

### Borders, Shadows & Backdrop Filters
- **Border Radius:** Main cards use `--radius: 12px` (fully rounded corners). Active CTA buttons are highly rounded or pill-shaped (`rounded-full`).
- **Glassmorphic Filter:** Cards overlaying the background use `backdrop-blur-xl` combined with transparent borders (e.g. `border-white/10` or `border-white/20` on hover) to integrate smoothly with the background gradients.
- **Shadows:** Cards use deep, soft drop shadows (`shadow-2xl` and `shadow-lg`) to establish depth.

---

## 3. Typography System
Quizify relies on two core font families:
1. **Body & Headings:** `Inter` (sans-serif)
   - Clean, highly readable, and geometric. Used for titles, question text, option labels, and instructions.
2. **Code & Snippets:** `Source Code Pro` (monospace)
   - Used for any technical snippets, variables, or system code output.

### Typographic Scale
- **Main Heading:** `4xl` or `5xl` (bold, tracking-tight, centered)
- **Sub-headings / Card Titles:** `xl` or `2xl` (semi-bold)
- **Body / Question Options:** `base` (16px) or `lg` (18px) for comfortable reading.
- **Helper Labels / Captions:** `sm` (14px) or `xs` (12px) (regular/medium, muted color).

---

## 4. Layout & Responsive Structure
The application follows a centered single-column layout:
- **Maximum Width:** Constrained to `max-w-4xl` (`960px`) for optimal readability.
- **Responsive Padding:** `px-4 py-8` (mobile) to `px-6 py-12` (desktop).
- **Floating Accents:** Background features an absolute positioned multi-color gradient mesh overlay (`from-indigo-500/10 via-purple-500/10 to-pink-500/10` with `-z-10`) to provide structural depth without visual noise.

---

## 5. Components & UI States

### A. Quiz Settings & Setup Panel
This initial view allows the user to prepare their lecture text. It utilizes a central container card (`bg-card/60 backdrop-blur-xl`):
1. **Input Tabs (File Upload vs. Paste Text):**
   - **File Upload:** Drag-and-drop dotted target box. Displays simple upload icon, clear file format advice (`PDF, DOCX`), and a highlight label showing the filename when loaded.
   - **Text Paste Area:** Large, clean textarea (`bg-secondary/80`) with soft placeholder text and disabled states during generation.
2. **Parameters Grid:** A responsive 3-column layout containing:
   - **Number of Questions Selector:** Numerical input capped at 50 questions.
   - **Difficulty Dropdown:** Select dropdown containing "Easy", "Medium", and "Hard".
   - **Question Type Dropdown:** Select dropdown supporting "Multiple Choice", "Situational", "Fill in the Blank", "True / False", and "Mixed".
3. **Generate Action CTA:** Primary button featuring a sparkles icon and a loading state (`Loader2` spinner + "Generating Quiz...").
4. **Footer Motivational Area:** Centered italicized text rotating random inspirational quotes to encourage the user.

### B. Summary Panel
Once a quiz is generated, Quizify displays an optional lecture summary:
- **Collapse Toggle:** A clean secondary button labeled "Show Summary" with a document icon.
- **Expanded State:** Renders the AI-generated bulleted key points in a container card styled with a secondary background (`bg-secondary/50`) and muted text.

### C. Interactive Question Cards
Questions are listed sequentially inside distinct, clean cards (`bg-card/80 backdrop-blur-sm`). Each card includes:
1. **Title:** Displayed as `<Question Number>. <Question Text>` (bold, clear font-size).
2. **Options list:** Vertical grid/stack of option buttons.
3. **Option State Styling (CRITICAL):**
   - **Unanswered / Idle:** Light bordered outline buttons with a circular icon containing the option letter (A, B, C, D) on the left. Subtle hover background change.
   - **Correct Answer (Selected or Revealed):** Soft green background, green text, success icon (`CheckCircle2`) on the right.
   - **Incorrect Answer (Selected):** Soft red background, red text, alert icon (`XCircle`) on the right.
   - **Unselected / Distractor Options (Once Answered):** High transparency opacity (`opacity-60`), muted grey borders, and click actions disabled.
4. **Explanation Section:** Hidden by default. After selection, a link button ("Show Explanation") reveals a card block (`bg-secondary/80`) containing context details accompanied by a yellow lightbulb icon.

### D. Final Scorecard Card
Appears at the bottom of the questions array once all questions have been answered:
- **Background:** Blended soft-green to teal gradient border (`from-green-500/20 to-cyan-500/20 border-green-500/30`).
- **Main Output:** Large-scale score display (e.g., `8 / 10`) with a percentage indicator (`80%`) and custom success/feedback message based on performance.
- **Controls:**
  - **Regenerate Quiz:** Secondary outline button to query new questions on the same notes.
  - **Start Over:** Secondary outline button to completely reset inputs and return to the Setup panel.

---

## 6. Animations & Transitions
- **Fade-Ins:** Smooth CSS fade-in transitions (`animate-in fade-in duration-500`) applied to the quiz layout, cards, and individual explanation blocks when they appear.
- **Button Hover States:** Dynamic background transitions with standard transition rates (`transition-all duration-300`).
- **Spinners:** Infinite rotations applied to loader icons (`animate-spin`) during generation requests.
