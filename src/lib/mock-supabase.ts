// src/lib/mock-supabase.ts
// In-memory Supabase stand-in used ONLY by the Playwright e2e suite
// (E2E_MOCK_AI=1). It is test-support infrastructure, not production code:
// the builder surface deliberately mirrors the handful of queries actions.ts
// makes against quiz_attempts / quizzes so history + sharing work hermetically
// without a real database or network access.
//
import { randomBytes } from 'node:crypto';

/** Concrete cell values accepted by the in-memory store. */
type MockValue = string | number | boolean | null | readonly MockValue[] | MockObject;

interface MockObject {
  [column: string]: MockValue;
}

interface MockRow extends MockObject {
  id: string;
  created_at: string;
}

interface MockResult {
  data: MockObject | MockObject[] | null;
  error: null;
}

class MockTable {
  rows: MockRow[] = [];

  insert(values: MockObject): MockRow {
    const row: MockRow = {
      ...values,
      id: randomBytes(6).toString('hex'),
      created_at: new Date().toISOString(),
    };
    this.rows.push(row);
    return row;
  }
}

const mockTables = new Map<string, MockTable>();

function mockQuery(tableName: string, ...filters: Array<[string, MockValue]>) {
  const table = mockTables.get(tableName) ?? new MockTable();
  mockTables.set(tableName, table);
  return table.rows.filter(row => filters.every(([col, val]) => row[col] === val));
}

/** Minimal chainable builder covering the queries actions.ts actually makes. */
export function createMockSupabase() {
  const pick = (row: MockRow | undefined, columns?: string): MockObject | null => {
    if (!row) return null;
    if (!columns || columns === '*') return row;
    const out: MockObject = {};
    for (const c of columns.split(',').map(c => c.trim())) {
      if (c in row) out[c] = row[c];
    }
    return out;
  };

  return {
    from(tableName: string) {
      const filters: Array<[string, MockValue]> = [];
      let selected = '*';
      let limitN: number | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let insertData: MockObject | null = null;
      let isDelete = false;

      const builder = {
        insert(values: MockObject) {
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
        eq(col: string, val: MockValue) {
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
        // oxlint-disable-next-line unicorn/no-thenable -- mirrors Supabase's awaitable query builder
        async then(resolve: (value: MockResult) => void) {
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
            const keep = (r: MockRow) => !filters.every(([col, val]) => r[col] === val);
            table.rows = table.rows.filter(keep);
            resolve({ data: null, error: null });
            return;
          }
          const rows = mockQuery(tableName, ...filters);
          if (orderCol) {
            const col = orderCol;
            rows.sort((a, b) => {
              const cmp = String(a[col]).localeCompare(String(b[col]), undefined, { numeric: true });
              return orderAsc ? cmp : -cmp;
            });
          }
          const sliced = limitN !== null ? rows.slice(0, limitN) : rows;
          resolve({ data: sliced.map(r => pick(r, selected) ?? {}), error: null });
        },
      };
      return builder;
    },
  };
}
