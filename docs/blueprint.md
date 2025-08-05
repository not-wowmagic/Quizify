# **App Name**: Quizify

## Core Features:

- Lecture Text Input: Input box to paste or type lecture text.
- Quiz Generation: Leverage the Gemini API to generate a quiz (10-20 questions with four multiple-choice options) from the provided text. The LLM will use a tool to determine when to add distracting information, to generate more challenging options for the questions.
- Interactive Quiz Display: Interactive display of generated multiple-choice questions. Each question has four options presented as selectable buttons.
- Answer Validation and Feedback: Visual feedback for selected answers. Highlights correct answers in green and incorrect answers in red. After an answer is selected, the buttons for that question are disabled.
- Score Tracking: Real-time score display showing the number of correct answers out of the total questions. For example, '7 out of 10'.
- Quiz Regeneration: A button that allows users to regenerate the quiz with a new set of questions based on the same lecture text.

## Style Guidelines:

- Primary color: Muted blue (#6699CC), suggestive of study and intellect without being overly stimulating.  This choice supports the app's educational purpose.
- Background color: Very light blue (#F0F8FF), providing a calm and unobtrusive backdrop. This gentle hue complements the primary color.
- Accent color: Pale green (#A0D6B4) for correct answers, used sparingly to signal success.
- Body and headline font: 'Inter', a sans-serif font offering a clean, modern appearance ideal for readability and usability.
- Code font: 'Source Code Pro', used when displaying code snippets (if applicable). This monospace font provides clear differentiation for code-related content.
- Simple, minimalist icons for the quiz elements (if any).
- Subtle fade-in animations when the quiz questions or score updates.