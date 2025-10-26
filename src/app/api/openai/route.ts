import { NextResponse } from 'next/server';
import { callOpenAI } from '@/ai/openai';

export async function GET() {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
    const res = await callOpenAI(model, 'Return JSON: { "ok": true }');

    try {
      const parsed = JSON.parse(res);
      return NextResponse.json({ status: 'ok', parsed });
    } catch {
      return NextResponse.json({ status: 'ok', raw: res });
    }
  } catch (err: any) {
    return NextResponse.json({
      status: 'error',
      message: String(err?.message || err),
    }, { status: 500 });
  }
}
