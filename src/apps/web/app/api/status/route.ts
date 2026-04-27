import { NextResponse } from 'next/server';
import { CoreEngine, getBudget, getAllProviders } from '../../../lib/server-core';
import { sanitizePeriod, parsePeriod } from '../../../lib/query-params';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), 'today');
    const periodDays = parsePeriod(period);
    const fullReparse = searchParams.get('fullReparse') === '1';

    const [today, rangeStats, budget, detailedToday] = await Promise.all([
      CoreEngine.getQuickStats(1, { fullReparse }),
      CoreEngine.getQuickStats(periodDays, { fullReparse }),
      getBudget(),
      CoreEngine.runFull(1, 'USD', { fullReparse }),
    ]);

    const dailyBudget = budget?.daily || 0;
    const isBudgetExceeded = dailyBudget > 0 && today.totalCostUSD >= dailyBudget;
    const budgetUtilization = dailyBudget > 0 ? (today.totalCostUSD / dailyBudget) * 100 : 0;

    return NextResponse.json({
      period,
      totalCostLocal: today.totalCostUSD,
      totalCostUSD: today.totalCostUSD,
      currencySymbol: '$',
      totalTokens: today.totalTokens,
      budgetCapLocal: budget?.daily || null,
      budgetCapUSD: budget?.daily || null,
      isBudgetExceeded,
      budgetUtilizationPercentage: budgetUtilization,
      activeProviders: getAllProviders().filter((provider) => provider.isAvailable()).map((provider) => provider.id),
      costsByProvider: Object.fromEntries(
        Object.entries(detailedToday.metrics.byProvider || {}).map(([provider, data]: [string, any]) => [provider, data.costUSD]),
      ),
      activeIssuesCount: detailedToday.events?.length || 0,
      topAlert: detailedToday.events?.[0] || null,
      recommendations: (detailedToday.toolAdvice || []).slice(0, 3).map((item: any) => item.title),
      processing: detailedToday.processing ?? null,
      sessionsToday: today.sessionsCount,
      sessionsInPeriod: rangeStats.sessionsCount,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };
