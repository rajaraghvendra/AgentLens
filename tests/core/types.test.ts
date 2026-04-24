// ─────────────────────────────────────────────────────────────
// Tests – Core Types & Utilities
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { mockSession, mockSessionMinimal, mockSessionEmpty, allMockSessions } from '../fixtures/mock-sessions.js';
import type { Session, ActivityCategory } from '../../src/types/index.js';

const ALL_CATEGORIES: ActivityCategory[] = [
  'Coding', 'Debugging', 'Feature Dev', 'Refactoring',
  'Testing', 'Exploration', 'Planning', 'Delegation',
  'Git Ops', 'Build/Deploy', 'Brainstorming', 'Conversation', 'General',
];

describe('Core Types', () => {
  it('should have 13 activity categories', () => {
    expect(ALL_CATEGORIES).toHaveLength(13);
  });

  it('mock session conforms to Session interface', () => {
    const session: Session = mockSession;
    expect(session.id).toBeDefined();
    expect(session.provider).toBe('claude');
    expect(session.project).toBe('my-web-app');
    expect(typeof session.timestamp).toBe('number');
    expect(Array.isArray(session.messages)).toBe(true);
  });

  it('mock session has correct message count', () => {
    expect(mockSession.messages).toHaveLength(8);
  });

  it('messages have required fields', () => {
    for (const msg of mockSession.messages) {
      expect(msg.id).toBeDefined();
      expect(['user', 'assistant', 'system']).toContain(msg.role);
      expect(typeof msg.content).toBe('string');
      expect(typeof msg.timestamp).toBe('number');
    }
  });

  it('assistant messages have token usage', () => {
    const assistantMsgs = mockSession.messages.filter(m => m.role === 'assistant' && m.tokens);
    expect(assistantMsgs.length).toBeGreaterThan(0);

    for (const msg of assistantMsgs) {
      expect(msg.tokens).toBeDefined();
      expect(typeof msg.tokens!.input).toBe('number');
      expect(typeof msg.tokens!.output).toBe('number');
      expect(typeof msg.tokens!.cacheRead).toBe('number');
      expect(typeof msg.tokens!.cacheWrite).toBe('number');
    }
  });

  it('assistant messages have tool usage', () => {
    const toolMsgs = mockSession.messages.filter(m => m.tools && m.tools.length > 0);
    expect(toolMsgs.length).toBeGreaterThan(0);

    for (const msg of toolMsgs) {
      for (const tool of msg.tools!) {
        expect(tool.name).toBeDefined();
        expect(tool.input).toBeDefined();
      }
    }
  });

  it('minimal session has minimal data', () => {
    const session: Session = mockSessionMinimal;
    expect(session.messages).toHaveLength(2);
    expect(session.durationMs).toBeUndefined();
  });

  it('empty session has zero messages', () => {
    const session: Session = mockSessionEmpty;
    expect(session.messages).toHaveLength(0);
  });

  it('allMockSessions contains all test sessions', () => {
    expect(allMockSessions).toHaveLength(3);
  });
});
