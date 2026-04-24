This is a great foundation for the AgentLens Low-Level Design (LLD). You have a clear vision for the architecture and data flow. 

I have taken your draft and expanded it into a comprehensive, production-ready LLD. I added essential missing technical details, including explicit design patterns (like the Strategy pattern for providers), expanded TypeScript interfaces, robust pricing and currency handling, local database adapters for SQLite, and security/privacy guarantees.

Here is the enhanced Low-Level Design for AgentLens.

---

# **AgentLens – Low Level Design (LLD)**

## **1. Overview**
AgentLens is a local-first AI developer analytics system. It parses AI coding session data directly from the local disk across various providers (Claude, Codex, Cursor, OpenCode, Pi, Copilot), classifies activities, calculates cost and token usage, detects inefficiencies, and generates actionable optimization insights. It exposes data via a CLI, a Terminal User Interface (TUI), and a Web/API dashboard.

## **2. Goals**
**Functional:**
* **Multi-Provider Support:** Plug-and-play architecture for Claude Code, Codex, Cursor, OpenCode, Pi, and GitHub Copilot.
* **Cost & Usage Tracking:** Exact cost calculation using dynamic LiteLLM pricing (with caching) and currency conversion.
* **Activity Classification:** Deterministic categorization into 13 specific developer tasks (e.g., Coding, Debugging, Git Ops).
* **Optimization Engine:** Rule-based detection of token waste with exact, copy-paste remediation commands.
* **Multi-Interface:** CLI commands, TUI (terminal dashboard), and JSON API/Web outputs.

**Non-Functional:**
* **Zero Egress / Local-First:** No API dependency for core parsing; no PII or codebase data leaves the machine.
* **Performance:** Deterministic processing. Sub-2-second parsing for standard datasets via streaming/chunking and SQLite lazy loading.
* **Extensibility:** Strongly typed Provider Plugin system (Strategy Pattern).

---

## **3. High-Level Architecture**

```text
                ┌──────────────────────────────────────────┐
                │             Presentation Layer           │
                │  [CLI (Commander)]   [TUI / Dashboard]   │
                └───────────────────┬──────────────────────┘
                                    │ (JSON / Typed Objects)
                ┌───────────────────▼──────────────────────┐
                │                 Core Engine              │
                │ ┌────────────┐ ┌─────────┐ ┌───────────┐ │
                │ │ Classifier │ │ Metrics │ │ Optimizer │ │
                │ └────────────┘ └─────────┘ └───────────┘ │
                │        [Pricing & Currency Cache]        │
                └───────────────────┬──────────────────────┘
                                    │ (Normalized Sessions)
                ┌───────────────────▼──────────────────────┐
                │          Provider Plugin Registry        │
                │  (Strategy Pattern: Claude, Cursor...)   │
                └───────────────────┬──────────────────────┘
                                    │ (fs / better-sqlite3)
                ┌───────────────────▼──────────────────────┐
                │             Local File System            │
                │    (~/.claude/, state.vscdb, ~/.codex)   │
                └──────────────────────────────────────────┘
```

---

## **4. Directory Structure**
Expanded to support the full feature set, caching, and specific adapters.

```text
agentlens/
├── apps/
│   ├── cli/               # Commander.js CLI entry points
│   ├── tui/               # Ink-based terminal dashboard
│   └── web/               # Next.js web dashboard & API routes
├── core/
│   ├── parser/            # Core parsing orchestration & deduping
│   ├── classifier/        # 13-category deterministic classification
│   ├── metrics/           # Token counting, cost calculation
│   ├── pricing/           # LiteLLM price fetching & caching
│   ├── currency/          # ECB exchange rates & Intl formatting
│   └── optimizer/         # Waste detection algorithms
├── providers/
│   ├── index.ts           # Provider registry (Factory)
│   ├── base.ts            # Abstract base classes (JSONL, SQLite)
│   ├── claude.ts          # Claude Code implementation
│   ├── cursor.ts          # Cursor implementation
│   └── codex.ts           # Codex implementation
├── adapters/
│   └── sqlite.ts          # Lazy-loaded better-sqlite3 wrapper
├── types/
│   └── index.ts           # Global interfaces
├── config/
│   └── env.ts             # Configuration and environment fallbacks
├── utils/
│   ├── fs-stream.ts       # readline/streams for large JSONL
│   └── dates.ts           # Date windowing logic
└── package.json
```

---

## **5. Core Data Models (Expanded)**

```typescript
// types/index.ts

export interface Session {
  id: string;
  provider: string;       // e.g., 'claude', 'cursor'
  project: string;        // Extracted from path or DB
  timestamp: number;      // Unix epoch
  durationMs?: number;
  messages: Message[];
}

export interface Message {
  id: string;             // For deduplication
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
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
  name: string;           // Normalized (e.g., 'exec_command' -> 'Bash')
  input: string | Record<string, any>;
  outputLength?: number;
  isError?: boolean;
}

export type ActivityCategory = 
  | "Coding" | "Debugging" | "Feature Dev" | "Refactoring" 
  | "Testing" | "Exploration" | "Planning" | "Delegation" 
  | "Git Ops" | "Build/Deploy" | "Brainstorming" 
  | "Conversation" | "General";

export interface Metrics {
  overview: {
    totalCostUSD: number;
    totalCostLocal: number;
    totalTokens: number;
    sessionsCount: number;
    avgCostPerSession: number;
    cacheHitRate: number; // (cacheRead / (input + cacheRead)) * 100
  };
  byModel: Record<string, ModelMetrics>;
  byActivity: Record<ActivityCategory, ActivityMetrics>;
}
```

---

## **6. Provider Plugin System (Strategy Pattern)**

**Responsibility:** Define a strict contract so new tools can be added via a single file.

```typescript
// providers/base.ts
export interface IProvider {
  id: string;
  name: string;
  isAvailable(): boolean; 
  discoverSessions(dateRange?: DateRange): Promise<string[]>;
  parseSession(identifier: string): Promise<Session>;
  normalizeToolName(rawName: string): string;
}

// providers/claude.ts
import { createInterface } from 'readline';
import { createReadStream } from 'fs';

export class ClaudeProvider implements IProvider {
  id = 'claude';
  name = 'Claude Code';

  isAvailable(): boolean {
    return fs.existsSync(`${process.env.HOME}/.claude/projects`);
  }

  // Uses Streams to prevent memory bloat on large session logs
  async parseSession(filePath: string): Promise<Session> {
    const stream = createReadStream(filePath);
    const rl = createInterface({ input: stream });
    const messages: Message[] = [];

    for await (const line of rl) {
       const raw = JSON.parse(line);
       // ... mapping logic to Message interface
    }
    return { /* Constructed Session */ };
  }
}
```

---

## **7. Classifier Module**

**Responsibility:** Deterministically tag turns without making LLM calls.

```typescript
// core/classifier/index.ts
export function classifyTurn(userMessage: string, toolsUsed: ToolUsage[]): ActivityCategory {
  const text = userMessage.toLowerCase();
  const toolNames = toolsUsed.map(t => t.name);

  if (toolNames.includes('Bash') && /git (push|commit|merge)/.test(toolsUsed[0].input as string)) {
    return "Git Ops";
  }
  if (toolNames.includes('Bash') && /(pytest|jest|vitest)/.test(toolsUsed[0].input as string)) {
    return "Testing";
  }
  if (/error|fix|bug|stacktrace/i.test(text) || toolNames.includes('ViewError')) {
    return "Debugging";
  }
  if (/refactor|rename|simplify|extract/i.test(text)) {
    return "Refactoring";
  }
  if (toolNames.includes('Edit') || toolNames.includes('Write')) {
    return "Coding";
  }
  if (toolNames.includes('Read') && !toolNames.includes('Edit')) {
    return "Exploration";
  }
  
  return "General";
}
```

---

## **8. Pricing & Metrics Engine**

**Responsibility:** Calculate exact costs based on LiteLLM data, factoring in caching.

```typescript
// core/pricing/calculator.ts
export class PricingEngine {
  private static prices = new Map<string, ModelPrice>();

  static async loadPrices() {
    // Attempt to load from ~/.cache/agentlens/pricing.json
    // If expired (>24h), fetch from LiteLLM GitHub raw JSON, then cache.
  }

  static calculateMessageCost(model: string, tokens: TokenUsage): number {
    const rates = this.prices.get(model) || FALLBACK_RATES[model];
    
    let cost = 0;
    cost += (tokens.input / 1_000_000) * rates.inputCostPerM;
    cost += (tokens.output / 1_000_000) * rates.outputCostPerM;
    cost += (tokens.cacheRead / 1_000_000) * rates.cacheReadCostPerM;
    cost += (tokens.cacheWrite / 1_000_000) * rates.cacheWriteCostPerM;
    
    return cost;
  }
}
```

