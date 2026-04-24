// ─────────────────────────────────────────────────────────────
// AgentLens – Mock Session Data for Unit Tests
// ─────────────────────────────────────────────────────────────

import type { Session, Message } from '../../src/types/index.js';

const now = Date.now();

const debugMessage: Message = {
  id: 'msg_01',
  role: 'user',
  content: 'Fix the login bug in auth.ts — users are getting a 401 error',
  timestamp: now - 3600_000,
  model: undefined,
  tokens: undefined,
  tools: undefined,
};

const debugResponse: Message = {
  id: 'msg_02',
  role: 'assistant',
  content: 'Found the issue — the token comparison uses == instead of constant-time comparison.',
  timestamp: now - 3599_000,
  model: 'claude-sonnet-4-20250514',
  tokens: { input: 320, output: 180, cacheRead: 200, cacheWrite: 0 },
  tools: [
    { name: 'Read', input: { path: 'src/auth.ts' } },
    { name: 'Edit', input: { path: 'src/auth.ts', old: 'if (token == expected)', new: 'if (timingSafeEqual(...))' } },
  ],
  classification: 'Debugging',
};

const testMessage: Message = {
  id: 'msg_03',
  role: 'user',
  content: 'Now add unit tests for the login flow',
  timestamp: now - 3500_000,
};

const testResponse: Message = {
  id: 'msg_04',
  role: 'assistant',
  content: 'Created comprehensive tests for the login flow.',
  timestamp: now - 3499_000,
  model: 'claude-sonnet-4-20250514',
  tokens: { input: 400, output: 350, cacheRead: 300, cacheWrite: 50 },
  tools: [
    { name: 'Write', input: { path: 'tests/auth.test.ts', content: '...' } },
    { name: 'Bash', input: 'npm test -- --run auth', outputLength: 45 },
  ],
  classification: 'Testing',
};

const gitMessage: Message = {
  id: 'msg_05',
  role: 'user',
  content: 'git commit and push these changes',
  timestamp: now - 3400_000,
};

const gitResponse: Message = {
  id: 'msg_06',
  role: 'assistant',
  content: 'Committed and pushed the auth fix.',
  timestamp: now - 3399_000,
  model: 'claude-sonnet-4-20250514',
  tokens: { input: 200, output: 80, cacheRead: 150, cacheWrite: 0 },
  tools: [
    { name: 'Bash', input: 'git add -A && git commit -m "fix: auth" && git push', outputLength: 140 },
  ],
  classification: 'Git Ops',
};

const explorationMessage: Message = {
  id: 'msg_07',
  role: 'user',
  content: 'What does this codebase do? Give me an overview.',
  timestamp: now - 3300_000,
};

const explorationResponse: Message = {
  id: 'msg_08',
  role: 'assistant',
  content: 'This is a web application framework...',
  timestamp: now - 3299_000,
  model: 'claude-sonnet-4-20250514',
  tokens: { input: 100, output: 250, cacheRead: 50, cacheWrite: 10 },
  tools: [
    { name: 'Read', input: { path: 'README.md' } },
    { name: 'Read', input: { path: 'src/index.ts' } },
  ],
  classification: 'Exploration',
};

export const mockSession: Session = {
  id: 'session_mock_001',
  provider: 'claude',
  project: 'my-web-app',
  timestamp: now - 3600_000,
  durationMs: 600_000,
  messages: [
    debugMessage,
    debugResponse,
    testMessage,
    testResponse,
    gitMessage,
    gitResponse,
    explorationMessage,
    explorationResponse,
  ],
};

export const mockSessionMinimal: Session = {
  id: 'session_mock_002',
  provider: 'claude',
  project: 'tiny-project',
  timestamp: now - 7200_000,
  messages: [
    {
      id: 'msg_minimal_01',
      role: 'user',
      content: 'Hello',
      timestamp: now - 7200_000,
    },
    {
      id: 'msg_minimal_02',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: now - 7199_000,
      model: 'claude-sonnet-4-20250514',
      tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
    },
  ],
};

/** Empty session — edge case for metrics */
export const mockSessionEmpty: Session = {
  id: 'session_mock_003',
  provider: 'codex',
  project: 'empty-project',
  timestamp: now - 86400_000,
  messages: [],
};

export const allMockSessions: Session[] = [
  mockSession,
  mockSessionMinimal,
  mockSessionEmpty,
];
