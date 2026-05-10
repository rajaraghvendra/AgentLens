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
import { OpenClawProvider } from './openclaw.js';
import { RooCodeProvider } from './roo-code.js';
import { KiloCodeProvider } from './kilocode.js';
import type { Session, DateRange } from '../types/index.js';
import { deduplicateSessions } from '../core/parser/dedup.js';
import { loadSessionsIncrementally, type ProcessingOptions } from '../core/processing/index.js';

export type ProviderFilter =
  | 'all'
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'opencode'
  | 'pi'
  | 'omp'
  | 'copilot'
  | 'kiro'
  | 'kiro-vscode'
  | 'gemini'
  | 'openclaw'
  | 'roo-code'
  | 'kilocode';

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
    new OpenClawProvider(),
    new RooCodeProvider(),
    new KiloCodeProvider(),
  ];
}

export function getAvailableProviders(filter?: ProviderFilter): IProvider[] {
  const providers = getAllProviders();
  if (!filter || filter === 'all') {
    return providers.filter((provider) => provider.isAvailable());
  }
  const specific = providers.find((provider) => provider.id === filter);
  return specific && specific.isAvailable() ? [specific] : [];
}

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
