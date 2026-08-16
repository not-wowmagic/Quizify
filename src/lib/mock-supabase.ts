// src/lib/mock-supabase.ts
// In-memory Supabase stand-in used ONLY by the Playwright e2e suite
// (E2E_MOCK_AI=1). It is test-support infrastructure, not production code:
// the builder surface deliberately mirrors the handful of queries actions.ts
// makes against quiz_attempts / quizzes so history + sharing work hermetically
// without a real database or network access.
//
// oxlint-disable -- the loose row/dictionary types are intentional here; the
// mock accepts arbitrary insert shapes by design and is never shipped.
import { randomBytes } from 'node:crypto';

type Row = Record<string, unknown> & { id: string; created_at: string };

class MockTable {
  rows: Row[] = [];

  insert(values: Record<string, unknown>): Row {
    const row: Row = {
      ...values,
      id: randomBytes(6).toString('hex'),
      created_at: new Date().toISOString(),
    };
    this.rows.push(row);
    return row;
  }
}

const mockTables = new Map<string, MockTable>();

function mockQuery(tableName: string, ...filters: Array<[string, unknown]>) {
  const table = mockTables.get(tableName) ?? new MockTable();
  mockTables.set(tableName, table);
  return table.rows.filter(row => filters.every(([col, val]) => row[col] === val));
}

/** Minimal chainable builder covering the queries actions.ts actually makes. */
export function createMockSupabase() {
  const pick = (row: Row, columns?: string): Record<string, unknown> | null => {
    if (!row) return null;
    if (!columns || columns === '*') return row;
    const out: Record<string, unknown> = {};
    for (const c of columns.split(',').map(c => c.trim())) {
      if (c in row) out[c] = row[c];
    }
    return out;
  };

  return {
    from(tableName: string) {
      const filters: Array<[string, unknown]> = [];
      let selected = '*';
      let limitN: number | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let insertData: Record<string, unknown> | null = null;
      let isDelete = false;

      const builder = {
        insert(values: Record<string, unknown>) {
          insertData = values;
          return builder;
        },
        select(columns: string) {
          selected = columns;
          return builder;
        },
        delete() {
          isDelete = true;
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return builder;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          orderCol = col;
          orderAsc = opts?.ascending ?? true;
          return builder;
        },
        limit(n: number) {
          limitN = n;
          return builder;
        },
        async single() {
          if (insertData) {
            const table = mockTables.get(tableName) ?? new MockTable();
            mockTables.set(tableName, table);
            const row = table.insert(insertData);
            return { data: pick(row, selected), error: null };
          }
          const rows = mockQuery(tableName, ...filters);
          return { data: pick(rows[0], selected), error: null };
        },
        async maybeSingle() {
          if (insertData) {
            const table = mockTables.get(tableName) ?? new MockTable();
            mockTables.set(tableName, table);
            const row = table.insert(insertData);
            return { data: pick(row, selected), error: null };
          }
          const rows = mockQuery(tableName, ...filters);
          return { data: pick(rows[0], selected), error: null };
        },
        async then(resolve: (v: unknown) => void) {
          if (insertData) {
            const table = mockTables.get(tableName) ?? new MockTable();
            mockTables.set(tableName, table);
            const row = table.insert(insertData);
            resolve({ data: pick(row, selected), error: null });
            return;
          }
          if (isDelete) {
            const table = mockTables.get(tableName) ?? new MockTable();
            mockTables.set(tableName, table);
            const keep = (r: Row) => !filters.every(([col, val]) => r[col] === val);
            table.rows = table.rows.filter(keep);
            resolve({ data: null, error: null });
            return;
          }
          const rows = mockQuery(tableName, ...filters);
          if (orderCol) {
            rows.sort((a, b) => {
              const av = a[orderCol!] as string | number;
              const bv = b[orderCol!] as string | number;
              const cmp = av < bv ? -1 : av > bv ? 1 : 0;
              return orderAsc ? cmp : -cmp;
            });
          }
          const sliced = limitN !== null ? rows.slice(0, limitN) : rows;
          resolve({ data: sliced.map(r => pick(r, selected)), error: null });
        },
      };
      return builder;
    },
  };
}
