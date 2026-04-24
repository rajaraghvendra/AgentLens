// ─────────────────────────────────────────────────────────────
// AgentLens – SQLite Adapter (Lazy-loaded)
// ─────────────────────────────────────────────────────────────
// better-sqlite3 requires native compilation and is optional.
// This adapter dynamically imports it so the rest of the
// project works even when it's not installed.

export interface SQLiteDB {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown };
  close(): void;
}

/**
 * Open a SQLite database in readonly mode.
 * Returns null if better-sqlite3 is not installed.
 */
export async function openReadonly(dbPath: string): Promise<SQLiteDB | null> {
  try {
    // @ts-ignore — better-sqlite3 is an optional dependency
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return db as unknown as SQLiteDB;
  } catch (err) {
    if (process.env.AGENTLENS_DEBUG) {
      console.error(`[agentlens] SQLite adapter unavailable: ${(err as Error).message}`);
    }
    return null;
  }
}
