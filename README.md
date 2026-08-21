# Quizify - Turn Any Notes into a Quiz in Seconds

[![CI](https://github.com/not-wowmagic/Quizify/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/not-wowmagic/Quizify/actions/workflows/ci.yml)

Stop re-reading. Start remembering. Quizify instantly transforms your study material into interactive quizzes powered by AI.

---

## What is Quizify?

Upload study documents (PDF, DOCX), paste lecture notes and textbook excerpts, load a URL, or scan a photo of a page: Quizify generates custom quizzes on the spot. Choose from standard multiple choice, matching pairs, true or false, fill in the blank, situational scenarios, or mixed question sets.

With built-in AI summaries, an on-demand tutor, and customizable difficulty settings, Quizify turns passive reading into active recall.

---

## Features

| Feature | Description |
|---|---|
| **Document & Text Input** | Upload PDF or DOCX files, paste study text, or pull clean article text from a URL |
| **Photo OCR** | Scan a page or screenshot with your camera and Quizify turns the image into questions |
| **Versatile Question Types** | Generates Multiple Choice, Matching Pairs, True/False, Fill-in-the-Blank, Situational, or Mixed quizzes |
| **Adaptive Difficulty** | An adaptive mode that ramps from easy to hard and weights your mastery score by tier |
| **Customizable Settings** | Adjust difficulty (Easy, Medium, Hard, Adaptive) and choose question counts from 1 to 50 |
| **Ask Tutor** | Ask a Socratic AI tutor about any question when you get stuck |
| **AI Summary Generation** | Distill long lecture notes and documents into concise study summaries |
| **Instant Feedback & Scoring** | Real-time score tracking, immediate answer verification, and interactive matching column pairs |
| **Practice Missed** | Retake a quiz made up of only the questions you answered wrong |
| **Study Insights** | Daily goal + heatmap, topic accuracy breakdown, and score trends in the History tab |
| **Export & Share** | Export to Anki or CSV, share a quiz via link, and let others take it with a QR code |
| **Incognito Mode** | Generate and take quizzes with zero database footprint |
| **Offline PWA** | Installable and shell-cached so the app loads even without a connection |
| **Privacy-first Analytics** | Cookie-free, self-hostable analytics (Umami) |
| **Dark & Light Mode** | Seamless theme switching for comfortable day or night study sessions |

---

## How It Works

1. **Add your material** - attach a PDF or DOCX, paste lecture notes, load a URL, or scan a photo
2. **Customize settings** - choose question count (1-50), difficulty level (including adaptive), and preferred question format
3. **Generate quiz & summary** - Quizify creates tailored questions and optional study summaries instantly
4. **Test & learn** - answer questions, complete matching pairs, ask the tutor for help, and track your score

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v22 or higher
- An AI API key (see `.env.local.example` for configuration details). The default provider is **opencode** (`OPENCODE_API_KEY` from https://opencode.ai/auth); the direct **Gemini** provider is available as a fallback via `AI_PROVIDER=gemini`.

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure your environment:**

   Copy `.env.local.example` to `.env.local` and fill in your credentials (`.env.local` is gitignored, so keys never reach GitHub):
   ```bash
   cp .env.local.example .env.local
   ```

3. **Start the app:**
   ```bash
   npm run dev
   ```

> **Deploying to Netlify:** add the environment variables in the Netlify dashboard
> (Site settings > Environment variables) instead of `.env.local`. Required:
> `OPENCODE_API_KEY`. Optional: `AI_PROVIDER`, `OPENCODE_MODEL`, `OPENCODE_VISION_MODEL`,
> `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`,
> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (history + sharing), `UPSTASH_REDIS_REST_URL`,
> `UPSTASH_REDIS_REST_TOKEN` (global rate limiting), `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
> (privacy-first analytics). The build pipeline and CSP proxy need no extra configuration.

---

## Tips for Best Results

- **More context = better questions.** Provide at least a few paragraphs or a complete document section for the AI to analyze.
- **Focused material works best.** A single topic or chapter generates more targeted questions than a broad collection of unrelated notes.
- **Utilize different question types.** Switch between multiple choice, matching pairs, and situational questions to test your knowledge from multiple angles.
- **Ask the tutor.** Stuck on a question? Ask the AI tutor for a guided explanation instead of guessing.

---

## Tech Stack

Built with [Next.js](https://nextjs.org/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [PDF.js](https://mozilla.github.io/pdf.js/), and [Mammoth.js](https://github.com/mwilliamson/mammoth.js). Quiz generation runs server-side via the opencode AI gateway (with an optional direct [Gemini](https://ai.google.dev/) provider). Charts use [Recharts](https://recharts.org/), web pages are extracted with jsdom + Mozilla Readability, sharing uses [Supabase](https://supabase.com/), global rate limits use [Upstash](https://upstash.com/), and QR codes use [qrcode.react](https://github.com/zpao/qrcode.react).

---

## Disclaimer: AI-Generated Project

> **Notice:** This project was largely generated using Artificial Intelligence.

* **Generation Tooling**: Built utilizing autonomous AI agents and generative tools.
* **Code & Docs**: Codebase structure, functions, and documentation were machine-generated.
