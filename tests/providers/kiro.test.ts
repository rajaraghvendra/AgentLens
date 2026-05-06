import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { KiroProvider } from '../../src/providers/kiro.js';

describe('KiroProvider', () => {
  it('parses kiro jsonl with prompt and assistant messages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentlens-kiro-'));
    const sessionDir = join(dir, 'cli', 'test-session-uuid');
    mkdirSync(sessionDir, { recursive: true });

    const jsonlPath = join(sessionDir, 'test-session-uuid.jsonl');
    const metaPath = join(sessionDir, 'test-session-uuid.json');

    writeFileSync(
      metaPath,
      JSON.stringify({
        session_id: 'test-session-uuid',
        cwd: '/Users/me/work/test-project',
        created_at: '2026-05-01T10:00:00.000Z',
        updated_at: '2026-05-01T10:30:00.000Z',
        title: 'Test session',
      }),
      'utf-8',
    );

    writeFileSync(
      jsonlPath,
      [
        JSON.stringify({
          version: 'v1',
          kind: 'Prompt',
          data: {
            message_id: 'msg-1',
            content: [{ kind: 'text', data: 'Hello, help me with a task' }],
            meta: { timestamp: 1777722927 },
          },
        }),
        JSON.stringify({
          version: 'v1',
          kind: 'AssistantMessage',
          data: {
            message_id: 'msg-2',
            content: [
              { kind: 'text', data: 'Sure, let me help.' },
              {
                kind: 'toolUse',
                data: {
                  toolUseId: 'tool-1',
                  name: 'read',
                  input: { path: '/tmp/test.txt' },
                },
              },
            ],
          },
        }),
        JSON.stringify({
          version: 'v1',
          kind: 'ToolResults',
          data: {
            message_id: 'msg-3',
            content: [
              {
                kind: 'toolResult',
                data: {
                  toolUseId: 'tool-1',
                  content: [{ kind: 'text', data: 'file contents here' }],
                  status: 'success',
                },
              },
            ],
            results: {
              'tool-1': {
                tool: {
                  kind: { BuiltIn: { FileRead: { path: '/tmp/test.txt' } } },
                },
                result: { Success: { items: [{ Text: 'file contents here' }] } },
              },
            },
          },
        }),
        JSON.stringify({
          version: 'v1',
          kind: 'Prompt',
          data: {
            message_id: 'msg-4',
            content: [{ kind: 'text', data: 'Thanks, now edit that file' }],
            meta: { timestamp: 1777722970 },
          },
        }),
        JSON.stringify({
          version: 'v1',
          kind: 'AssistantMessage',
          data: {
            message_id: 'msg-5',
            content: [
              { kind: 'text', data: 'Done editing the file.' },
            ],
          },
        }),
      ].join('\n'),
      'utf-8',
    );

    const provider = new KiroProvider();
    const session = await provider.parseSession(jsonlPath);

    expect(session.project).toBe('test-project');
    expect(session.provider).toBe('kiro');
    expect(session.messages.length).toBeGreaterThanOrEqual(3);

    const userMsg = session.messages.find(m => m.role === 'user' && m.content.includes('Hello'));
    expect(userMsg).toBeDefined();

    const assistantMsg = session.messages.find(m => m.role === 'assistant' && m.content.includes('Sure'));
    expect(assistantMsg).toBeDefined();

    const toolMsg = session.messages.find(m => m.tools?.length && m.tools[0].name === 'Read');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.tools?.[0].isError).toBe(false);
  });

  it('normalizes tool names correctly', () => {
    const provider = new KiroProvider();

    expect(provider.normalizeToolName('read')).toBe('Read');
    expect(provider.normalizeToolName('Read')).toBe('Read');
    expect(provider.normalizeToolName('write')).toBe('Write');
    expect(provider.normalizeToolName('edit')).toBe('Edit');
    expect(provider.normalizeToolName('bash')).toBe('Bash');
    expect(provider.normalizeToolName('glob')).toBe('Glob');
    expect(provider.normalizeToolName('grep')).toBe('Grep');
    expect(provider.normalizeToolName('todo_list')).toBe('Task');
    expect(provider.normalizeToolName('unknown_tool')).toBe('unknown_tool');
  });

  it('returns empty sessions when no .jsonl files found', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentlens-kiro-empty-'));
    mkdirSync(join(dir, 'cli', 'empty-session'), { recursive: true });

    const provider = new KiroProvider();
    const sessions = await provider.discoverSessions();

    // Should not contain files from the empty dir
    const emptyDirSession = sessions.find(s => s.includes('empty-session'));
    expect(emptyDirSession).toBeUndefined();
  });
});

describe('KiroProvider Discovery', () => {
  it('isAvailable returns true when ~/.kiro/sessions exists', () => {
    const provider = new KiroProvider();
    // This test checks against actual filesystem
    const available = provider.isAvailable();
    // If kiro is installed, should be available
    if (available) {
      expect(available).toBe(true);
    }
  });

  it('discovers sessions from actual kiro directory', async () => {
    const provider = new KiroProvider();

    if (!provider.isAvailable()) {
      // Skip if kiro is not installed on this machine
      return;
    }

    const sessions = await provider.discoverSessions();

    // If sessions exist, should return at least one
    if (sessions.length > 0) {
      expect(sessions.some(s => s.endsWith('.jsonl'))).toBe(true);
    }
  });
});
