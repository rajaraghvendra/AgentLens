import { NextResponse } from 'next/server';
import { getAllProviders } from '../../../lib/server-core';

async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({
      providers: getAllProviders().map((provider) => ({
        id: provider.id,
        name: provider.name,
        available: provider.isAvailable(),
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, providers: [] }, { status: 500 });
  }
}

export { GET };
