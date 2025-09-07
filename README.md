# Quizify

Quizify is a web application designed to help users quickly and efficiently generate quizzes from lecture text. Leveraging the power of the Gemini API, Quizify transforms your study material into interactive multiple-choice quizzes, providing immediate feedback and score tracking.

## Features:

- **Lecture Text Input:** Easily paste or type your lecture notes into a dedicated input box.
- **Quiz Generation:** The application utilizes the Gemini API to generate a comprehensive quiz (10-20 questions) with four multiple-choice options for each question. To enhance the challenge, the LLM employs a tool to strategically include distracting information in the options.
- **Interactive Quiz Display:** Engage with the generated questions through an intuitive interface. Each question's options are presented as clickable buttons.
- **Answer Validation and Feedback:** Receive instant visual feedback on your answers. Correct choices are highlighted in pale green, while incorrect ones turn red. Once an answer is selected, the options for that question are disabled.
- **Score Tracking:** Keep track of your progress with a real-time score display, showing the number of correct answers out of the total questions (e.g., '7 out of 10').
- **Quiz Regeneration:** Easily generate a new set of questions from the same lecture text with a dedicated regeneration button.

## Style:

Quizify is designed with a clean and minimalist aesthetic to facilitate a focused learning experience.

- **Primary Color:** Muted blue (`#6699CC`) for a calm and intellectual feel.
- **Background Color:** Very light blue (`#F0F8FF`) for a gentle and unobtrusive backdrop.
- **Accent Color:** Pale green (`#A0D6B4`) to highlight correct answers.
- **Fonts:** 'Inter' for body and headline text for readability, and 'Source Code Pro' for any code snippets.
- **Icons:** Simple and minimalist icons are used where appropriate.
- **Animations:** Subtle fade-in animations enhance the user experience during quiz updates.

## Getting Started:

To explore the codebase, start by looking at `src/app/page.tsx`.

## Development:

### Switching to OpenRouter (how to configure your API key)

This project now uses OpenRouter for LLM calls. To run the app locally with your OpenRouter API key:

1. Create a file named `.env.local` in the project root.
2. Add your key and optionally the model name:

```
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_MODEL=your_model_here
```

3. Install dependencies and run the dev server:

```powershell
npm install
npm run dev
```

The app will be available at http://localhost:9002 (per package.json dev script).

If you want to use a different OpenRouter model, update `OPENROUTER_MODEL` or leave it unset to use the default.


