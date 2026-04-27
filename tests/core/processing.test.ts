import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { DateRange, Session } from '../../src/types/index.js';
import type { IProvider } from '../../src/providers/base.js';
import { clearProcessingIndex, loadSessionsIncrementally } from '../../src/core/processing/index.js';

class StubProvider implements IProvider {
  readonly id = 'stub';
  readonly name = 'Stub Provider';
  parseCount = 0;

  constructor(private readonly filePath: string) {}

  isAvailable(): boolean {
    return true;
  }

  async discoverSessions(_dateRange?: DateRange): Promise<string[]> {
    return [this.filePath];
  }

  async parseSession(identifier: string): Promise<Session> {
    this.parseCount += 1;
    return {
      id: identifier,
      provider: this.id,
      project: 'processing-test',
      timestamp: 1,
      messages: [],
    };
  }

  normalizeToolName(rawName: string): string {
    return rawName;
  }
}

describe('incremental processing cache', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentlens-processing-'));
    process.env.AGENTLENS_CACHE_DIR = join(tempDir, 'cache');
    filePath = join(tempDir, 'session.jsonl');
    writeFileSync(filePath, '{"ok":true}\n');
    await clearProcessingIndex();
  });

  afterEach(async () => {
    await clearProcessingIndex();
    delete process.env.AGENTLENS_CACHE_DIR;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reuses cached parsed sessions when files are unchanged', async () => {
    const provider = new StubProvider(filePath);

    const first = await loadSessionsIncrementally([provider]);
    expect(provider.parseCount).toBe(1);
    expect(first.stats.filesReparsed).toBe(1);

    const second = await loadSessionsIncrementally([provider]);
    expect(provider.parseCount).toBe(1);
    expect(second.stats.cachedFilesReused).toBe(1);
    expect(second.stats.sessionsLoadedFromCache).toBe(1);
  });

  it('reparses files when source metadata changes', async () => {
    const provider = new StubProvider(filePath);
    await loadSessionsIncrementally([provider]);
    writeFileSync(filePath, '{"ok":false}\n');

    const second = await loadSessionsIncrementally([provider]);
    expect(provider.parseCount).toBe(2);
    expect(second.stats.filesReparsed).toBe(1);
  });
});
