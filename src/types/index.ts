// ─────────────────────────────────────────────────────────────
// AgentLens – Core Type Definitions
// ─────────────────────────────────────────────────────────────

/**
 * The 13 deterministic activity categories used to classify
 * each user↔assistant turn without making LLM calls.
 */
export type ActivityCategory =
  | "Coding"
  | "Debugging"
  | "Feature Dev"
  | "Refactoring"
  | "Testing"
  | "Exploration"
  | "Planning"
  | "Delegation"
  | "Git Ops"
  | "Build/Deploy"
  | "Brainstorming"
  | "Conversation"
  | "General";

// ── Session & Message ────────────────────────────────────────

export interface Session {
  /** Unique identifier — typically filename or DB row id */
  id: string;
  /** Provider slug, e.g. 'claude', 'cursor', 'codex' */
  provider: string;
  /** Project name extracted from path or DB metadata */
  project: string;
  /** Unix epoch (ms) of session start */
  timestamp: number;
  /** Duration in milliseconds (if calculable) */
  durationMs?: number;
  /** Ordered list of conversation turns */
  messages: Message[];
}

export interface Message {
  /** Stable id for deduplication */
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Unix epoch (ms) */
  timestamp: number;
  /** Model used for this message (e.g. 'claude-sonnet-4-20250514') */
  model?: string;
  tokens?: TokenUsage;
  tools?: ToolUsage[];
  classification?: ActivityCategory;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ToolUsage {
  /** Normalized tool name (e.g. 'Bash', 'Edit', 'Read', 'Write') */
  name: string;
  /** The tool input — command string or structured object */
  input: string | Record<string, unknown>;
  /** The tool's output text (for commands) */
  output?: string;
  /** Length of the tool's output in characters */
  outputLength?: number;
  /** Whether the tool call resulted in an error */
  isError?: boolean;
}

// ── Date Windowing ───────────────────────────────────────────

export interface DateRange {
  /** Start of window (Unix epoch ms) */
  from: number;
  /** End of window (Unix epoch ms) */
  to: number;
}

// ── Pricing ──────────────────────────────────────────────────

export interface ModelPrice {
  /** Model identifier string (e.g. 'claude-sonnet-4-20250514') */
  model: string;
  inputCostPerM: number;
  outputCostPerM: number;
  cacheReadCostPerM: number;
  cacheWriteCostPerM: number;
}

// ── Metrics ──────────────────────────────────────────────────

export interface Metrics {
  overview: MetricsOverview;
  byModel: Record<string, ModelMetrics>;
  byActivity: Partial<Record<ActivityCategory, ActivityMetrics>>;
}

export interface MetricsOverview {
  totalCostUSD: number;
  totalCostLocal: number;
  localCurrency: string;
  totalTokens: number;
  sessionsCount: number;
  avgCostPerSession: number;
  /** (cacheRead / (input + cacheRead)) * 100 */
  cacheHitRate: number;
  budgetUSD?: number;
}

export interface ModelMetrics {
  model: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUSD: number;
  messageCount: number;
  /** True when pricing was estimated from fallback rates */
  isEstimated?: boolean;
}

export interface ActivityMetrics {
  category: ActivityCategory;
  messageCount: number;
  totalTokens: number;
  costUSD: number;
  /** Percentage of total messages */
  percentage: number;
  /** Number of edit turns */
  editTurns: number;
  /** Number of one-shot successful edits */
  oneShotTurns: number;
  /** One-shot success rate percentage */
  oneShotRate: number;
}

// ── Daily Breakdown ─────────────────────────────────────────

export interface DailyMetrics {
  date: string;
  costUSD: number;
  sessions: number;
  tokens: number;
}

// ── Bash Commands ─────────────────────────────────────────

export interface BashCommand {
  command: string;
  count: number;
}

// ── Export Types ─────────────────────────────────────────

export interface ExportData {
  period: string;
  totalCost: number;
  totalSessions: number;
  totalTokens: number;
  byDay: DailyMetrics[];
  byProject: { name: string; cost: number; sessions: number }[];
  byModel: { name: string; cost: number; calls: number }[];
  byActivity: { name: string; cost: number; percentage: number; oneShotRate: number }[];
}

// ── Optimizer ────────────────────────────────────────────────

export interface WasteFinding {
  severity: "High" | "Medium" | "Low";
  title: string;
  description: string;
  estimatedTokensWasted: number;
  estimatedCostWastedUSD: number;
  /** Ready-to-paste CLI command or config edit */
  suggestedFix: string;
}

// ── Provider ─────────────────────────────────────────────────

export interface ProviderInfo {
  id: string;
  name: string;
  available: boolean;
  sessionCount?: number;
}

// ── Full Engine Result ───────────────────────────────────────

export interface EngineResult {
  sessions: Session[];
  metrics: Metrics;
  findings: WasteFinding[];
  insights: string[];
  providers: ProviderInfo[];
}
