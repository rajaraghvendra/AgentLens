import { NextResponse } from 'next/server';
import { CoreEngine } from '../../../lib/server-core';
import { sanitizePeriod, sanitizeProvider, parsePeriod } from '../../../lib/query-params';
import { analyzeModels, compareModels, getModelSessions } from '../../../lib/server-compare';
import { detectWaste, calculateHealthScore } from '../../../lib/server-waste';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), '30');
    const provider = sanitizeProvider(searchParams.get('provider'));
    const model1 = searchParams.get('model1');
    const model2 = searchParams.get('model2');
    const fullReparse = searchParams.get('fullReparse') === '1';
    
    const filters = provider ? { provider, fullReparse } : { fullReparse };
    const { sessions } = await CoreEngine.run(parsePeriod(period), 'USD', filters);
    
    // Use enhanced compare module
    const rawModels = analyzeModels(sessions);
    const totalCost = rawModels.reduce((sum, m) => sum + m.costUSD, 0);

    // Normalize: ensure each model entry has a `name` field (dashboard reads model.name)
    const models = rawModels.map((m) => ({
      ...m,
      name: m.model || 'unknown',
    }));
    
    const result: any = {
      models,
      totalCostUSD: totalCost,
      period: parsePeriod(period),
    };
    
    // Add model comparison if both models specified
    if (model1 && model2) {
      const comparison = compareModels(sessions, model1, model2);
      if (comparison) {
        result.comparison = {
          modelA: comparison.modelA,
          modelB: comparison.modelB,
          winner: comparison.winner,
        };
      }
    }
    
    // Add waste detection
    const wasteFindings = detectWaste(sessions);
    result.wasteFindings = wasteFindings;
    
    // Add health score
    result.health = calculateHealthScore(wasteFindings);
    
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };
