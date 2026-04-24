// ─────────────────────────────────────────────────────────────
// AgentLens – File Streaming Utilities
// ─────────────────────────────────────────────────────────────
// Uses readline + createReadStream to prevent memory bloat
// on massive JSONL files (100MB+ Claude session logs).

import { createReadStream } from 'fs';
import { createInterface } from 'readline';

/**
 * Stream a JSONL file line-by-line, yielding parsed JSON objects.
 * Corrupt lines are silently skipped (logged to stderr in debug mode).
 *
 * @param filePath - Absolute path to a .jsonl file
 * @yields Parsed JSON object for each valid line
 */
export async function* streamJsonlFile<T = unknown>(filePath: string): AsyncGenerator<T> {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      try {
        yield JSON.parse(trimmed) as T;
      } catch {
        // Skip corrupt/malformed JSON lines —
        // a single bad line should never halt session parsing.
        if (process.env.AGENTLENS_DEBUG) {
          console.error(`[agentlens] Skipping corrupt line in ${filePath}: ${trimmed.slice(0, 80)}...`);
        }
      }
    }
  } finally {
    stream.destroy();
  }
}

/**
 * Collect all objects from a JSONL stream into an array.
 * Convenience wrapper around streamJsonlFile.
 */
export async function readJsonlFile<T = unknown>(filePath: string): Promise<T[]> {
  const items: T[] = [];
  for await (const item of streamJsonlFile<T>(filePath)) {
    items.push(item);
  }
  return items;
}
