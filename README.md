# Quizify

Quizify is an AI-powered web application that instantly turns lecture notes or study material into interactive multiple-choice quizzes using the Gemini/OpenRouter API.

## Features

- **AI Quiz Generation**: Generates multiple-choice questions from study text.
- **Immediate Feedback**: Highlights correct and incorrect answers instantly.
- **Score Tracking & Regeneration**: Tracks scores and lets you regenerate new questions.

## Getting Started

1. Create a `.env.local` file in the root directory:
   ```env
   OPENROUTER_API_KEY=your_api_key_here
   OPENROUTER_MODEL=openai/gpt-4o-mini
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:9002`.
