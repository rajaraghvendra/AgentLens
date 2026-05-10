// ─────────────────────────────────────────────────────────────
// Tests – Claude Provider & Registry
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClaudeProvider, inferClaudeProjectName } from '../../src/providers/claude.js';
import { getAvailableProviders, getAllProviders } from '../../src/providers/index.js';
import { deduplicateSessions } from '../../src/core/parser/dedup.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/mock-session.jsonl');

const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
const ORIGINAL_CLAUDE_CONFIG_DIRS = process.env.CLAUDE_CONFIG_DIRS;

afterEach(() => {
  if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;

  if (ORIGINAL_CLAUDE_CONFIG_DIRS === undefined) delete process.env.CLAUDE_CONFIG_DIRS;
  else process.env.CLAUDE_CONFIG_DIRS = ORIGINAL_CLAUDE_CONFIG_DIRS;
});

describe('ClaudeProvider', () => {
  it('should instantiate and have correct metadata', () => {
    const provider = new ClaudeProvider();
    expect(provider.id).toBe('claude');
    expect(provider.name).toBe('Claude Code');
  });

  it('should normalize tool names', () => {
    const provider = new ClaudeProvider();
    expect(provider.normalizeToolName('exec_command')).toBe('Bash');
    expect(provider.normalizeToolName('file_edit')).toBe('Edit');
    expect(provider.normalizeToolName('Random')).toBe('Random');
  });

  it('discovers sessions across CLAUDE_CONFIG_DIRS roots and skips missing roots', async () => {
    const rootA = mkdtempSync(path.join(tmpdir(), 'agentlens-claude-root-a-'));
    const rootB = mkdtempSync(path.join(tmpdir(), 'agentlens-claude-root-b-'));
    const missing = path.join(tmpdir(), 'agentlens-claude-missing-root');

    const sessionA = path.join(rootA, 'projects', 'project-a', 'session-a.jsonl');
    const sessionB = path.join(rootB, 'projects', 'project-b', 'session-b.jsonl');

    mkdirSync(path.dirname(sessionA), { recursive: true });
    mkdirSync(path.dirname(sessionB), { recursive: true });
    writeFileSync(sessionA, '{\"type\":\"user\",\"uuid\":\"u1\",\"timestamp\":\"2026-05-01T10:00:00.000Z\",\"text\":\"hello\"}\n', 'utf-8');
    writeFileSync(sessionB, '{\"type\":\"assistant\",\"uuid\":\"a1\",\"timestamp\":\"2026-05-01T10:00:01.000Z\",\"text\":\"world\"}\n', 'utf-8');

    process.env.CLAUDE_CONFIG_DIRS = [rootA, rootB, missing].join(process.platform === 'win32' ? ';' : ':');
    delete process.env.CLAUDE_CONFIG_DIR;

    const provider = new ClaudeProvider();
    const sessions = await provider.discoverSessions();

    expect(sessions).toContain(sessionA);
    expect(sessions).toContain(sessionB);
    expect(sessions).toHaveLength(2);
  });

  it('should parse mock session fixture correctly', async () => {
    const provider = new ClaudeProvider();
    const session = await provider.parseSession(FIXTURE_PATH);

    expect(session.provider).toBe('claude');
    expect(session.project).toBe('fixtures');
    expect(session.messages.length).toBe(11);

    const firstMsg = session.messages[0];
    expect(firstMsg.id).toBe('msg_01_user_001');
    expect(firstMsg.role).toBe('user');
    expect(firstMsg.content).toContain('Fix the login bug');

    const assistantMsg = session.messages.find(m => m.id === 'msg_02_assistant_001')!;
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.model).toBe('claude-sonnet-4-20250514');

    expect(assistantMsg.tokens).toEqual({
      input: 150,
      output: 45,
      cacheRead: 80,
      cacheWrite: 20
    });

    expect(assistantMsg.tools).toBeDefined();
    expect(assistantMsg.tools!.length).toBe(1);
    expect(assistantMsg.tools![0].name).toBe('Read');

    const execToolMsg = session.messages.find(m => m.id === 'msg_05_assistant_003')!;
    const bashTool = execToolMsg.tools!.find(t => t.name === 'Bash');
    expect(bashTool).toBeDefined();
    expect(bashTool!.outputLength).toBe(45);
  });

  it('infers project name for nested Windows subagent session paths', () => {
    const sessionPath = String.raw`C:\Users\alice\.claude\projects\my-project\session-123\subagents\abc.jsonl`;
    expect(inferClaudeProjectName(sessionPath)).toBe('my-project');
  });

  it('infers project name for nested POSIX subagent session paths', () => {
    const sessionPath = '/Users/alice/.claude/projects/my-project/session-123/subagents/abc.jsonl';
    expect(inferClaudeProjectName(sessionPath)).toBe('my-project');
  });
});

describe('Deduplication', () => {
  it('deduplicateSessions removes duplicate IDs and merges messages', () => {
    const s1 = {
      id: 'session-1', provider: 'claude', project: 'test', timestamp: 100,
      messages: [{ id: 'm1', role: 'user' as const, content: 'a', timestamp: 100 }]
    };

    const s2 = {
      id: 'session-1', provider: 'claude', project: 'test', timestamp: 100,
      messages: [{ id: 'm2', role: 'assistant' as const, content: 'b', timestamp: 101 }]
    };

    const s3 = {
      id: 'session-2', provider: 'claude', project: 'test', timestamp: 200,
      messages: [{ id: 'm3', role: 'user' as const, content: 'c', timestamp: 200 }]
    };

    const duplicateMessage = { id: 'm3', role: 'user' as const, content: 'c', timestamp: 200 };
    s3.messages.push(duplicateMessage);

    const merged = deduplicateSessions([s1, s2, s3]);

    expect(merged.length).toBe(2);

    const sess1 = merged.find(s => s.id === 'session-1')!;
    expect(sess1.messages.length).toBe(2);
    expect(sess1.messages.map(m => m.id)).toEqual(['m1', 'm2']);

    const sess2 = merged.find(s => s.id === 'session-2')!;
    expect(sess2.messages.length).toBe(1);
  });
});

describe('Provider Registry', () => {
  it('getAvailableProviders returns only available providers', () => {
    const providers = getAvailableProviders();
    expect(Array.isArray(providers)).toBe(true);
  });

  it('registers public provider ids for gemini, kiro, kiro-vscode, openclaw, roo-code, and kilocode', () => {
    const providerIds = getAllProviders().map((provider) => provider.id);
    expect(providerIds).toEqual(expect.arrayContaining(['gemini', 'kiro', 'kiro-vscode', 'openclaw', 'roo-code', 'kilocode']));
  });
});
