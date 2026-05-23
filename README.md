# Quizify — Turn Any Notes into a Quiz in Seconds

Stop re-reading. Start remembering. Quizify instantly transforms your study material into interactive quizzes powered by AI.

---

## What is Quizify?

Paste your lecture notes, textbook excerpts, or any study content — and Quizify generates a set of multiple-choice questions on the spot. No manual question writing, no flashcard apps to maintain. Just smart, targeted practice.

Whether you're cramming for an exam or reinforcing what you learned today, Quizify turns passive reading into active recall.

---

## Features

| Feature | Description |
|---|---|
| **AI-Powered Questions** | Generates relevant multiple-choice questions from any text you paste in |
| **Instant Feedback** | See right away which answers are correct and which ones to review |
| **Regenerate on Demand** | Not happy with the questions? Generate a fresh set with one click |
| **Score Tracking** | Keep track of how you're doing as you work through each quiz |

---

## How It Works

1. **Paste your material** — notes, slides, a chapter summary, anything text-based
2. **Hit Generate** — Quizify's AI reads your content and crafts quiz questions
3. **Take the quiz** — answer each question and get immediate feedback
4. **Review & repeat** — see your score, regenerate new questions, and keep going

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- An AI API key (see `.env.local.example` for configuration details)

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure your environment:**

   Copy `.env.local.example` to `.env.local` and fill in your credentials:
   ```bash
   cp .env.local.example .env.local
   ```

3. **Start the app:**
   ```bash
   npm run dev
   ```

---

## Tips for Best Results

- **More context = better questions.** Paste at least a few paragraphs for the AI to work with.
- **Focused material works best.** A single topic or chapter generates more targeted questions than a broad collection of notes.
- **Regenerate freely.** Each generation produces unique questions — use it to test yourself from different angles.

---

## Tech Stack

Built with [Next.js](https://nextjs.org/), [TypeScript](https://www.typescriptlang.org/), and [Tailwind CSS](https://tailwindcss.com/).
