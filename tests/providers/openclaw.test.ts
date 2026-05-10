import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { OpenClawProvider } from '../../src/providers/openclaw.js';

describe('OpenClawProvider', () => {
  it('parses JSONL agent logs with estimated tokens and normalized tools', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agentlens-openclaw-'));
    const logDir = join(root, 'project-alpha');
    mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, 'session.jsonl');

    writeFileSync(
      logPath,
      [
        JSON.stringify({ id: 'u1', timestamp: '2026-05-01T10:00:00.000Z', role: 'user', content: 'Inspect src/index.ts' }),
        JSON.stringify({ id: 'a1', timestamp: '2026-05-01T10:00:01.000Z', role: 'assistant', content: 'I will read it first.', tools: [{ name: 'read_file', input: { path: 'src/index.ts' }, output: 'export const x = 1;' }] }),
      ].join('\n'),
      'utf-8',
    );

    const provider = new OpenClawProvider();
    const session = await provider.parseSession(logPath);

    expect(session.provider).toBe('openclaw');
    expect(session.project).toBe('project-alpha');
    expect(session.messages).toHaveLength(2);
    expect(session.messages[0].tokens?.input).toBeGreaterThan(0);
    expect(session.messages[1].tools?.[0].name).toBe('Read');
  });

  it('discovers logs from the configured agents root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agentlens-openclaw-discover-'));
    const agentsDir = join(root, 'agents');
    const projectDir = join(agentsDir, 'project-beta');
    mkdirSync(projectDir, { recursive: true });
    const logPath = join(projectDir, 'agent.jsonl');
    writeFileSync(logPath, JSON.stringify({ id: 'u1', timestamp: '2026-05-01T10:00:00.000Z', role: 'user', content: 'hello' }) + '\n', 'utf-8');

    process.env.AGENTLENS_OPENCLAW_DIR = agentsDir;
    const provider = new OpenClawProvider();
    const discovered = await provider.discoverSessions();
    expect(discovered).toContain(logPath);
    delete process.env.AGENTLENS_OPENCLAW_DIR;
  });
});
