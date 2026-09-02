import { NextResponse } from 'next/server';
import { createQuiz, type CreateQuizInput } from '@/app/actions';

export const maxDuration = 55;

/** Same-origin endpoint for parallel high-count generation batches. */
export async function POST(request: Request) {
  try {
    // SAFETY: createQuiz performs the canonical strict schema validation before use.
    const input = await request.json() as CreateQuizInput;
    return NextResponse.json(await createQuiz(input));
  } catch (error) {
    console.error('Generate quiz route error:', error);
    return NextResponse.json(
      { error: 'Failed to generate the quiz. Please try again.' },
      { status: 500 },
    );
  }
}
