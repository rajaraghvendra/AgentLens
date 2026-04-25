import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { CodexProvider } from '../../src/providers/codex.js';
import { CopilotProvider } from '../../src/providers/copilot.js';
import { CursorProvider } from '../../src/providers/cursor.js';

describe('non-claude providers parsing', () => {
  it('parses codex jsonl while skipping malformed lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentlens-codex-'));
    const file = join(dir, 'rollout-demo.jsonl');
    writeFileSync(
      file,
      [
        '{"type":"session_meta","timestamp":"2026-01-01T00:00:00.000Z","payload":{"cwd":"/tmp/demo"}}',
        'not-json',
        '{"type":"response_item","timestamp":"2026-01-01T00:00:01.000Z","payload":{"id":"a1","type":"message","role":"user","content":[{"type":"text","text":"hello"}],"tokens":{"input":12,"output":0}}}',
        '{"type":"response_item","timestamp":"2026-01-01T00:00:02.000Z","payload":{"id":"a2","type":"message","role":"developer","content":[{"type":"text","text":"done"}],"usage":{"input_tokens":10,"output_tokens":6,"cache_read_tokens":1,"cache_write_tokens":2},"tools":[{"name":"run_command","input":{"command":"ls"}}]}}',
      ].join('\n'),
      'utf-8',
    );

    const provider = new CodexProvider();
    const session = await provider.parseSession(file);
    expect(session.project).toBe('demo');
    expect(session.messages).toHaveLength(2);
    expect(session.messages[1].role).toBe('assistant');
    expect(session.messages[1].tools?.[0].name).toBe('Bash');
  });

  it('parses copilot events and tolerates malformed entries', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agentlens-copilot-'));
    const sessionDir = join(root, 'abc123');
    mkdirSync(sessionDir, { recursive: true });
    const events = join(sessionDir, 'events.jsonl');

    writeFileSync(
      events,
      [
        '{"type":"session.start","timestamp":"2026-01-01T00:00:00.000Z","data":{"sessionId":"s1","context":{"cwd":"/Users/me/work/repo"}}}',
        '{"type":"user.message","timestamp":"2026-01-01T00:00:01.000Z","data":{"content":"add tests"}}',
        '{"type":"assistant.message","timestamp":"2026-01-01T00:00:02.000Z","data":{"content":"","toolRequests":[{"name":"bash","arguments":{"command":"npm test"},"toolCallId":"t1"}]}}',
        '{"type":"tool.execution_complete","timestamp":"2026-01-01T00:00:03.000Z","data":{"toolCallId":"t1","success":false,"result":{"content":"failed"}}}',
        '{bad-json',
      ].join('\n'),
      'utf-8',
    );

    const provider = new CopilotProvider();
    const session = await provider.parseSession(events);
    expect(session.project).toBe('work/repo');
    expect(session.messages.length).toBeGreaterThanOrEqual(2);
    const assistant = session.messages.find(m => m.role === 'assistant' && m.tools?.length);
    expect(assistant?.tools?.[0].name).toBe('Bash');
    expect(assistant?.tools?.[0].isError).toBe(true);
  });

  it('parses cursor records with partial fields', () => {
    const provider = new CursorProvider() as any;
    const parsed = provider.parseCursorData(
      [
        { id: '1', role: 'human', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' },
        { id: '2', role: 'ai', message: 'world', usage: { input_tokens: 3, output_tokens: 4 }, tools: [{ name: 'ReadFile' }] },
        null,
        'bad',
      ],
      'k',
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0].role).toBe('user');
    expect(parsed[1].role).toBe('assistant');
    expect(parsed[1].tools?.[0].name).toBe('Read');
  });
});
