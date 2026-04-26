import { NextResponse } from 'next/server';
import { CoreEngine } from '../../../lib/server-core';
import { sanitizePeriod, sanitizeProvider, parsePeriod } from '../../../lib/query-params';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), '7');
    const provider = sanitizeProvider(searchParams.get('provider'));
    const periodDays = parsePeriod(period);
    const filters = provider ? { provider } : undefined;
    const result = await CoreEngine.runFull(periodDays, 'USD', filters);
    const exportData = CoreEngine.buildExportData(result.sessions, result.metrics, periodDays);
    const { metrics, findings, insights, providers } = result;

    return NextResponse.json({
      metrics,
      findings,
      insights,
      providers,
      daily: exportData.byDay ?? [],
      projects: (exportData.byProject ?? []).filter((p: any) => p.name != null),
      activities: Object.values(metrics?.byActivity || {}).map((a: any) => ({
        name: a.category,
        cost: a.costUSD,
        percentage: a.percentage,
        oneShotRate: a.oneShotRate
      })),
      models: Object.values(metrics?.byModel || {}).map((m: any) => ({
        id: m.model,
        name: m.model,
        costUSD: m.costUSD,
        totalTokens: m.totalTokens,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens
      })),
      providerBreakdown: Object.values(metrics?.byProvider || {}).map((p: any) => ({
        id: p.provider,
        name: p.provider,
        costUSD: p.costUSD,
        totalTokens: p.totalTokens,
        inputTokens: p.inputTokens,
        outputTokens: p.outputTokens,
        cacheReadTokens: p.cacheReadTokens,
        cacheWriteTokens: p.cacheWriteTokens,
        messageCount: p.messageCount,
      }))
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };
