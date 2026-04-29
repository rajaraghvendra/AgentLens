import { describe, expect, it } from 'vitest';
import { CoreEngine, computeMetrics, PricingEngine } from '../../src/core-engine/index.js';
import { getAllProviders, getAllSessions } from '../../src/providers/public.js';
import { clearProcessingIndex, config, getBudget, loadSessionsIncrementally, notify } from '../../src/local-runtime/index.js';
import type { Session, TeamSyncBatch } from '../../src/core-types/index.js';

describe('public core boundaries', () => {
  it('exposes shared engine and runtime entrypoints', () => {
    expect(CoreEngine).toBeDefined();
    expect(computeMetrics).toBeTypeOf('function');
    expect(PricingEngine).toBeDefined();
    expect(getAllProviders).toBeTypeOf('function');
    expect(getAllSessions).toBeTypeOf('function');
    expect(loadSessionsIncrementally).toBeTypeOf('function');
    expect(clearProcessingIndex).toBeTypeOf('function');
    expect(getBudget).toBeTypeOf('function');
    expect(notify).toBeTypeOf('function');
    expect(config.cacheDir).toBeTruthy();
  });

  it('exposes future-safe team sync dto types', () => {
    const sampleSession: Session = {
      id: 'session-1',
      provider: 'claude',
      project: 'demo-project',
      timestamp: 1,
      messages: [],
    };

    const syncBatch: TeamSyncBatch = {
      version: 1,
      generatedAt: 1,
      window: { from: 1, to: 2 },
      identity: {
        orgId: 'org-1',
        teamId: 'team-1',
        userId: 'user-1',
        machineId: 'machine-1',
        userName: 'Demo User',
        userEmail: 'demo@example.com',
      },
      records: [
        {
          date: '2026-04-29',
          project: sampleSession.project,
          provider: sampleSession.provider,
          model: 'claude-sonnet',
          toolName: 'Read',
          recommendationKinds: ['right-size-model'],
          totals: {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 25,
            cacheWriteTokens: 10,
            totalTokens: 185,
            totalCostUSD: 0.12,
            sessions: 1,
            messages: 4,
            cacheHitRate: 20,
            retryRate: 0,
            oneShotRate: 100,
            alertCount: 0,
            suggestedSavingsUSD: 0.03,
          },
        },
      ],
    };

    expect(syncBatch.records[0].totals.totalCostUSD).toBe(0.12);
    expect(syncBatch.identity.orgId).toBe('org-1');
  });
});
