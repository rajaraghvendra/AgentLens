// ─────────────────────────────────────────────────────────────
// AgentLens – Provider Registry & Factory
// ─────────────────────────────────────────────────────────────

import type { IProvider } from './base.js';
import { ClaudeProvider } from './claude.js';
import { CursorProvider } from './cursor.js';
import { CodexProvider } from './codex.js';
import { OpencodeProvider } from './opencode.js';
import { PiProvider } from './pi.js';
import { CopilotProvider } from './copilot.js';
import type { Session, DateRange } from '../types/index.js';
import { deduplicateSessions } from '../core/parser/dedup.js';

export type ProviderFilter = 'all' | 'claude' | 'codex' | 'cursor' | 'opencode' | 'pi' | 'copilot';

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
    new CopilotProvider(),
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
export async function getAllSessions(dateRange?: DateRange, providerFilter?: ProviderFilter): Promise<Session[]> {
  const providers = getAvailableProviders(providerFilter);
  const sessionPromises: Promise<Session>[] = [];

  for (const provider of providers) {
    const identifiers = await provider.discoverSessions(dateRange);
    
    for (const identifier of identifiers) {
      sessionPromises.push(
        provider.parseSession(identifier).catch(err => {
          if (process.env.AGENTLENS_DEBUG) {
            console.error(`[agentlens] Failed to parse ${identifier}:`, err);
          }
          return null as unknown as Session; // Will be filtered out
        })
      );
    }
  }

  const results = await Promise.all(sessionPromises);
  const validSessions = results.filter(s => s !== null);

  return deduplicateSessions(validSessions);
}
