# Quizify - Turn Any Notes into a Quiz in Seconds

Stop re-reading. Start remembering. Quizify instantly transforms your study material into interactive quizzes powered by AI.

---

## What is Quizify?

Upload study documents (PDF, DOCX) or paste lecture notes and textbook excerpts: Quizify generates custom quizzes on the spot. Choose from standard multiple choice, matching pairs, true or false, fill in the blank, situational scenarios, or mixed question sets.

With built-in AI summaries, step-by-step explanations, and customizable difficulty settings, Quizify turns passive reading into active recall.

---

## Features

| Feature | Description |
|---|---|
| **Document & Text Input** | Upload PDF or DOCX files directly or paste study text |
| **Versatile Question Types** | Generates Multiple Choice, Matching Pairs, True/False, Fill-in-the-Blank, Situational, or Mixed quizzes |
| **Customizable Settings** | Adjust difficulty (Easy, Medium, Hard) and choose question counts from 1 to 50 |
| **AI Explanations** | Get instant AI breakdowns for questions to solidify understanding |
| **AI Summary Generation** | Distill long lecture notes and documents into concise study summaries |
| **Instant Feedback & Scoring** | Real-time score tracking, immediate answer verification, and interactive matching column pairs |
| **Dark & Light Mode** | Seamless theme switching for comfortable day or night study sessions |

---

## How It Works

1. **Upload or paste material** - attach a PDF or DOCX file, or paste your lecture notes directly
2. **Customize settings** - choose question count (1-50), difficulty level, and preferred question format
3. **Generate quiz & summary** - Quizify creates tailored questions and optional study summaries instantly
4. **Test & learn** - answer questions, complete matching pairs, check AI explanations, and track your score

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

- **More context = better questions.** Provide at least a few paragraphs or a complete document section for the AI to analyze.
- **Focused material works best.** A single topic or chapter generates more targeted questions than a broad collection of unrelated notes.
- **Utilize different question types.** Switch between multiple choice, matching pairs, and situational questions to test your knowledge from multiple angles.
- **Check AI explanations.** Review explanations on missed questions to reinforce concepts and close learning gaps.

---

## Tech Stack

Built with [Next.js](https://nextjs.org/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [PDF.js](https://mozilla.github.io/pdf.js/), and [Mammoth.js](https://github.com/mwilliamson/mammoth.js).

---

## Disclaimer: AI-Generated Project

> **Notice:** This project was largely generated using Artificial Intelligence.

* **Generation Tooling**: Built utilizing autonomous AI agents and generative tools.
* **Code & Docs**: Codebase structure, functions, and documentation were machine-generated.

