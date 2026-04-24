// ─────────────────────────────────────────────────────────────
// AgentLens – Provider Plugin Interface (Strategy Pattern)
// ─────────────────────────────────────────────────────────────

import type { Session, DateRange } from '../types/index.js';

/**
 * Every provider must implement this contract.
 * New tools (Pi, Copilot, etc.) can be added by creating a
 * single file that implements IProvider and registering it
 * in `providers/index.ts`.
 */
export interface IProvider {
  /** Short slug used in output: 'claude', 'cursor', 'codex' */
  readonly id: string;
  /** Human-readable name: 'Claude Code', 'Cursor', 'Codex CLI' */
  readonly name: string;

  /**
   * Return true when the provider's data directory / database
   * exists on this machine. Called before any parsing attempt.
   */
  isAvailable(): boolean;

  /**
   * Discover session file paths or identifiers within the
   * optional date range. If no range is given, return all.
   */
  discoverSessions(dateRange?: DateRange): Promise<string[]>;

  /**
   * Parse a single session file/identifier into a normalized
   * Session object.
   */
  parseSession(identifier: string): Promise<Session>;

  /**
   * Map a raw tool name from the provider's log format
   * to a normalized name (e.g. 'exec_command' → 'Bash').
   */
  normalizeToolName(rawName: string): string;
}
