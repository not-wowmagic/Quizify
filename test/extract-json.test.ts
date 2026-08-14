import { describe, it, expect } from 'vitest';
import { extractJSON } from '@/ai/llm';

describe('extractJSON', () => {
  it('parses a plain JSON object', () => {
    expect(extractJSON('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses a JSON array', () => {
    expect(extractJSON('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('extracts JSON from prose with surrounding text', () => {
    const input = 'Here is your quiz:\n\n```json\n{"questions": [{"q": "What?"}]}\n```\n\nGood luck!';
    expect(extractJSON(input)).toEqual({ questions: [{ q: 'What?' }] });
  });

  it('handles nested braces inside strings', () => {
    const input = '{"text": "a {nested} brace", "n": {"deep": [1, {"x": "}"}]}}';
    expect(extractJSON(input)).toEqual({ text: 'a {nested} brace', n: { deep: [1, { x: '}' }] } });
  });

  it('handles escaped quotes and backslashes', () => {
    const input = '{"msg": "say \\"hi\\" \\\\ now"}';
    expect(extractJSON(input)).toEqual({ msg: 'say "hi" \\ now' });
  });

  it('throws when no JSON structure exists', () => {
    expect(() => extractJSON('no json here at all')).toThrow();
  });

  it('throws on unbalanced structure', () => {
    expect(() => extractJSON('{"a": 1')).toThrow();
  });
});
