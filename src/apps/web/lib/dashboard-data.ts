import { CoreEngine } from './server-core';
import type { ProviderFilter } from '../../../providers/index.js';

const RESPONSE_VERSION = 1;
const RESPONSE_CACHE_TTL_MS = 10_000;
const RESPONSE_CACHE_MAX_ENTRIES = 32;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type ProviderSummary = {
  id: string;
  name: string;
  available: boolean;
  sessionCount?: number;
};

type OverviewMetrics = {
  totalCostLocal?: number;
  localCurrency?: string;
  sessionsCount?: number;
  totalTokens?: number;
  avgCostPerSession?: number;
  cacheHitRate?: number;
};

export type DashboardOverviewResponse = {
  responseVersion: number;
  generatedAt: string;
  periodDays: number;
  provider: string;
  metrics: {
    overview: OverviewMetrics;
  };
  providers: ProviderSummary[];
  activeProviderCount: number;
  topEvent: {
    id: string;
    title: string;
    severity: string;
    description: string;
    recommendedAction?: string;
  } | null;
  topRecommendation: {
    title: string;
    priority: string;
    description: string;
    suggestedAction: string;
  } | null;
  processing: {
    filesScanned?: number;
    filesReparsed?: number;
    cachedFilesReused?: number;
    sessionsLoadedFromCache?: number;
  } | null;
  providerCosts: Record<string, number>;
};

export type DashboardReportResponse = {
  responseVersion: number;
  generatedAt: string;
  metrics: any;
  findings: any[];
  insights: string[];
  events: any[];
  digests: any[];
  toolAdvice: any[];
  processing: DashboardOverviewResponse['processing'];
  providers: ProviderSummary[];
  daily: Array<{ date: string; costUSD: number; sessions: number; tokens: number }>;
  projects: Array<{ name: string; cost: number; sessions: number }>;
  activities: Array<{ name: string; cost: number; percentage: number; oneShotRate: number }>;
  models: Array<{
    id: string;
    name: string;
    costUSD: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  providerBreakdown: any[];
  toolBreakdown: any[];
  mcpBreakdown: any[];
  commandPatterns: any[];
};

const responseCache = new Map<string, CacheEntry<unknown>>();

function pruneResponseCache(now: number): void {
  for (const [key, entry] of responseCache.entries()) {
    if (entry.expiresAt <= now) {
      responseCache.delete(key);
    }
  }

  while (responseCache.size > RESPONSE_CACHE_MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (!oldestKey) break;
    responseCache.delete(oldestKey);
  }
}

function createCacheKey(kind: string, periodDays: number, provider: ProviderFilter | undefined, fullReparse: boolean): string {
  return `${kind}:${periodDays}:${provider ?? 'all'}:${fullReparse ? 'full' : 'incremental'}`;
}

async function withResponseCache<T>(
  kind: string,
  periodDays: number,
  provider: ProviderFilter | undefined,
  fullReparse: boolean,
  loader: () => Promise<T>,
): Promise<T> {
  if (fullReparse) {
    return loader();
  }

  const key = createCacheKey(kind, periodDays, provider, fullReparse);
  const now = Date.now();
  pruneResponseCache(now);
  const cached = responseCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await loader();
  responseCache.set(key, {
    expiresAt: now + RESPONSE_CACHE_TTL_MS,
    value,
  });
  return value;
}

function buildFilters(provider: ProviderFilter | undefined, fullReparse: boolean) {
  return provider ? { provider, fullReparse } : { fullReparse };
}

export async function getDashboardOverview(
  periodDays: number,
  provider: ProviderFilter | undefined,
  fullReparse = false,
): Promise<DashboardOverviewResponse> {
  return withResponseCache('overview', periodDays, provider, fullReparse, async () => {
    const result = await CoreEngine.runFull(periodDays, 'USD', buildFilters(provider, fullReparse));
    const providerCosts = Object.fromEntries(
      Object.entries(result.metrics.byProvider || {}).map(([providerId, data]: [string, any]) => [providerId, Number(data.costUSD || 0)]),
    );

    return {
      responseVersion: RESPONSE_VERSION,
      generatedAt: new Date().toISOString(),
      periodDays,
      provider: provider ?? 'all',
      metrics: {
        overview: result.metrics.overview,
      },
      providers: result.providers,
      activeProviderCount: result.providers.filter((providerItem) => providerItem.available).length,
      topEvent: result.events?.[0] ?? null,
      topRecommendation: result.toolAdvice?.[0] ?? null,
      processing: result.processing ?? null,
      providerCosts,
    };
  });
}

export async function getDashboardReport(
  periodDays: number,
  provider: ProviderFilter | undefined,
  fullReparse = false,
): Promise<DashboardReportResponse> {
  return withResponseCache('report', periodDays, provider, fullReparse, async () => {
    const result = await CoreEngine.runFull(periodDays, 'USD', buildFilters(provider, fullReparse));
    const exportData = CoreEngine.buildExportData(result.sessions, result.metrics, periodDays);
    const { metrics, findings, insights, providers } = result;

    return {
      responseVersion: RESPONSE_VERSION,
      generatedAt: new Date().toISOString(),
      metrics,
      findings,
      insights,
      events: result.events ?? [],
      digests: result.digests ?? [],
      toolAdvice: result.toolAdvice ?? [],
      processing: result.processing ?? null,
      providers,
      daily: exportData.byDay ?? [],
      projects: (exportData.byProject ?? []).filter((project: any) => project.name != null),
      activities: Object.values(metrics?.byActivity || {}).map((activity: any) => ({
        name: activity.category,
        cost: activity.costUSD,
        percentage: activity.percentage,
        oneShotRate: activity.oneShotRate,
      })),
      models: Object.values(metrics?.byModel || {}).map((model: any) => ({
        id: model.model,
        name: model.model,
        costUSD: model.costUSD,
        totalTokens: model.totalTokens,
        inputTokens: model.inputTokens,
        outputTokens: model.outputTokens,
      })),
      providerBreakdown: Object.values(metrics?.byProvider || {}),
      toolBreakdown: Object.values(metrics?.byTool || {}),
      mcpBreakdown: Object.values(metrics?.byMcpServer || {}),
      commandPatterns: Object.values(metrics?.byCommandPattern || {}),
    };
  });
}
