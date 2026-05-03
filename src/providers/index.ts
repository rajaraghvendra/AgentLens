// ─────────────────────────────────────────────────────────────
// AgentLens – Provider Registry & Factory
// ─────────────────────────────────────────────────────────────

import type { IProvider } from './base.js';
import { ClaudeProvider } from './claude.js';
import { CursorProvider } from './cursor.js';
import { CodexProvider } from './codex.js';
import { OpencodeProvider } from './opencode.js';
import { PiProvider, OmpProvider } from './pi.js';
import { CopilotProvider } from './copilot.js';
import { KiroProvider } from './kiro.js';
import { KiroVSCodeProvider } from './kiro-vscode.js';
import { GeminiProvider } from './gemini.js';
import type { Session, DateRange } from '../types/index.js';
import { deduplicateSessions } from '../core/parser/dedup.js';
import { loadSessionsIncrementally, type ProcessingOptions } from '../core/processing/index.js';

export type ProviderFilter = 'all' | 'claude' | 'codex' | 'cursor' | 'opencode' | 'pi' | 'omp' | 'copilot' | 'kiro' | 'kiro-vscode' | 'gemini';

/**
 * Instantiate and return all supported providers.
 */
export function getAllProviders(): IProvider[] {
  return [
    new ClaudeProvider(),
    new CursorProvider(),
    new CodexProvider(),
    new OpencodeProvider(),
    new PiProvider(),
    new OmpProvider(),
    new CopilotProvider(),
    new KiroProvider(),
    new KiroVSCodeProvider(),
    new GeminiProvider(),
  ];
}

/**
 * Return only providers whose storage directories currently
 * exist on the local machine and are readable.
 */
export function getAvailableProviders(filter?: ProviderFilter): IProvider[] {
  const providers = getAllProviders();
  if (!filter || filter === 'all') {
    return providers.filter(p => p.isAvailable());
  }
  const specific = providers.find(p => p.id === filter);
  return specific && specific.isAvailable() ? [specific] : [];
}

/**
 * Discovers and parses sessions across all available providers
 * within the optional date range, deduplicating the results.
 */
export async function getAllSessions(
  dateRange?: DateRange,
  providerFilter?: ProviderFilter,
  processingOptions?: ProcessingOptions,
): Promise<{ sessions: Session[]; processing: Awaited<ReturnType<typeof loadSessionsIncrementally>>['stats'] }> {
  const providers = getAvailableProviders(providerFilter);
  const loaded = await loadSessionsIncrementally(providers, dateRange, processingOptions);
  return {
    sessions: deduplicateSessions(loaded.sessions),
    processing: loaded.stats,
  };
}
