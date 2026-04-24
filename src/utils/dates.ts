// ─────────────────────────────────────────────────────────────
// AgentLens – Date Windowing Utilities
// ─────────────────────────────────────────────────────────────

import type { DateRange } from '../types/index.js';

/**
 * Build a DateRange ending at "now" and spanning `days` days back.
 */
export function getDateRange(days: number): DateRange {
  const now = Date.now();
  return {
    from: now - days * 24 * 60 * 60 * 1000,
    to: now,
  };
}

/**
 * Check whether a Unix-epoch timestamp (ms) falls within the
 * last `days` days from now.
 */
export function isWithinWindow(timestamp: number, days: number): boolean {
  const range = getDateRange(days);
  return timestamp >= range.from && timestamp <= range.to;
}

/**
 * Check whether a Unix-epoch timestamp (ms) falls within a
 * specific DateRange.
 */
export function isWithinRange(timestamp: number, range: DateRange): boolean {
  return timestamp >= range.from && timestamp <= range.to;
}

/**
 * Format a Unix-epoch timestamp as a human-readable local string.
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Get a human-readable relative time string (e.g. "2 hours ago").
 */
export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}
