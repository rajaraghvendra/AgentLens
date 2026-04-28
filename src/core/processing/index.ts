import { mkdirSync, existsSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import config from '../../config/env.js';
import type { DateRange, Session, IncrementalRunStats, ProcessingIndexEntry } from '../../types/index.js';
import type { IProvider } from '../../providers/base.js';
import { deduplicateSessions } from '../parser/dedup.js';

type DatabaseHandle = {
  pragma: (sql: string) => void;
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...params: unknown[]) => unknown;
    get: (...params: unknown[]) => any;
    all: (...params: unknown[]) => any[];
  };
  close: () => void;
};

export interface ProcessingOptions {
  forceReparse?: boolean;
}

export interface IncrementalLoadResult {
  sessions: Session[];
  stats: IncrementalRunStats;
}

function getIndexPath(): string {
  return join(process.env.AGENTLENS_CACHE_DIR || config.cacheDir, 'processing', 'agentlens-index.sqlite');
}

function getJsonIndexPath(): string {
  return join(process.env.AGENTLENS_CACHE_DIR || config.cacheDir, 'processing', 'agentlens-index.json');
}

interface JsonCacheState {
  entries: Record<string, {
    provider: string;
    identifier: string;
    size: number;
    mtimeMs: number;
    parseStatus: 'ok' | 'error';
    sessionCount: number;
    lastParsedAt: number;
    error?: string;
    session?: Session;
  }>;
}

function readJsonCacheState(): JsonCacheState {
  mkdirSync(join(process.env.AGENTLENS_CACHE_DIR || config.cacheDir, 'processing'), { recursive: true });
  try {
    if (!existsSync(getJsonIndexPath())) {
      return { entries: {} };
    }
    return JSON.parse(readFileSync(getJsonIndexPath(), 'utf8')) as JsonCacheState;
  } catch {
    return { entries: {} };
  }
}

function writeJsonCacheState(state: JsonCacheState): void {
  mkdirSync(join(process.env.AGENTLENS_CACHE_DIR || config.cacheDir, 'processing'), { recursive: true });
  writeFileSync(getJsonIndexPath(), JSON.stringify(state), 'utf8');
}

