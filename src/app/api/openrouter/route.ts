import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/ai/openrouter';

export async function GET() {
  try {
    const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
    const res = await callOpenRouter(model, 'Return JSON: { "ok": true }');
    // try to parse response
    try {
      const parsed = JSON.parse(res);
      return NextResponse.json({ status: 'ok', parsed });
    } catch (err) {
      return NextResponse.json({ status: 'ok', raw: res });
    }
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: String(err?.message || err) }, { status: 500 });
  }
}
