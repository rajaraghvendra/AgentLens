# AgentLens – Low Level Design (LLD)

## 1. Overview

AgentLens is a local-first AI developer analytics system that:

* Parses AI coding session data from disk
* Classifies activities (coding, debugging, etc.)
* Calculates cost and token usage
* Detects inefficiencies
* Generates optimization insights
* Exposes CLI + Web Dashboard

---

## 2. Goals

### Functional

* Multi-provider support (Claude, Codex, Cursor, Copilot)
* Cost tracking
* Activity classification
* Optimization suggestions
* JSON/CLI outputs

### Non-Functional

* No API dependency for core parsing
* Fast (<2s for normal dataset)
* Extensible provider plugin system
* Deterministic processing

---

## 3. High-Level Architecture

```
                ┌────────────────────┐
                │   CLI / Dashboard  │
                └────────┬───────────┘
                         │
                ┌────────▼───────────┐
                │   Core Engine      │
                │                    │
                │ Parser             │
                │ Classifier         │
                │ Metrics            │
                │ Optimizer          │
                │ Insights           │
                └────────┬───────────┘
                         │
                ┌────────▼───────────┐
                │   Providers        │
                │ (Claude, Codex...) │
                └────────┬───────────┘
                         │
                ┌────────▼───────────┐
                │ Local File System  │
                └────────────────────┘
```

---

## 4. Directory Structure

```
agentlens/
│
├── apps/
│   ├── cli/
│   ├── dashboard/
│
├── core/
│   ├── parser/
│   ├── classifier/
│   ├── metrics/
│   ├── optimizer/
│   ├── insights/
│
├── providers/
│   ├── claude.ts
│   ├── codex.ts
│
├── types/
│   └── index.ts
│
├── config/
│   └── constants.ts
│
├── utils/
│   └── file.ts
│
└── README.md
```

---

## 5. Core Data Models

### Session

```ts
export interface Session {
  id: string;
  provider: string;
  project: string;
  timestamp: number;
  messages: Message[];
}
```

### Message

```ts
export interface Message {
  role: "user" | "assistant";
  content: string;
  tokens?: TokenUsage;
  tools?: ToolUsage[];
}
```

### Token Usage

```ts
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}
```

### Metrics Output

```ts
export interface Metrics {
  totalCost: number;
  totalTokens: number;
  sessions: number;
  byModel: Record<string, number>;
}
```

---

## 6. Parser Module

### Responsibility

* Read session files
* Normalize structure
* Deduplicate entries

### Interface

```ts
export interface ProviderParser {
  discoverSessions(): Promise<string[]>;
  parseSession(file: string): Promise<Session>;
}
```

### Claude Parser (Example)

```ts
import fs from "fs";

export async function parseClaude(): Promise<Session[]> {
  const dir = `${process.env.HOME}/.claude/projects`;
  const files = fs.readdirSync(dir);

  return files.map(file => {
    const raw = fs.readFileSync(`${dir}/${file}`, "utf-8");
    return {
      id: file,
      provider: "claude",
      project: "default",
      timestamp: Date.now(),
      messages: [{ role: "assistant", content: raw }]
    };
  });
}
```

---

## 7. Classifier Module

### Categories

* Coding
* Debugging
* Feature Dev
* Testing
* Exploration
* Planning

### Logic

```ts
export function classify(message: string): string {
  if (/error|fix/i.test(message)) return "Debugging";
  if (/create|implement/i.test(message)) return "Feature Dev";
  if (/test|jest|pytest/i.test(message)) return "Testing";
  return "General";
}
```

---

## 8. Metrics Engine

### Responsibilities

* Token aggregation
* Cost calculation
* Model grouping

### Cost Formula

```
cost = (input_tokens * input_price) +
       (output_tokens * output_price)
```

### Implementation

```ts
export function computeMetrics(sessions: Session[]): Metrics {
  let totalCost = 0;
  let totalTokens = 0;

  sessions.forEach(session => {
    session.messages.forEach(msg => {
      if (msg.tokens) {
        totalTokens += msg.tokens.input + msg.tokens.output;
        totalCost += (msg.tokens.input * 0.00001) +
                     (msg.tokens.output * 0.00002);
      }
    });
  });

  return {
    totalCost,
    totalTokens,
    sessions: sessions.length,
    byModel: {}
  };
}
```

---

## 9. Optimizer Module

### Responsibilities

* Detect inefficiencies
* Suggest fixes

### Rules

| Pattern      | Detection           | Suggestion      |
| ------------ | ------------------- | --------------- |
| High retries | repeated edits      | improve prompt  |
| Excess reads | multiple file reads | cache context   |
| High cost    | expensive model     | downgrade model |

### Implementation

```ts
export function optimize(sessions: Session[]): string[] {
  const suggestions: string[] = [];

  if (sessions.length > 50) {
    suggestions.push("High session volume detected");
  }

  suggestions.push("Consider reducing model cost");

  return suggestions;
}
```

---

## 10. Insights Engine (AI Layer)

### Input

* Metrics
* Optimization output

### Output

* Human-readable insights

```ts
export async function generateInsights(metrics: Metrics) {
  return [
    `You spent $${metrics.totalCost.toFixed(2)}`,
    "Optimization potential: 30%"
  ];
}
```

---

## 11. CLI Layer

### Commands

| Command  | Description |
| -------- | ----------- |
| report   | full report |
| status   | quick stats |
| optimize | suggestions |

### CLI Flow

```
CLI → Parser → Metrics → Output
```

### Example

```ts
program.command("report").action(async () => {
  const sessions = await parseClaude();
  const metrics = computeMetrics(sessions);

  console.log(metrics);
});
```

---

## 12. Dashboard (Web)

### Stack

* Next.js
* Tailwind

### API

```
GET /api/report
GET /api/status
```

### Sample API

```ts
export async function GET() {
  const sessions = await parseClaude();
  const metrics = computeMetrics(sessions);

  return Response.json(metrics);
}
```

---

## 13. Provider Plugin System

### Interface

```ts
export interface Provider {
  name: string;
  parse(): Promise<Session[]>;
}
```

### Registry

```ts
const providers = [claudeProvider, codexProvider];
```

---

## 14. Data Flow

```
Read Files → Parse → Normalize → Classify → Aggregate → Optimize → Output
```

---

## 15. Performance Considerations

* Cache parsed results
* Lazy load providers
* Use streaming for large files

---

## 16. Error Handling

* Missing directory → return empty
* Corrupt JSON → skip file
* Invalid tokens → default to 0

---

## 17. Future Enhancements

* SaaS sync
* Team analytics
* Auto-fix mode
* Real pricing APIs
* Alert system

---

## 18. Execution Plan

### Phase 1

* Claude parser
* CLI report

### Phase 2

* Metrics + classifier

### Phase 3

* Optimizer

### Phase 4

* Dashboard

### Phase 5

* AI insights

---

## 19. Testing Strategy

* Unit tests for parser
* Snapshot tests for CLI
* Mock session data

---

## 20. Example Command Flow

```
agentlens report
 → parseClaude()
 → computeMetrics()
 → print output
```

---

# END OF LLD