async function openWritableDatabase(): Promise<DatabaseHandle | null> {
  try {
    mkdirSync(join(process.env.AGENTLENS_CACHE_DIR || config.cacheDir, 'processing'), { recursive: true });
    // @ts-ignore better-sqlite3 may be unavailable in some environments
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(getIndexPath());
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS processing_index (
        provider TEXT NOT NULL,
        identifier TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        parse_status TEXT NOT NULL,
        session_count INTEGER NOT NULL DEFAULT 0,
        last_parsed_at INTEGER NOT NULL,
        error TEXT,
        PRIMARY KEY (provider, identifier)
      );

      CREATE TABLE IF NOT EXISTS parsed_sessions (
        provider TEXT NOT NULL,
        identifier TEXT NOT NULL,
        session_json TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        PRIMARY KEY (provider, identifier)
      );
    `);
    return db as DatabaseHandle;
  } catch (error) {
    if (process.env.AGENTLENS_DEBUG) {
      console.error('[agentlens] Failed to open processing index:', (error as Error).message);
    }
    return null;
  }
}

function parseIdentifierStats(identifier: string): { size: number; mtimeMs: number } | null {
  try {
    const stats = statSync(identifier);
    return {
      size: stats.size,
      mtimeMs: Math.floor(stats.mtimeMs),
    };
  } catch {
    return null;
  }
}

function createEmptyStats(cacheEnabled: boolean): IncrementalRunStats {
  return {
    filesScanned: 0,
    filesReparsed: 0,
    cachedFilesReused: 0,
    sessionsLoadedFromCache: 0,
    cacheEnabled,
    indexPath: cacheEnabled ? getIndexPath() : undefined,
    forceReparse: false,
  };
}

async function loadWithoutCache(
  providers: IProvider[],
  dateRange?: DateRange,
  options: ProcessingOptions = {},
): Promise<IncrementalLoadResult> {
  const sessions: Session[] = [];
  const stats = createEmptyStats(false);
  stats.forceReparse = options.forceReparse === true;

  for (const provider of providers) {
    const identifiers = await provider.discoverSessions(dateRange);
    stats.filesScanned += identifiers.length;

    for (const identifier of identifiers) {
      const session = await provider.parseSession(identifier);
      sessions.push(session);
      stats.filesReparsed += 1;
    }
  }

  return {
    sessions: deduplicateSessions(sessions),
    stats,
  };
}

async function loadWithJsonCache(
  providers: IProvider[],
  dateRange?: DateRange,
  options: ProcessingOptions = {},
): Promise<IncrementalLoadResult> {
  const state = readJsonCacheState();
  const stats = createEmptyStats(true);
  stats.indexPath = getJsonIndexPath();
  const sessions: Session[] = [];
  const forceReparse = options.forceReparse === true;

  for (const provider of providers) {
    const identifiers = await provider.discoverSessions(dateRange);
    const currentIdentifiers = new Set(identifiers);
    stats.filesScanned += identifiers.length;

    for (const identifier of identifiers) {
      const fileStats = parseIdentifierStats(identifier);
      if (!fileStats) continue;
      stats.sourceLastModifiedAt = Math.max(stats.sourceLastModifiedAt || 0, fileStats.mtimeMs);
      const key = `${provider.id}:${identifier}`;
      const cached = state.entries[key];
      const canReuse = !forceReparse
        && cached
        && cached.parseStatus === 'ok'
        && cached.size === fileStats.size
        && cached.mtimeMs === fileStats.mtimeMs
        && cached.session;

      if (canReuse) {
        sessions.push(cached.session as Session);
        stats.cachedFilesReused += 1;
        stats.sessionsLoadedFromCache += 1;
        stats.lastParsedAt = Math.max(stats.lastParsedAt || 0, cached.lastParsedAt || 0);
        continue;
      }

      try {
        const session = await provider.parseSession(identifier);
        const parsedAt = Date.now();
        state.entries[key] = {
          provider: provider.id,
          identifier,
          size: fileStats.size,
          mtimeMs: fileStats.mtimeMs,
          parseStatus: 'ok',
          sessionCount: 1,
          lastParsedAt: parsedAt,
          session,
        };
        sessions.push(session);
        stats.filesReparsed += 1;
        stats.lastParsedAt = Math.max(stats.lastParsedAt || 0, parsedAt);
      } catch (error) {
        const parsedAt = Date.now();
        state.entries[key] = {
          provider: provider.id,
          identifier,
          size: fileStats.size,
          mtimeMs: fileStats.mtimeMs,
          parseStatus: 'error',
          sessionCount: 0,
          lastParsedAt: parsedAt,
          error: error instanceof Error ? error.message : String(error),
        };
        stats.lastParsedAt = Math.max(stats.lastParsedAt || 0, parsedAt);
      }
    }

    for (const [key, entry] of Object.entries(state.entries)) {
      if (entry.provider !== provider.id) continue;
      if (currentIdentifiers.has(entry.identifier)) continue;
      if (existsSync(entry.identifier)) continue;
      delete state.entries[key];
    }
  }

  writeJsonCacheState(state);
  return {
    sessions: deduplicateSessions(sessions),
    stats,
  };
}

export async function loadSessionsIncrementally(
  providers: IProvider[],
  dateRange?: DateRange,
  options: ProcessingOptions = {},
): Promise<IncrementalLoadResult> {
  const db = await openWritableDatabase();
  if (!db) {
    return loadWithJsonCache(providers, dateRange, options);
  }

  const stats = createEmptyStats(true);
  const sessions: Session[] = [];
  const forceReparse = options.forceReparse === true;
  stats.forceReparse = forceReparse;

  const selectIndex = db.prepare(`
    SELECT provider, identifier, size, mtime_ms as mtimeMs, parse_status as parseStatus,
           session_count as sessionCount, last_parsed_at as lastParsedAt, error
    FROM processing_index
    WHERE provider = ? AND identifier = ?
  `);

  const selectCachedSession = db.prepare(`
    SELECT session_json as sessionJson
    FROM parsed_sessions
    WHERE provider = ? AND identifier = ?
  `);

  const upsertIndex = db.prepare(`
    INSERT INTO processing_index (
      provider, identifier, size, mtime_ms, parse_status, session_count, last_parsed_at, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, identifier) DO UPDATE SET
      size = excluded.size,
      mtime_ms = excluded.mtime_ms,
      parse_status = excluded.parse_status,
      session_count = excluded.session_count,
      last_parsed_at = excluded.last_parsed_at,
      error = excluded.error
  `);

  const upsertCachedSession = db.prepare(`
    INSERT INTO parsed_sessions (
      provider, identifier, session_json, cached_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(provider, identifier) DO UPDATE SET
      session_json = excluded.session_json,
      cached_at = excluded.cached_at
  `);

  const deleteProviderEntry = db.prepare(`
    DELETE FROM processing_index WHERE provider = ? AND identifier = ?
  `);
  const deleteProviderSession = db.prepare(`
    DELETE FROM parsed_sessions WHERE provider = ? AND identifier = ?
  `);
  const listProviderEntries = db.prepare(`
    SELECT identifier FROM processing_index WHERE provider = ?
  `);

  try {
    for (const provider of providers) {
      const identifiers = await provider.discoverSessions(dateRange);
      const currentIdentifiers = new Set(identifiers);
      stats.filesScanned += identifiers.length;

      for (const identifier of identifiers) {
        const fileStats = parseIdentifierStats(identifier);
        if (!fileStats) {
          continue;
        }
        stats.sourceLastModifiedAt = Math.max(stats.sourceLastModifiedAt || 0, fileStats.mtimeMs);

        const cachedIndex = selectIndex.get(provider.id, identifier) as ProcessingIndexEntry | undefined;
        const canReuse = !forceReparse
          && cachedIndex
          && cachedIndex.parseStatus === 'ok'
          && cachedIndex.size === fileStats.size
          && cachedIndex.mtimeMs === fileStats.mtimeMs;

        if (canReuse) {
          const cached = selectCachedSession.get(provider.id, identifier) as { sessionJson?: string } | undefined;
          if (cached?.sessionJson) {
            try {
              sessions.push(JSON.parse(cached.sessionJson) as Session);
              stats.cachedFilesReused += 1;
              stats.sessionsLoadedFromCache += 1;
              stats.lastParsedAt = Math.max(stats.lastParsedAt || 0, cachedIndex.lastParsedAt || 0);
              continue;
            } catch {
              // fall through and reparse
            }
          }
        }

        try {
          const session = await provider.parseSession(identifier);
          const now = Date.now();
          upsertIndex.run(provider.id, identifier, fileStats.size, fileStats.mtimeMs, 'ok', 1, now, null);
          upsertCachedSession.run(provider.id, identifier, JSON.stringify(session), now);
          sessions.push(session);
          stats.filesReparsed += 1;
          stats.lastParsedAt = Math.max(stats.lastParsedAt || 0, now);
        } catch (error) {
          const now = Date.now();
          upsertIndex.run(
            provider.id,
            identifier,
            fileStats.size,
            fileStats.mtimeMs,
            'error',
            0,
            now,
            error instanceof Error ? error.message : String(error),
          );
          stats.lastParsedAt = Math.max(stats.lastParsedAt || 0, now);
        }
      }

      const existingEntries = listProviderEntries.all(provider.id) as Array<{ identifier: string }>;
      for (const entry of existingEntries) {
        if (currentIdentifiers.has(entry.identifier)) continue;
        if (existsSync(entry.identifier)) continue;
        deleteProviderEntry.run(provider.id, entry.identifier);
        deleteProviderSession.run(provider.id, entry.identifier);
      }
    }
  } finally {
    db.close();
  }

  return {
    sessions: deduplicateSessions(sessions),
    stats,
  };
}

export async function getProcessingIndexStatus(): Promise<{
  indexPath: string;
  cacheEnabled: boolean;
  entries: number;
  cachedSessions: number;
  errorEntries: number;
  lastParsedAt?: number;
}> {
  const db = await openWritableDatabase();
  if (!db) {
    const state = readJsonCacheState();
    const rows = Object.values(state.entries);
    return {
      indexPath: getJsonIndexPath(),
      cacheEnabled: true,
      entries: rows.length,
      cachedSessions: rows.filter((row) => row.parseStatus === 'ok' && row.session).length,
      errorEntries: rows.filter((row) => row.parseStatus === 'error').length,
      lastParsedAt: rows.reduce((max, row) => Math.max(max, row.lastParsedAt || 0), 0) || undefined,
    };
  }

  try {
    const entries = db.prepare(`SELECT COUNT(*) as count FROM processing_index`).get() as { count: number };
    const cachedSessions = db.prepare(`SELECT COUNT(*) as count FROM parsed_sessions`).get() as { count: number };
    const errorEntries = db.prepare(`SELECT COUNT(*) as count FROM processing_index WHERE parse_status = 'error'`).get() as { count: number };
    const lastParsed = db.prepare(`SELECT MAX(last_parsed_at) as lastParsedAt FROM processing_index`).get() as { lastParsedAt?: number };

    return {
      indexPath: getIndexPath(),
      cacheEnabled: true,
      entries: entries.count || 0,
      cachedSessions: cachedSessions.count || 0,
      errorEntries: errorEntries.count || 0,
      lastParsedAt: lastParsed.lastParsedAt,
    };
  } finally {
    db.close();
  }
}

export async function clearProcessingIndex(): Promise<void> {
  const db = await openWritableDatabase();
  if (!db) {
    writeJsonCacheState({ entries: {} });
    return;
  }

  try {
    db.exec(`DELETE FROM parsed_sessions; DELETE FROM processing_index;`);
  } finally {
    db.close();
  }
}
