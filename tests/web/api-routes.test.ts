import { describe, expect, it, vi, beforeEach } from 'vitest';

const runAgentLensCliMock = vi.fn();
const runAgentLensCliJsonMock = vi.fn();

vi.mock('../../src/apps/web/lib/agentlens-cli', () => ({
  runAgentLensCli: (...args: any[]) => runAgentLensCliMock(...args),
  runAgentLensCliJson: (...args: any[]) => runAgentLensCliJsonMock(...args),
  sanitizePeriod: (value: string | null, fallback: string) => value ?? fallback,
  sanitizeProvider: (value: string | null) => (value && value !== 'all' ? value : undefined),
}));

import { GET as getStatus } from '../../src/apps/web/app/api/status/route.js';
import { GET as getReport } from '../../src/apps/web/app/api/report/route.js';
import { GET as getOptimize } from '../../src/apps/web/app/api/optimize/route.js';
import { GET as getCompare } from '../../src/apps/web/app/api/compare/route.js';
import { GET as getProviders } from '../../src/apps/web/app/api/providers/route.js';
import { GET as getSettings, POST as postSettings } from '../../src/apps/web/app/api/settings/route.js';

describe('web api routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('status route returns CLI JSON payload', async () => {
    runAgentLensCliJsonMock.mockResolvedValueOnce({ period: 'today', totalCostUSD: 1.2 });
    const response = await getStatus(new Request('http://localhost/api/status?period=today'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ period: 'today', totalCostUSD: 1.2 });
  });

  it('report route normalizes response shape', async () => {
    runAgentLensCliJsonMock.mockResolvedValueOnce({
      metrics: { byActivity: { Coding: { category: 'Coding', costUSD: 2, percentage: 80, oneShotRate: 50 } }, byModel: {} },
      findings: [],
      insights: [],
      providers: [{ id: 'claude' }],
      daily: [],
      projects: [{ name: 'repo-a', cost: 1 }],
    });

    const response = await getReport(new Request('http://localhost/api/report?period=7&provider=claude'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.providers).toHaveLength(1);
    expect(body.activities[0]).toMatchObject({ name: 'Coding' });
  });

  it('optimize route returns 500 on runner failures', async () => {
    runAgentLensCliJsonMock.mockRejectedValueOnce(new Error('boom'));
    const response = await getOptimize(new Request('http://localhost/api/optimize?period=30'));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: 'boom' });
  });

  it('compare route returns CLI payload', async () => {
    runAgentLensCliJsonMock.mockResolvedValueOnce({ models: [{ name: 'model-a' }] });
    const response = await getCompare(new Request('http://localhost/api/compare?period=30'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ models: [{ name: 'model-a' }] });
  });

  it('providers route returns provider list from report payload', async () => {
    runAgentLensCliJsonMock.mockResolvedValueOnce({ providers: [{ id: 'cursor', available: true }] });
    const response = await getProviders();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ providers: [{ id: 'cursor', available: true }] });
  });

  it('settings get/post return parsed payload and mutation status', async () => {
    runAgentLensCliJsonMock.mockResolvedValueOnce({ daily: 10, monthly: 100, currency: 'USD' });
    const getResponse = await getSettings();
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({ daily: 10, monthly: 100, currency: 'USD' });

    runAgentLensCliMock.mockResolvedValueOnce('Budget updated');
    const postResponse = await postSettings(
      new Request('http://localhost/api/settings', {
        method: 'POST',
        body: JSON.stringify({ daily: 20, monthly: 200, currency: 'USD' }),
      }),
    );
    expect(postResponse.status).toBe(200);
    await expect(postResponse.json()).resolves.toMatchObject({ success: true });
  });
});