---

## **9. Optimizer Module**

**Responsibility:** Identify waste and generate actionable fixes.

```typescript
// core/optimizer/index.ts
export interface WasteFinding {
  severity: "High" | "Medium" | "Low";
  title: string;
  description: string;
  estimatedTokensWasted: number;
  estimatedCostWastedUSD: number;
  suggestedFix: string; // Ready-to-paste CLI command or config edit
}

export function analyzeInefficiencies(sessions: Session[]): WasteFinding[] {
  const findings: WasteFinding[] = [];

  // Rule 1: High Bash Output Waste
  const bashTools = extractTools(sessions, 'Bash');
  const wastedBash = bashTools.filter(t => t.outputLength && t.outputLength > 5000);
  if (wastedBash.length > 10) {
    findings.push({
      severity: "Medium",
      title: "Uncapped Bash Output",
      description: "Agents are reading massive terminal outputs, wasting context.",
      estimatedTokensWasted: wastedBash.reduce((acc, t) => acc + (t.outputLength || 0), 0),
      estimatedCostWastedUSD: 1.45,
      suggestedFix: `export BASH_MAX_OUTPUT_LENGTH=2000`
    });
  }

  // Rule 2: Edit Retry Loops (Low One-Shot Rate)
  // Rule 3: Unused MCP Servers
  
  return findings;
}
```

---

## **10. CLI & Presentation Layer**

### **CLI (Commander.js)**
```typescript
// apps/cli/index.ts
import { Command } from 'commander';

const program = new Command();

program
  .command('report')
  .description('Generate usage report')
  .option('-p, --period <days>', 'Time window in days', '7')
  .option('--format <type>', 'Output format (text, json)', 'text')
  .action(async (options) => {
     const sessions = await CoreEngine.run(options.period);
     if (options.format === 'json') {
       console.log(JSON.stringify(sessions));
     } else {
       renderTUI(sessions); // Boot up Ink dashboard
     }
  });
```

### **Web API (Next.js)**
```typescript
// apps/web/app/api/status/route.ts
import { NextResponse } from 'next/server';
import { CoreEngine } from '@agentlens/core';

export async function GET(request: Request) {
  // Reads local disk directly from the Next.js Node backend
  const metrics = await CoreEngine.getQuickStats(); 
  return NextResponse.json(metrics);
}
```

---

## **11. Performance & Concurrency Considerations**
1.  **File Streaming:** Standard `JSON.parse()` will crash on massive `jsonl` files. `readline` with async iteration is strictly required for the Claude and Codex parsers.
2.  **Optional Dependencies:** Cursor and OpenCode require `better-sqlite3`. Because this requires native compilation, it must be marked as an `optionalDependency` in `package.json` and dynamically imported using a `try/catch` block.
3.  **Result Caching:** Heavy operations (like parsing a 100MB SQLite DB) result in an indexed cache file at `~/.cache/agentlens/parsed-cursor.json`. AgentLens compares the file's `mtime` (modified time) against the cache before re-parsing.

---

## **12. Error Handling & Resilience**
* **Directory Missing:** If `~/.claude` does not exist, the `ClaudeProvider` gracefully returns `isAvailable(): false`. The system skips it without throwing an error.
* **Corrupt Logs:** Wrap JSON lines in `try { JSON.parse(line) } catch { continue; }` to ensure a single corrupted log line does not halt the entire session parsing.
* **Pricing Misses:** If a model string (e.g., `gpt-4o-custom-xyz`) is not found in LiteLLM data, default to a predefined generic fallback (e.g., GPT-4o base rates) and flag the metric object with `isEstimated: true`.

---

## **13. Security and Privacy**
* **Strict Local Boundary:** AgentLens contains **no** telemetry, no tracking pixels, and no "call home" functionality. The only outbound network requests are to `raw.githubusercontent.com` (for LiteLLM prices) and `api.frankfurter.app` (for ECB currency rates).
* **Token Obfuscation:** Extracted prompts and code blocks are held in memory just long enough to calculate tokens/classification, then aggressively garbage collected.
* **Read-Only Operations:** The SQLite adapters open databases in `readonly` mode to ensure third-party tools' internal state is never accidentally corrupted.