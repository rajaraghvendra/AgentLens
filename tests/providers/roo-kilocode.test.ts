import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RooCodeProvider } from '../../src/providers/roo-code.js';
import { KiloCodeProvider } from '../../src/providers/kilocode.js';

describe('RooCodeProvider', () => {
  it('parses cline-family ui_messages.json with api_req_started token usage', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agentlens-roocode-'));
    const taskDir = join(root, 'task-1');
    mkdirSync(taskDir, { recursive: true });
    const filePath = join(taskDir, 'ui_messages.json');

    writeFileSync(
      filePath,
      JSON.stringify([
        { id: 'user-1', type: 'human', text: 'Read and edit src/app.ts', timestamp: '2026-05-01T10:00:00.000Z' },
        { id: 'req-1', type: 'api_req_started', timestamp: '2026-05-01T10:00:01.000Z', model: 'claude-3-5-sonnet', toolName: 'read_file', usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 10, cache_creation_input_tokens: 0 } },
        { id: 'assistant-1', type: 'assistant', text: 'I read the file and can edit it next.', timestamp: '2026-05-01T10:00:02.000Z' }
      ]),
      'utf-8',
    );

    const provider = new RooCodeProvider();
    const session = await provider.parseSession(filePath);

    expect(session.provider).toBe('roo-code');
    expect(session.messages).toHaveLength(2);
    expect(session.messages[1].model).toBe('claude-3-5-sonnet');
    expect(session.messages[1].tokens).toEqual({ input: 120, output: 40, cacheRead: 10, cacheWrite: 0 });
    expect(session.messages[1].tools?.[0].name).toBe('Read');
  });
});

describe('KiloCodeProvider', () => {
  it('parses cline-family ui_messages.json with normalized Bash tool and estimated fallback tokens', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agentlens-kilocode-'));
    const taskDir = join(root, 'task-2');
    mkdirSync(taskDir, { recursive: true });
    const filePath = join(taskDir, 'ui_messages.json');

    writeFileSync(
      filePath,
      JSON.stringify([
        { id: 'user-1', type: 'human', text: 'Run tests', timestamp: '2026-05-01T10:00:00.000Z' },
        { id: 'assistant-1', type: 'assistant', text: 'Running tests now.', timestamp: '2026-05-01T10:00:01.000Z' },
        { id: 'req-1', type: 'api_req_started', timestamp: '2026-05-01T10:00:02.000Z', toolName: 'run_command', model: 'claude-3-5-sonnet' }
      ]),
      'utf-8',
    );

    const provider = new KiloCodeProvider();
    const session = await provider.parseSession(filePath);

    expect(session.provider).toBe('kilocode');
    expect(session.messages).toHaveLength(2);
    expect(session.messages[1].tools?.[0].name).toBe('Bash');
    expect(session.messages[1].tokens?.input).toBeGreaterThan(0);
  });
});
