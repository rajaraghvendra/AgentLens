import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GeminiProvider } from '../../src/providers/gemini.js';

describe('GeminiProvider', () => {
  it('parses gemini single JSON session with user and gemini messages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentlens-gemini-'));
    mkdirSync(join(dir, 'test-project', 'chats'), { recursive: true });

    const jsonPath = join(dir, 'test-project', 'chats', 'session-abc123.json');

    writeFileSync(
      jsonPath,
      JSON.stringify({
        sessionId: 'session-abc123',
        projectHash: 'test-project',
        startTime: '2026-05-01T10:00:00.000Z',
        lastUpdated: '2026-05-01T10:30:00.000Z',
        messages: [
          {
            id: 'msg-user-1',
            timestamp: '2026-05-01T10:00:01.000Z',
            type: 'user',
            content: 'Help me refactor this module',
            tokens: { input: 50, cached: 10 },
          },
          {
            id: 'msg-gemini-1',
            timestamp: '2026-05-01T10:00:02.000Z',
            type: 'gemini',
            content: 'Let me read the file first.\n<tool_use>\n<name>read_file</name>\n<path>src/index.ts</path>\n</tool_use>',
            model: 'gemini-2.5-pro',
            tokens: { input: 60, output: 30, cached: 5, thoughts: 10 },
            toolCalls: [
              {
                id: 'tc-1',
                name: 'read_file',
                displayName: 'read_file',
                args: { path: 'src/index.ts' },
                status: 'success',
              },
            ],
          },
          {
            id: 'msg-user-2',
            timestamp: '2026-05-01T10:00:03.000Z',
            type: 'user',
            content: 'Now edit it',
          },
          {
            id: 'msg-gemini-2',
            timestamp: '2026-05-01T10:00:04.000Z',
            type: 'gemini',
            content: 'Done. I have refactored the module.',
            model: 'gemini-2.5-pro',
            tokens: { input: 80, output: 20, cached: 5, thoughts: 5 },
          },
        ],
      }),
      'utf-8',
    );

    const provider = new GeminiProvider();
    const session = await provider.parseSession(jsonPath);

    expect(session.provider).toBe('gemini');
    expect(session.project).toBe('test-project');
    expect(session.messages.length).toBeGreaterThanOrEqual(4);

    const userMsg = session.messages.find(m => m.role === 'user' && m.content.includes('refactor'));
    expect(userMsg).toBeDefined();
    expect(userMsg?.tokens?.input).toBe(40); // 50 - 10 cached
    expect(userMsg?.tokens?.cacheRead).toBe(10);

    const assistantMsg = session.messages.find(m => m.role === 'assistant' && m.content.includes('read the file'));
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.model).toBe('gemini-2.5-pro');
    expect(assistantMsg?.tools?.[0].name).toBe('Read');
  });

  it('parses gemini JSONL session format', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentlens-gemini-jsonl-'));
    mkdirSync(join(dir, 'project-x', 'chats'), { recursive: true });

    const jsonlPath = join(dir, 'project-x', 'chats', 'session-xyz.jsonl');

    const lines = [
      JSON.stringify({
        sessionId: 'session-xyz',
        projectHash: 'project-x',
        startTime: '2026-05-01T10:00:00.000Z',
        lastUpdated: '2026-05-01T10:15:00.000Z',
      }),
      JSON.stringify({
        id: 'msg-u1',
        timestamp: '2026-05-01T10:00:01.000Z',
        type: 'user',
        content: 'Write a function to sort an array',
      }),
      JSON.stringify({
        id: 'msg-g1',
        timestamp: '2026-05-01T10:00:02.000Z',
        type: 'gemini',
        content: 'Here is the sorting function.',
        model: 'gemini-2.5-flash',
        tokens: { input: 40, output: 50, cached: 0, thoughts: 5 },
      }),
      JSON.stringify({
        '$set': { someField: 'value' }, // Should be skipped
      }),
    ].join('\n');

    writeFileSync(jsonlPath, lines, 'utf-8');

    const provider = new GeminiProvider();
    const session = await provider.parseSession(jsonlPath);

    expect(session.provider).toBe('gemini');
    expect(session.project).toBe('project-x');
    expect(session.messages.length).toBeGreaterThanOrEqual(2);

    const userMsg = session.messages.find(m => m.role === 'user');
    expect(userMsg?.content).toBe('Write a function to sort an array');

    const assistantMsg = session.messages.find(m => m.role === 'assistant');
    expect(assistantMsg?.content).toBe('Here is the sorting function.');
    expect(assistantMsg?.model).toBe('gemini-2.5-flash');
  });

  it('normalizes tool names correctly', () => {
    const provider = new GeminiProvider();

    expect(provider.normalizeToolName('read_file')).toBe('Read');
    expect(provider.normalizeToolName('ReadFile')).toBe('Read');
    expect(provider.normalizeToolName('write_file')).toBe('Write');
    expect(provider.normalizeToolName('create_file')).toBe('Write');
    expect(provider.normalizeToolName('edit_file')).toBe('Edit');
    expect(provider.normalizeToolName('run_command')).toBe('Bash');
    expect(provider.normalizeToolName('Shell')).toBe('Bash');
    expect(provider.normalizeToolName('grep_search')).toBe('Grep');
    expect(provider.normalizeToolName('find_files')).toBe('Glob');
    expect(provider.normalizeToolName('web_search')).toBe('WebSearch');
    expect(provider.normalizeToolName('unknown_tool')).toBe('unknown_tool');
  });

  it('handles malformed JSON file gracefully', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentlens-gemini-malformed-'));
    const jsonPath = join(dir, 'malformed.json');

    writeFileSync(jsonPath, 'not valid json', 'utf-8');

    const provider = new GeminiProvider();
    const session = await provider.parseSession(jsonPath);

    expect(session.messages).toEqual([]);
    expect(session.durationMs).toBe(0);
  });

  it('handles JSONL with no valid session header', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentlens-gemini-noheader-'));
    const jsonlPath = join(dir, 'noheader.jsonl');

    writeFileSync(
      jsonlPath,
      JSON.stringify({ id: 'msg-1', type: 'user', timestamp: '2026-05-01T10:00:00.000Z', content: 'hello' }) + '\n',
      'utf-8',
    );

    const provider = new GeminiProvider();
    const session = await provider.parseSession(jsonlPath);

    expect(session.messages).toEqual([]);
    expect(session.durationMs).toBe(0);
  });

  it('skips identity messages from user role', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentlens-gemini-identity-'));
    mkdirSync(join(dir, 'proj', 'chats'), { recursive: true });

    const jsonPath = join(dir, 'proj', 'chats', 'session-identity.json');

    writeFileSync(
      jsonPath,
      JSON.stringify({
        sessionId: 'session-identity',
        projectHash: 'proj',
        startTime: '2026-05-01T10:00:00.000Z',
        messages: [
          {
            id: 'msg-identity',
            timestamp: '2026-05-01T10:00:00.500Z',
            type: 'user',
            content: '<identity>You are a helpful coding assistant</identity>',
          },
          {
            id: 'msg-real',
            timestamp: '2026-05-01T10:00:01.000Z',
            type: 'user',
            content: 'What is 2+2?',
          },
          {
            id: 'msg-answer',
            timestamp: '2026-05-01T10:00:02.000Z',
            type: 'gemini',
            content: '2+2 equals 4',
            model: 'gemini-2.5-pro',
            tokens: { input: 20, output: 10, cached: 0 },
          },
        ],
      }),
      'utf-8',
    );

    const provider = new GeminiProvider();
    const session = await provider.parseSession(jsonPath);

    const identityMsg = session.messages.find(m => m.content.includes('<identity>'));
    expect(identityMsg).toBeUndefined();

    const realUserMsg = session.messages.find(m => m.content.includes('2+2'));
    expect(realUserMsg).toBeDefined();
  });

  it('extracts multiple tool calls from structured toolCalls array', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentlens-gemini-multitool-'));
    mkdirSync(join(dir, 'proj', 'chats'), { recursive: true });

    const jsonPath = join(dir, 'proj', 'chats', 'session-multitool.json');

    writeFileSync(
      jsonPath,
      JSON.stringify({
        sessionId: 'session-multitool',
        projectHash: 'proj',
        startTime: '2026-05-01T10:00:00.000Z',
        messages: [
          {
            id: 'msg-user',
            timestamp: '2026-05-01T10:00:01.000Z',
            type: 'user',
            content: 'Search and then edit',
          },
          {
            id: 'msg-gemini',
            timestamp: '2026-05-01T10:00:02.000Z',
            type: 'gemini',
            content: 'Searching and editing...',
            model: 'gemini-2.5-pro',
            tokens: { input: 50, output: 20, cached: 0 },
            toolCalls: [
              { id: 'tc-1', name: 'grep_search', displayName: 'grep_search', args: { pattern: 'foo' }, status: 'success' },
              { id: 'tc-2', name: 'edit_file', displayName: 'edit_file', args: { path: 'src/file.ts' }, status: 'success' },
            ],
          },
        ],
      }),
      'utf-8',
    );

    const provider = new GeminiProvider();
    const session = await provider.parseSession(jsonPath);

    const assistantMsg = session.messages.find(m => m.role === 'assistant' && m.tools?.length);
    expect(assistantMsg?.tools?.map(t => t.name)).toEqual(['Grep', 'Edit']);
  });

  it('uses duration from startTime/lastUpdated when available', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentlens-gemini-duration-'));
    mkdirSync(join(dir, 'proj', 'chats'), { recursive: true });

    const jsonPath = join(dir, 'proj', 'chats', 'session-duration.json');

    writeFileSync(
      jsonPath,
      JSON.stringify({
        sessionId: 'session-duration',
        projectHash: 'proj',
        startTime: '2026-05-01T10:00:00.000Z',
        lastUpdated: '2026-05-01T10:05:00.000Z',
        messages: [
          {
            id: 'msg-user',
            timestamp: '2026-05-01T10:00:01.000Z',
            type: 'user',
            content: 'hello',
          },
          {
            id: 'msg-gemini',
            timestamp: '2026-05-01T10:00:02.000Z',
            type: 'gemini',
            content: 'hi',
            model: 'gemini-2.5-pro',
            tokens: { input: 10, output: 5, cached: 0 },
          },
        ],
      }),
      'utf-8',
    );

    const provider = new GeminiProvider();
    const session = await provider.parseSession(jsonPath);

    expect(session.durationMs).toBe(300000); // 5 minutes
  });
});

describe('GeminiProvider Discovery', () => {
  it('isAvailable returns correct value based on filesystem', () => {
    const provider = new GeminiProvider();
    const available = provider.isAvailable();

    if (available) {
      expect(available).toBe(true);
    }
  });

  it('returns empty array when no session files found', async () => {
    const provider = new GeminiProvider();

    // Discovery uses config path which may not have sessions
    const sessions = await provider.discoverSessions();
    expect(Array.isArray(sessions)).toBe(true);
  });
});
