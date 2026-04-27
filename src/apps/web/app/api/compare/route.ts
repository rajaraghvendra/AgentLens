import { NextResponse } from 'next/server';
import { CoreEngine } from '../../../lib/server-core';
import { sanitizePeriod, sanitizeProvider, parsePeriod } from '../../../lib/query-params';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), '30');
    const provider = sanitizeProvider(searchParams.get('provider'));
    const fullReparse = searchParams.get('fullReparse') === '1';
    const filters = provider ? { provider, fullReparse } : { fullReparse };
    const { metrics } = await CoreEngine.run(parsePeriod(period), 'USD', filters);
    const models = Object.values(metrics.byModel)
      .sort((a, b) => b.costUSD - a.costUSD)
      .map((m) => ({
        name: m.model,
        costUSD: m.costUSD,
        totalTokens: m.totalTokens,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheHitTokens: m.cacheReadTokens,
        cacheWriteTokens: m.cacheWriteTokens,
        messageCount: m.messageCount,
        isEstimated: m.isEstimated,
      }));

    return NextResponse.json({
      models,
      totalCostUSD: models.reduce((sum, model) => sum + model.costUSD, 0),
      period: parsePeriod(period),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };
