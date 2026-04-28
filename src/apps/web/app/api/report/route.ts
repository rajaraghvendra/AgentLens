import { NextResponse } from 'next/server';
import { getDashboardReport } from '../../../lib/dashboard-data';
import { sanitizePeriod, sanitizeProvider, parsePeriod } from '../../../lib/query-params';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), '7');
    const provider = sanitizeProvider(searchParams.get('provider'));
    const fullReparse = searchParams.get('fullReparse') === '1';
    const forceRefresh = searchParams.get('forceRefresh') === '1';
    const periodDays = parsePeriod(period);
    const result = await getDashboardReport(periodDays, provider, fullReparse, forceRefresh);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };
