import { describe, expect, it, vi, beforeEach } from 'vitest';

const runFullMock = vi.fn();
const getExportDataMock = vi.fn();
const getQuickStatsMock = vi.fn();
const runMock = vi.fn();
const buildExportDataMock = vi.fn();
const getBudgetMock = vi.fn();
const setBudgetMock = vi.fn();
const computeHealthScoreMock = vi.fn();
const getAllProvidersMock = vi.fn();

vi.mock('../../src/apps/web/lib/server-core', () => ({
  CoreEngine: {
    runFull: (...args: any[]) => runFullMock(...args),
    getExportData: (...args: any[]) => getExportDataMock(...args),
    getQuickStats: (...args: any[]) => getQuickStatsMock(...args),
    run: (...args: any[]) => runMock(...args),
    buildExportData: (...args: any[]) => buildExportDataMock(...args),
  },
  getBudget: (...args: any[]) => getBudgetMock(...args),
  setBudget: (...args: any[]) => setBudgetMock(...args),
  computeHealthScore: (...args: any[]) => computeHealthScoreMock(...args),
  getAllProviders: (...args: any[]) => getAllProvidersMock(...args),
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
    getAllProvidersMock.mockReturnValue([{ id: 'cursor', name: 'Cursor', available: true, isAvailable: () => true }]);
  });

  it('status route returns status payload', async () => {
    getQuickStatsMock
      .mockResolvedValueOnce({ totalCostUSD: 1.2, totalTokens: 100, sessionsCount: 2 })
      .mockResolvedValueOnce({ totalCostUSD: 4.5, totalTokens: 300, sessionsCount: 5 });
    getBudgetMock.mockResolvedValueOnce({ daily: 10, monthly: 100, currency: 'USD' });
    runMock.mockResolvedValueOnce({ metrics: { byProvider: { cursor: { costUSD: 1.2 } } } });

    const response = await getStatus(new Request('http://localhost/api/status?period=today'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ period: 'today', totalCostUSD: 1.2 });
  });

  it('report route normalizes response shape', async () => {
    runFullMock.mockResolvedValueOnce({
      metrics: {
        byActivity: { Coding: { category: 'Coding', costUSD: 2, percentage: 80, oneShotRate: 50 } },
        byModel: {},
        byProvider: { claude: { provider: 'claude', costUSD: 2, totalTokens: 10, inputTokens: 6, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0, messageCount: 1 } },
      },
      findings: [],
      insights: [],
      providers: [{ id: 'claude' }],
    });
    buildExportDataMock.mockReturnValueOnce({
      byDay: [],
      byProject: [{ name: 'repo-a', cost: 1 }],
    });

    const response = await getReport(new Request('http://localhost/api/report?period=7&provider=claude'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.providers).toHaveLength(1);
    expect(body.activities[0]).toMatchObject({ name: 'Coding' });
  });

  it('optimize route returns 500 on runner failures', async () => {
    runFullMock.mockRejectedValueOnce(new Error('boom'));
    const response = await getOptimize(new Request('http://localhost/api/optimize?period=30'));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: 'boom' });
  });

  it('compare route returns CLI payload', async () => {
    runMock.mockResolvedValueOnce({
      metrics: {
        byModel: {
          'model-a': {
            model: 'model-a',
            costUSD: 2,
            totalTokens: 100,
            inputTokens: 60,
            outputTokens: 40,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            messageCount: 3,
            isEstimated: false,
          },
        },
      },
    });
    const response = await getCompare(new Request('http://localhost/api/compare?period=30'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ models: [{ name: 'model-a' }] });
  });

  it('providers route returns provider list from provider registry', async () => {
    const response = await getProviders();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ providers: [{ id: 'cursor', available: true }] });
  });

  it('settings get/post return parsed payload and mutation status', async () => {
    getBudgetMock.mockResolvedValueOnce({ daily: 10, monthly: 100, currency: 'USD' });
    const getResponse = await getSettings();
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({ daily: 10, monthly: 100, currency: 'USD' });

    setBudgetMock.mockResolvedValueOnce(undefined);
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
