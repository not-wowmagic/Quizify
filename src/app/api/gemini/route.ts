import { NextResponse } from 'next/server';
import { callGemini } from '@/ai/gemini';

export async function GET() {
  try {
    const res = await callGemini('Return JSON: { "ok": true }', { jsonMode: true });

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
