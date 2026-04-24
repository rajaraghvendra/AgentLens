// ─────────────────────────────────────────────────────────────
// AgentLens – Session Deduplication
// ─────────────────────────────────────────────────────────────

import type { Session, Message } from '../../types/index.js';

/**
 * Remove duplicate sessions by `id` and deduplicate messages
 * within each session by `Message.id`.
 */
export function deduplicateSessions(sessions: Session[]): Session[] {
  const seen = new Map<string, Session>();

  for (const session of sessions) {
    if (seen.has(session.id)) {
      // Merge messages from duplicate sessions (same id, different parse runs)
      const existing = seen.get(session.id)!;
      const mergedMessages = deduplicateMessages([
        ...existing.messages,
        ...session.messages,
      ]);
      seen.set(session.id, { ...existing, messages: mergedMessages });
    } else {
      seen.set(session.id, {
        ...session,
        messages: deduplicateMessages(session.messages),
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Remove duplicate messages by `id`.
 */
export function deduplicateMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();
  const result: Message[] = [];

  for (const msg of messages) {
    if (!seen.has(msg.id)) {
      seen.add(msg.id);
      result.push(msg);
    }
  }

  return result;
}
