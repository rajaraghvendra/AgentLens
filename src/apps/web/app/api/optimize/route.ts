import { NextResponse } from 'next/server';
import { runAgentLensCliJson, sanitizePeriod, sanitizeProvider } from '../../../lib/agentlens-cli';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), '30');
    const provider = sanitizeProvider(searchParams.get('provider'));
    const args = ['optimize', '-p', period, '--format', 'json'];
    if (provider) args.push('--provider', provider);

    return NextResponse.json(await runAgentLensCliJson(args));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };