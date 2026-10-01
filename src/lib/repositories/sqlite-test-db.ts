// Test helper: wraps Node's built-in SQLite (which includes FTS5) in the same
// interface as a Cloudflare D1 binding, and applies the real migrations. Lets
// the D1 repository run real SQL in unit tests without Wrangler/Miniflare.
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SqlDatabase, SqlStatement, SqlRunResult } from "../bindings";

// Loaded via require so Vite doesn't try to resolve the `node:sqlite` builtin.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type Db = InstanceType<typeof DatabaseSync>;
type Param = null | number | bigint | string | Uint8Array;

function toParam(v: unknown): Param {
  if (v === undefined) throw new Error("D1 does not accept undefined bind values");
  if (typeof v === "boolean") return v ? 1 : 0;
  return v as Param;
}

class Statement implements SqlStatement {
  constructor(private db: Db, private sql: string, private params: Param[] = []) {}
  bind(...values: unknown[]): SqlStatement {
    return new Statement(this.db, this.sql, values.map(toParam));
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })) as T[] };
  }
  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params);
    return row ? ({ ...row } as T) : null;
  }
  async run(): Promise<SqlRunResult> {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(r.changes) } };
  }
  runSync(): SqlRunResult {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(r.changes) } };
  }
}

class TestDatabase implements SqlDatabase {
  constructor(private db: Db) {}
  prepare(query: string): SqlStatement {
    return new Statement(this.db, query);
  }
  async batch(statements: SqlStatement[]): Promise<unknown[]> {
    this.db.exec("BEGIN");
    try {
      const results = statements.map((s) => (s as Statement).runSync());
      this.db.exec("COMMIT");
      return results;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}

const MIGRATIONS_DIR = fileURLToPath(new URL("../../../migrations/", import.meta.url));

/** Fresh in-memory SQLite database with all migrations applied (D1 semantics). */
export function createTestDatabase(): SqlDatabase {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON"); // D1 always enforces foreign keys
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(MIGRATIONS_DIR + file, "utf8"));
  }
  return new TestDatabase(db);
}
