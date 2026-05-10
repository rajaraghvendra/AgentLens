import { NextResponse } from 'next/server';
import { getBudget, setBudget } from '../../../lib/server-core';

const ALLOWED_PROVIDER_KEYS = new Set(['claude', 'opencode', 'codex', 'cursor', 'copilot', 'pi', 'omp', 'kiro', 'kiro-vscode', 'gemini', 'openclaw', 'roo-code', 'kilocode']);

async function GET(): Promise<NextResponse> {
  try {
    const budget = await getBudget();
    return NextResponse.json(budget);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json();
  const { daily, monthly, currency, providers } = body;

  try {
    const providerBudgets: Record<string, number> | undefined =
      providers && typeof providers === 'object'
        ? Object.entries(providers).reduce<Record<string, number>>((acc, [key, value]) => {
            if (ALLOWED_PROVIDER_KEYS.has(key) && typeof value === 'number' && value > 0) {
              acc[key] = value;
            }
            return acc;
          }, {})
        : undefined;

    await setBudget({
      daily: typeof daily === 'number' ? daily : undefined,
      monthly: typeof monthly === 'number' ? monthly : undefined,
      currency: typeof currency === 'string' ? currency : undefined,
      providers: providerBudgets,
    });

    return NextResponse.json({ success: true, message: 'Budget updated' });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

export { GET, POST };
