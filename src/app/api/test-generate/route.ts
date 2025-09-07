import { NextResponse } from 'next/server';
import { generateQuiz } from '@/ai/flows/generate-quiz';

export async function GET() {
  try {
    const sample = {
      lectureText: 'Photosynthesis is the process by which green plants and some other organisms use sunlight to synthesize foods from carbon dioxide and water.',
      numQuestions: 3,
      difficulty: 'easy',
      questionType: 'multiple_choice',
    };

    const result = await generateQuiz(sample as any);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    // Return detailed error for debugging in dev
    return NextResponse.json({ ok: false, message: String(err?.message || err), stack: err?.stack }, { status: 500 });
  }
}
