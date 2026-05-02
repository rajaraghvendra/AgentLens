// ─────────────────────────────────────────────────────────────
// Tests – Compare Module
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeModels, compareModels, getModelSessions } from '../../src/core/compare.js';
import { PricingEngine } from '../../src/core/pricing/calculator.js';

describe('Model Comparison Engine', () => {
  beforeAll(async () => {
    await PricingEngine.loadPrices();
  });

  const mockSessions = [
    {
      id: 'session-1',
      provider: 'claude',
      project: 'test-project',
      timestamp: 1000,
      messages: [
        {
          id: 'msg-1',
          role: 'user' as const,
          content: 'Implement a login page',
          timestamp: 1000,
        },
        {
          id: 'msg-2',
          role: 'assistant' as const,
          content: 'I will implement the login page',
          timestamp: 1001,
          model: 'claude-sonnet-4-20250514',
          tokens: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 },
          tools: [{ name: 'Write', input: { path: 'login.tsx' } }],
        },
        {
          id: 'msg-3',
          role: 'user' as const,
          content: 'Now add tests',
          timestamp: 1002,
        },
        {
          id: 'msg-4',
          role: 'assistant' as const,
          content: 'Adding tests',
          timestamp: 1003,
          model: 'claude-sonnet-4-20250514',
          tokens: { input: 800, output: 600, cacheRead: 200, cacheWrite: 0 },
          tools: [{ name: 'Write', input: { path: 'login.test.tsx' } }],
        },
      ],
    },
    {
      id: 'session-2',
      provider: 'cursor',
      project: 'test-project',
      timestamp: 2000,
      messages: [
        {
          id: 'msg-5',
          role: 'user' as const,
          content: 'Fix the bug in utils',
          timestamp: 2000,
        },
        {
          id: 'msg-6',
          role: 'assistant' as const,
          content: 'Fixing the bug',
          timestamp: 2001,
          model: 'cursor-small',
          tokens: { input: 500, output: 300, cacheRead: 100, cacheWrite: 0 },
          tools: [{ name: 'Edit', input: { path: 'utils.ts' } }],
        },
      ],
    },
  ];

  it('analyzes models correctly', () => {
    const results = analyzeModels(mockSessions);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].model).toBeDefined();
    // costUSD might be 0 if pricing not found, so check if it's a number
    expect(typeof results[0].costUSD).toBe('number');
    expect(results[0].totalTokens).toBeGreaterThan(0);
    expect(results[0].messageCount).toBeGreaterThan(0);
  });

  it('computes tokens per dollar', () => {
    const results = analyzeModels(mockSessions);
    
    for (const result of results) {
      expect(typeof result.tokensPerDollar).toBe('number');
    }
  });

  it('identifies sample sessions', () => {
    const results = analyzeModels(mockSessions);
    
    for (const result of results) {
      expect(result.sampleSessions).toBeDefined();
      expect(Array.isArray(result.sampleSessions)).toBe(true);
    }
  });

  it('compares two models', () => {
    const result = compareModels(mockSessions, 'claude-sonnet-4-20250514', 'cursor-small');
    
    expect(result).not.toBeNull();
    if (result) {
      expect(result.modelA.model).toBe('claude-sonnet-4-20250514');
      expect(result.modelB.model).toBe('cursor-small');
      expect(result.winner).toBeDefined();
    }
  });

  it('gets model sessions', () => {
    const sessions = getModelSessions(mockSessions, 'claude-sonnet-4-20250514', 10);
    
    // Debug output
    console.log('Sessions found:', sessions.length);
    
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].sessionId).toBeDefined();
    expect(typeof sessions[0].cost).toBe('number');
    expect(sessions[0].messageCount).toBeGreaterThan(0);
  });

  it('returns empty for non-existent model sessions', () => {
    const sessions = getModelSessions(mockSessions, 'non-existent-model', 10);
    expect(sessions.length).toBe(0);
  });

  it('has activity breakdown', () => {
    const results = analyzeModels(mockSessions);
    
    for (const result of results) {
      expect(result.activityBreakdown).toBeDefined();
    }
  });

  it('has cost drift data', () => {
    const results = analyzeModels(mockSessions);
    
    for (const result of results) {
      expect(result.costDrift).toBeDefined();
      expect(Array.isArray(result.costDrift)).toBe(true);
    }
  });
});
