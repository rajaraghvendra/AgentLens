import { NextResponse } from 'next/server';
import { CoreEngine } from '../../../lib/server-core';
import { sanitizePeriod, sanitizeProvider, parsePeriod } from '../../../lib/query-params';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), '7');
    const provider = sanitizeProvider(searchParams.get('provider'));
    const digestPeriod = searchParams.get('digest') === 'daily' ? 'daily' : 'weekly';
    const fullReparse = searchParams.get('fullReparse') === '1';
    const filters = provider ? { provider, fullReparse } : { fullReparse };
    const result = await CoreEngine.runFull(parsePeriod(period), 'USD', filters);

    return NextResponse.json({
      digest: (result.digests ?? []).find((entry) => entry.period === digestPeriod) ?? null,
      events: result.events ?? [],
      processing: result.processing ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };
