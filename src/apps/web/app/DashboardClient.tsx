"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import nextDynamic from "next/dynamic";
import {
  Activity,
  ChevronDown,
  Clock,
  Cpu,
  Database,
  DollarSign,
  Filter,
  Gauge,
  GitCompare,
  RefreshCw,
  TerminalSquare,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";

const BudgetSettings = nextDynamic(() => import("../components/BudgetSettings"), { ssr: false });
const CostTrendChart = nextDynamic(() => import("../components/CostTrendChart").then((mod) => mod.CostTrendChart), { ssr: false });
const ActivityBreakdown = nextDynamic(() => import("../components/ActivityBreakdown").then((mod) => mod.ActivityBreakdown), { ssr: false });
const ModelUsageChart = nextDynamic(() => import("../components/ModelUsageChart").then((mod) => mod.ModelUsageChart), { ssr: false });
const OptimizationFindings = nextDynamic(() => import("../components/OptimizationFindings").then((mod) => mod.OptimizationFindings), { ssr: false });
const ActiveHoursChart = nextDynamic(() => import("../components/ActiveHoursChart"), { ssr: false });
const InsightsPanel = nextDynamic(() => import("../components/InsightsPanel").then((mod) => mod.InsightsPanel), { ssr: false });

type TabType = "dashboard" | "optimize" | "compare";
type ProviderSummary = { id: string; name: string; available: boolean; sessionCount?: number };
type EventSummary = { id: string; title: string; severity: string; description: string; recommendedAction?: string };
type AdviceSummary = { title: string; priority: string; description: string; suggestedAction: string };
type ProcessingSummary = { filesScanned?: number; filesReparsed?: number; cachedFilesReused?: number; sessionsLoadedFromCache?: number } | null;
type FreshnessSummary = {
  responseGeneratedAt: string;
  sourceLastModifiedAt?: string;
  lastParsedAt?: string;
  responseCacheTtlMs: number;
  parseMode: "incremental" | "full-reparse";
  filesScanned: number;
  filesReparsed: number;
  cachedFilesReused: number;
  sessionsLoadedFromCache: number;
} | null;

type OverviewResponse = {
  responseVersion: number;
  generatedAt: string;
  periodDays: number;
  provider: string;
  metrics: {
    overview?: {
      totalCostLocal?: number;
      localCurrency?: string;
      sessionsCount?: number;
      totalTokens?: number;
      avgCostPerSession?: number;
      cacheHitRate?: number;
    };
  };
  providers?: ProviderSummary[];
  activeProviderCount?: number;
  topEvent?: EventSummary | null;
  topRecommendation?: AdviceSummary | null;
  processing?: ProcessingSummary;
  providerCosts?: Record<string, number>;
  freshness?: FreshnessSummary;
};

type ReportResponse = {
  responseVersion?: number;
  generatedAt?: string;
  metrics?: {
    byActivity?: Record<string, any>;
    byModel?: Record<string, any>;
    hourly?: Record<string, { messages: number; tokens: number; costUSD: number }>;
    overview?: {
      totalCostLocal?: number;
      localCurrency?: string;
      sessionsCount?: number;
      totalTokens?: number;
      avgCostPerSession?: number;
      cacheHitRate?: number;
    };
  };
  findings?: Array<{ title: string; severity: string; description: string }>;
  insights?: string[];
  daily?: Array<{ date: string; costUSD: number; sessions: number; tokens: number }>;
  projects?: Array<{ name: string; cost: number; sessions: number }>;
  providers?: Array<{ id: string; name: string; available: boolean; sessionCount?: number }>;
  tools?: Array<{ name: string; count: number }>;
  commands?: Array<{ command: string; count: number }>;
  events?: Array<{ id: string; title: string; severity: string; description: string; recommendedAction?: string }>;
  digests?: Array<{ period: string; headline: string; summary: string[] }>;
  toolAdvice?: Array<{ title: string; priority: string; description: string; suggestedAction: string }>;
  toolBreakdown?: Array<{ name: string; estimatedCostUSD: number; errorRate: number; invocationCount: number }>;
  mcpBreakdown?: Array<{ name: string; errorRate: number; invocationCount: number }>;
  processing?: { filesScanned?: number; filesReparsed?: number; cachedFilesReused?: number; sessionsLoadedFromCache?: number } | null;
  freshness?: FreshnessSummary;
};

type DashboardSnapshot = {
  version: number;
  updatedAt: string;
  expiresAt: number;
  overview: OverviewResponse | null;
  report: ReportResponse | null;
};

const PERIODS = [
  { label: "Today", days: 1, key: "today" },
  { label: "7 Days", days: 7, key: "7days" },
  { label: "30 Days", days: 30, key: "30days" },
  { label: "All Time", days: 365, key: "all" },
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  all: "All Providers",
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
  pi: "Pi",
  copilot: "Copilot",
};

const DASHBOARD_SNAPSHOT_VERSION = 1;
const DASHBOARD_SNAPSHOT_TTL_MS = 15 * 60 * 1000;
const DASHBOARD_BACKGROUND_REFRESH_MIN_AGE_MS = 5 * 60 * 1000;

function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id;
}

function severityTone(severity?: string): string {
  switch ((severity ?? "").toLowerCase()) {
    case "high":
      return "border-red-500/60 bg-red-950/55 text-red-100";
    case "medium":
      return "border-amber-500/60 bg-amber-950/45 text-amber-100";
    case "low":
      return "border-sky-500/60 bg-sky-950/45 text-sky-100";
    default:
      return "border-border/70 bg-background/70 text-text-primary";
  }
}

function formatProjectLabel(name: string, maxLength = 32): string {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "Unknown Project";

  const segments = trimmed.split(/[\\/]+/).filter(Boolean);
  const tail = segments.length > 0 ? segments[segments.length - 1] : trimmed;

  if (tail.length <= maxLength) return tail;
  return `${tail.slice(0, Math.max(0, maxLength - 1))}…`;
}

function createQueryParams(period: string, selectedProvider: string): URLSearchParams {
  const selected = PERIODS.find((entry) => entry.key === period);
  const params = new URLSearchParams({ period: String(selected?.days ?? 7) });
  if (selectedProvider !== "all") params.set("provider", selectedProvider);
  return params;
}

function snapshotStorageKey(period: string, selectedProvider: string): string {
  return `agentlens:dashboard:${period}:${selectedProvider}`;
}

function formatRelativeTime(timestamp?: string | null): string {
  if (!timestamp) return "Unknown";
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diffMs)) return "Unknown";

  const diffSeconds = Math.max(0, Math.round(diffMs / 1000));
  if (diffSeconds < 10) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function readDashboardSnapshot(period: string, selectedProvider: string): DashboardSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const key = snapshotStorageKey(period, selectedProvider);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardSnapshot;
    if (parsed.version !== DASHBOARD_SNAPSHOT_VERSION || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDashboardSnapshot(period: string, selectedProvider: string, snapshot: DashboardSnapshot): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(snapshotStorageKey(period, selectedProvider), JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

export default function Dashboard({
  initialOverview = null,
  initialError = null,
}: {
  initialOverview?: OverviewResponse | null;
  initialError?: string | null;
}) {
  const defaultSnapshot = useMemo<DashboardSnapshot | null>(
    () =>
      initialOverview
        ? {
            version: DASHBOARD_SNAPSHOT_VERSION,
            updatedAt: initialOverview.generatedAt,
            expiresAt: Date.now() + DASHBOARD_SNAPSHOT_TTL_MS,
            overview: initialOverview,
            report: null,
          }
        : null,
    [initialOverview],
  );

  const [overviewData, setOverviewData] = useState<OverviewResponse | null>(initialOverview);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [optimizeData, setOptimizeData] = useState<any>(null);
  const [compareData, setCompareData] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(!initialOverview);
  const [reportLoading, setReportLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMode, setRefreshMode] = useState<"incremental" | "force-refresh" | "full-reparse">("incremental");
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialOverview?.generatedAt ?? null);
  const [period, setPeriod] = useState<string>("7days");
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [showBudgetSettings, setShowBudgetSettings] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [compareSortBy, setCompareSortBy] = useState<"name" | "costUSD" | "totalTokens" | "messageCount">("costUSD");
  const [compareSortDir, setCompareSortDir] = useState<"asc" | "desc">("desc");
  const overviewRef = useRef<OverviewResponse | null>(initialOverview);
  const reportRef = useRef<ReportResponse | null>(null);

  const persistSnapshot = useCallback(
    (nextOverview: OverviewResponse | null, nextReport: ReportResponse | null, updatedAtOverride?: string | null) => {
      const updatedAtValue = updatedAtOverride ?? nextReport?.generatedAt ?? nextOverview?.generatedAt ?? new Date().toISOString();
      writeDashboardSnapshot(period, selectedProvider, {
        version: DASHBOARD_SNAPSHOT_VERSION,
        updatedAt: updatedAtValue,
        expiresAt: Date.now() + DASHBOARD_SNAPSHOT_TTL_MS,
        overview: nextOverview,
        report: nextReport,
      });
    },
    [period, selectedProvider],
  );

  const fetchOverview = useCallback(async (mode: "incremental" | "force-refresh" | "full-reparse" = "incremental") => {
    const params = createQueryParams(period, selectedProvider);
    if (mode === "force-refresh" || mode === "full-reparse") params.set("forceRefresh", "1");
    if (mode === "full-reparse") params.set("fullReparse", "1");
    const res = await fetch(`/api/overview?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Overview request failed with status ${res.status}`);
    }

    const data = (await res.json()) as OverviewResponse;
    overviewRef.current = data;
    setOverviewData(data);
    setLastUpdated(data.generatedAt);
    setLoadError(null);
    persistSnapshot(data, reportRef.current, data.generatedAt);
    return data;
  }, [period, persistSnapshot, selectedProvider]);

  const fetchReport = useCallback(async (mode: "incremental" | "force-refresh" | "full-reparse" = "incremental") => {
    const params = createQueryParams(period, selectedProvider);
    if (mode === "force-refresh" || mode === "full-reparse") params.set("forceRefresh", "1");
    if (mode === "full-reparse") params.set("fullReparse", "1");
    const res = await fetch(`/api/report?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Report request failed with status ${res.status}`);
    }

    const data = (await res.json()) as ReportResponse;
    reportRef.current = data;
    setReport(data);
    setLastUpdated(data.generatedAt ?? overviewRef.current?.generatedAt ?? null);
    setLoadError(null);
    persistSnapshot(overviewRef.current, data, data.generatedAt ?? overviewRef.current?.generatedAt ?? null);
    return data;
  }, [period, persistSnapshot, selectedProvider]);

  const fetchOptimize = useCallback(async () => {
    const params = createQueryParams(period, selectedProvider);
    const res = await fetch(`/api/optimize?${params.toString()}`);
    setOptimizeData(await res.json());
  }, [period, selectedProvider]);

  const fetchCompare = useCallback(async () => {
    const params = createQueryParams(period, selectedProvider);
    const res = await fetch(`/api/compare?${params.toString()}`);
    setCompareData(await res.json());
  }, [period, selectedProvider]);

  useEffect(() => {
    const cachedSnapshot = readDashboardSnapshot(period, selectedProvider);
    const hasFreshSnapshot =
      cachedSnapshot != null && cachedSnapshot.updatedAt != null && Date.now() - new Date(cachedSnapshot.updatedAt).getTime() < DASHBOARD_BACKGROUND_REFRESH_MIN_AGE_MS;
    const hasServerOverview =
      cachedSnapshot == null && period === "7days" && selectedProvider === "all" && defaultSnapshot?.overview != null;

    if (cachedSnapshot) {
      overviewRef.current = cachedSnapshot.overview;
      reportRef.current = cachedSnapshot.report;
      setOverviewData(cachedSnapshot.overview);
      setReport(cachedSnapshot.report);
      setLastUpdated(cachedSnapshot.updatedAt);
      setOverviewLoading(false);
      setReportLoading(cachedSnapshot.report == null);
      setLoadError(null);
    } else if (period === "7days" && selectedProvider === "all" && defaultSnapshot) {
      overviewRef.current = defaultSnapshot.overview;
      reportRef.current = defaultSnapshot.report;
      setOverviewData(defaultSnapshot.overview);
      setReport(defaultSnapshot.report);
      setLastUpdated(defaultSnapshot.updatedAt);
      setOverviewLoading(false);
      setReportLoading(true);
      setLoadError(initialError);
    } else {
      overviewRef.current = null;
      reportRef.current = null;
      setOverviewData(null);
      setReport(null);
      setLastUpdated(null);
      setOverviewLoading(true);
      setReportLoading(true);
      setLoadError(null);
    }

    if (hasFreshSnapshot) {
      return;
    }

    let cancelled = false;
    const shouldFetchOverview = !hasServerOverview;
    const shouldFetchReport = reportRef.current == null || !hasFreshSnapshot;
    let pendingRequests = 0;

    if (shouldFetchOverview) pendingRequests += 1;
    if (shouldFetchReport) pendingRequests += 1;

    if (pendingRequests === 0) {
      return;
    }

    setRefreshing(true);

    const finishRequest = () => {
      pendingRequests -= 1;
      if (!cancelled && pendingRequests <= 0) {
        setRefreshing(false);
      }
    };

    if (shouldFetchOverview) {
      void fetchOverview("incremental")
        .catch((error: any) => {
          if (!cancelled) {
            setLoadError(error?.message ?? "Failed to refresh dashboard overview.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setOverviewLoading(false);
          }
          finishRequest();
        });
    } else {
      setOverviewLoading(false);
    }

    if (shouldFetchReport) {
      void fetchReport("incremental")
        .catch((error: any) => {
          if (!cancelled) {
            setLoadError((current) => current ?? error?.message ?? "Failed to refresh dashboard report.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setReportLoading(false);
          }
          finishRequest();
        });
    } else {
      setReportLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [defaultSnapshot, fetchOverview, fetchReport, initialError, period, selectedProvider]);

  useEffect(() => {
    if (activeTab === "optimize") void fetchOptimize();
    if (activeTab === "compare") void fetchCompare();
  }, [activeTab, fetchOptimize, fetchCompare]);

  const overview = overviewData?.metrics?.overview ?? report?.metrics?.overview ?? {};
  const hourly = report?.metrics?.hourly ?? {};
  const findings = report?.findings ?? [];
  const activities = Object.values(report?.metrics?.byActivity ?? {}).sort((a: any, b: any) => b.costUSD - a.costUSD);
  const models = Object.values(report?.metrics?.byModel ?? {}).sort((a: any, b: any) => b.costUSD - a.costUSD);
  const daily = report?.daily ?? [];
  const projects = report?.projects ?? [];
  const providers = report?.providers ?? overviewData?.providers ?? [];
  const tools = report?.tools ?? [];
  const commands = report?.commands ?? [];
  const insights = report?.insights ?? [];
  const events = report?.events ?? (overviewData?.topEvent ? [overviewData.topEvent] : []);
  const digests = report?.digests ?? [];
  const toolAdvice = report?.toolAdvice ?? (overviewData?.topRecommendation ? [overviewData.topRecommendation] : []);
  const toolBreakdown = report?.toolBreakdown ?? [];
  const mcpBreakdown = report?.mcpBreakdown ?? [];
  const processing = report?.processing ?? overviewData?.processing ?? null;
  const freshness = report?.freshness ?? overviewData?.freshness ?? null;
  const optimizeFindings = optimizeData?.findings ?? [];
  const optimizeInsights = optimizeData?.insights ?? [];
  const optimizeHealthScore = optimizeData?.healthScore;
  const optimizeHealthGrade = optimizeData?.healthGrade;
  const compareModels = compareData?.models ?? [];
  const compareTotalCost = compareData?.totalCostUSD ?? 0;
  const topFinding = findings[0];
  const topEvent = events[0];
  const dailyDigest = digests.find((entry) => entry.period === "daily");
  const activeProviderCount = overviewData?.activeProviderCount ?? providers.filter((provider) => provider.available).length;
  const currentPeriodLabel = PERIODS.find((entry) => entry.key === period)?.label ?? "7 Days";
  const reportReady = report != null;
  const statusLabel = refreshing
    ? refreshMode === "full-reparse"
      ? "Full reparse in progress"
      : refreshMode === "force-refresh"
        ? "Force refreshing data"
        : "Refreshing data"
    : lastUpdated
      ? `Updated ${new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : overviewLoading
        ? "Loading overview"
        : "Waiting for data";

  const triggerRefresh = useCallback((mode: "incremental" | "force-refresh" | "full-reparse") => {
    setRefreshMode(mode);
    setRefreshing(true);
    setOverviewLoading(false);
    setReportLoading((current) => current || report == null);

    let pendingRequests = 2;
    const finishRequest = () => {
      pendingRequests -= 1;
      if (pendingRequests <= 0) {
        setRefreshing(false);
        setRefreshMode("incremental");
      }
    };

    void fetchOverview(mode)
      .catch((error: any) => setLoadError(error?.message ?? "Failed to refresh dashboard overview."))
      .finally(() => {
        setOverviewLoading(false);
        finishRequest();
      });

    void fetchReport(mode)
      .catch((error: any) => setLoadError((current) => current ?? error?.message ?? "Failed to refresh dashboard report."))
      .finally(() => {
        setReportLoading(false);
        finishRequest();
      });
  }, [fetchOverview, fetchReport, report]);

  const sortedCompareModels = [...compareModels].sort((a: any, b: any) => {
    const aValue = a?.[compareSortBy];
    const bValue = b?.[compareSortBy];

    if (compareSortBy === "name") {
      const left = String(aValue ?? "").toLowerCase();
      const right = String(bValue ?? "").toLowerCase();
      return compareSortDir === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    }

    const left = Number(aValue ?? 0);
    const right = Number(bValue ?? 0);
    return compareSortDir === "asc" ? left - right : right - left;
  });

  return (
    <div className="min-h-screen bg-background px-5 py-6 md:px-8">
      <div className="mx-auto max-w-[1200px] rounded-[22px] border border-border/70 bg-[#050816] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <header className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[32px] font-semibold tracking-tight">◊ AgentLens</h1>
              <p className="mt-1 text-sm text-text-secondary">AI developer analytics dashboard</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-full border border-border/70 px-3 py-2 text-xs text-text-secondary md:block">
                {statusLabel}
              </div>
              <button
                onClick={() => triggerRefresh("incremental")}
                className="panel-button"
                title="Refresh (incremental)"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => triggerRefresh("force-refresh")}
                className="panel-button px-3 text-xs"
                title="Force refresh (bypass response cache)"
              >
                Force
              </button>
              <button
                onClick={() => triggerRefresh("full-reparse")}
                className="panel-button px-3 text-xs"
                title="Full reparse (ignore file cache)"
              >
                Reparse
              </button>
              <button onClick={() => setShowBudgetSettings(true)} className="panel-button" title="Budget Settings">
                <Wallet className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-surface/80 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {PERIODS.map((entry) => (
                  <button
                    key={entry.key}
                    onClick={() => setPeriod(entry.key)}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                      period === entry.key
                        ? "bg-primary text-white shadow-[0_0_0_1px_rgba(99,102,241,0.35)]"
                        : "bg-transparent text-text-secondary hover:bg-white/5 hover:text-text-primary"
                    }`}
                  >
                    {period === entry.key ? `[ ${entry.label} ]` : entry.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 text-sm">
                <span className="text-text-secondary">|</span>
                <div className="relative">
                  <button
                    onClick={() => setShowProviderDropdown((value) => !value)}
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-2 text-text-primary hover:bg-white/5"
                  >
                    <span className="text-primary">[p]</span>
                    <span>{providerLabel(selectedProvider)}</span>
                    <ChevronDown className="h-4 w-4 text-text-secondary" />
                  </button>
                  {showProviderDropdown && (
                    <div className="absolute right-0 top-full z-20 mt-2 min-w-[190px] rounded-2xl border border-border/70 bg-surface/95 p-2 shadow-2xl">
                      <button
                        onClick={() => {
                          setSelectedProvider("all");
                          setShowProviderDropdown(false);
                        }}
                        className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${
                          selectedProvider === "all" ? "bg-primary/15 text-primary" : "hover:bg-white/5"
                        }`}
                      >
                        All Providers
                      </button>
                      {providers.map((provider) => (
                        <button
                          key={provider.id}
                          onClick={() => {
                            setSelectedProvider(provider.id);
                            setShowProviderDropdown(false);
                          }}
                          className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${
                            selectedProvider === provider.id ? "bg-primary/15 text-primary" : "hover:bg-white/5"
                          }`}
                        >
                          {provider.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(["all", ...providers.slice(0, 6).map((provider) => provider.id)] as string[]).map((providerId) => (
                <button
                  key={providerId}
                  onClick={() => setSelectedProvider(providerId)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    selectedProvider === providerId
                      ? "bg-primary text-white"
                      : "border border-border/60 text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  }`}
                >
                  {providerId}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="mt-6 rounded-2xl border border-border/70 bg-surface/75 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <TabButton tab="dashboard" activeTab={activeTab} onClick={() => setActiveTab("dashboard")} />
            <TabButton tab="optimize" activeTab={activeTab} onClick={() => setActiveTab("optimize")} />
            <TabButton tab="compare" activeTab={activeTab} onClick={() => setActiveTab("compare")} />
          </div>
        </div>

        {activeTab === "dashboard" && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard title="Total Cost" value={`$${(overview.totalCostLocal ?? 0).toFixed(2)}`} subtitle={overview.localCurrency ?? "USD"} icon={<DollarSign className="text-emerald-400" />} highlight loading={overviewLoading && !overviewData} />
              <MetricCard title="Sessions" value={overview.sessionsCount ?? 0} subtitle={`Avg $${(overview.avgCostPerSession ?? 0).toFixed(2)}/session`} icon={<Activity className="text-primary-300" />} loading={overviewLoading && !overviewData} />
              <MetricCard title="Total Tokens" value={`${(((overview.totalTokens ?? 0) / 1_000_000).toFixed(1))}M`} subtitle="Processed" icon={<Database className="text-sky-300" />} loading={overviewLoading && !overviewData} />
              <MetricCard title="Cache Efficiency" value={(overview.cacheHitRate ?? 0).toFixed(1) + "%"} subtitle="Context hit rate" icon={<Zap className="text-yellow-300" />} loading={overviewLoading && !overviewData} />
              <MetricCard title="Providers" value={activeProviderCount} subtitle="Active" icon={<Filter className="text-violet-300" />} loading={overviewLoading && !overviewData} />
            </div>

            {loadError && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 px-6 py-4 text-sm text-amber-100">
                {loadError}
              </div>
            )}

            {topEvent && (
              <div className={`rounded-2xl border px-6 py-4 ${severityTone(topEvent.severity)}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold uppercase tracking-wide">{topEvent.severity}</span>
                  <span className="text-base font-semibold">{topEvent.title}</span>
                </div>
                <p className="mt-2 text-sm opacity-90">{topEvent.description}</p>
                {topEvent.recommendedAction && <p className="mt-2 text-sm font-medium opacity-95">{topEvent.recommendedAction}</p>}
              </div>
            )}

            {!reportReady && reportLoading ? (
              <DashboardLoadingShell />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                  <SurfaceCard title="Daily Activity">
                    <div className="h-64">
                      <CostTrendChart data={daily} />
                    </div>
                  </SurfaceCard>
                  <SurfaceCard title="Projects">
                    <div className="space-y-3">
                      {projects.slice(0, 5).map((proj, idx) => (
                        <div key={idx} className="rounded-xl bg-background/70 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1 truncate font-medium" title={proj.name}>
                              {formatProjectLabel(proj.name)}
                            </div>
                            <div className="shrink-0 text-sm font-semibold text-emerald-400">${proj.cost.toFixed(2)}</div>
                          </div>
                          <div className="mt-1 text-xs text-text-secondary">{proj.sessions} sessions</div>
                        </div>
                      ))}
                      {projects.length === 0 && <p className="text-sm text-text-secondary">No project data available.</p>}
                    </div>
                  </SurfaceCard>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <SurfaceCard title="Top Activities">
                    <ActivityBreakdown activities={activities.slice(0, 10)} />
                  </SurfaceCard>
                  <SurfaceCard title="Models Used">
                    <div className="h-64">
                      <ModelUsageChart data={models.slice(0, 8)} />
                    </div>
                  </SurfaceCard>
                </div>

                <SurfaceCard title="Active Hours" icon={<Clock className="h-4 w-4 text-accent" />}>
                  <p className="mb-4 text-sm text-text-secondary">When you are most active across the selected window.</p>
                  <div className="h-52">
                    <ActiveHoursChart hourly={hourly} />
                  </div>
                </SurfaceCard>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                  <SurfaceCard title="Top Tools" icon={<Wrench className="h-4 w-4 text-accent" />}>
                    <div className="space-y-2">
                      {tools.slice(0, 8).map((tool, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 text-sm">
                          <span>{tool.name}</span>
                          <span className="text-text-secondary">{tool.count}x</span>
                        </div>
                      ))}
                      {tools.length === 0 && <p className="text-sm text-text-secondary">No tool usage data available.</p>}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard title="Top Commands" icon={<TerminalSquare className="h-4 w-4 text-accent" />}>
                    <div className="space-y-2">
                      {commands.slice(0, 8).map((cmd, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 rounded-xl bg-background/70 px-3 py-2 text-sm">
                          <code className="truncate">{cmd.command}</code>
                          <span className="shrink-0 text-text-secondary">{cmd.count}x</span>
                        </div>
                      ))}
                      {commands.length === 0 && <p className="text-sm text-text-secondary">No command data available.</p>}
                    </div>
                  </SurfaceCard>
                  <SurfaceCard title="Providers" icon={<Cpu className="h-4 w-4 text-accent" />}>
                    <div className="space-y-2">
                      {providers.map((provider, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 text-sm">
                          <span>{provider.name}</span>
                          <span className={provider.available ? "text-emerald-400" : "text-text-secondary"}>{provider.sessionCount ?? 0}</span>
                        </div>
                      ))}
                    </div>
                  </SurfaceCard>
                </div>

                {topFinding && (
                  <div className={`rounded-2xl border px-6 py-4 ${severityTone(topFinding.severity)}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold uppercase tracking-wide">{topFinding.severity}</span>
                      <span className="text-base font-semibold">{topFinding.title}</span>
                    </div>
                    <p className="mt-2 text-sm opacity-90">{topFinding.description}</p>
                  </div>
                )}

                {(freshness || processing) && (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {freshness ? (
                      <SurfaceCard title="Freshness">
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between gap-3"><span>Parse Mode</span><span className="font-medium">{freshness.parseMode}</span></div>
                          <div className="flex items-center justify-between gap-3"><span>View Age</span><span>{formatRelativeTime(freshness.responseGeneratedAt)}</span></div>
                          <div className="flex items-center justify-between gap-3"><span>Last Parsed</span><span>{formatRelativeTime(freshness.lastParsedAt)}</span></div>
                          <div className="flex items-center justify-between gap-3"><span>Source Changed</span><span>{formatRelativeTime(freshness.sourceLastModifiedAt)}</span></div>
                          <div className="flex items-center justify-between gap-3"><span>Response Cache</span><span>{Math.round((freshness.responseCacheTtlMs ?? 0) / 1000)}s</span></div>
                        </div>
                      </SurfaceCard>
                    ) : <div />}
                    {processing ? (
                      <SurfaceCard title="Processing">
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between"><span>Files Scanned</span><span>{processing.filesScanned ?? 0}</span></div>
                          <div className="flex items-center justify-between"><span>Reparsed</span><span>{processing.filesReparsed ?? 0}</span></div>
                          <div className="flex items-center justify-between"><span>Cached Reuse</span><span>{processing.cachedFilesReused ?? 0}</span></div>
                          <div className="flex items-center justify-between"><span>Cache Sessions</span><span>{processing.sessionsLoadedFromCache ?? 0}</span></div>
                        </div>
                      </SurfaceCard>
                    ) : <div />}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
                  <SurfaceCard title="Findings">
                    {findings.length === 0 ? (
                      <p className="text-sm text-text-secondary">No findings available.</p>
                    ) : (
                      <div className="space-y-3">
                        {findings.map((finding, idx) => (
                          <div key={idx} className={`rounded-xl border px-4 py-3 ${severityTone(finding.severity)}`}>
                            <div className="font-medium">{finding.title}</div>
                            <p className="mt-1 text-sm opacity-90">{finding.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </SurfaceCard>
                  <SurfaceCard title="Insights">
                    {insights.length === 0 ? (
                      <p className="text-sm text-text-secondary">No insights available.</p>
                    ) : (
                      <div className="space-y-3">
                        {insights.map((insight, idx) => (
                          <div key={idx} className="rounded-xl bg-background/70 px-4 py-3 text-sm text-text-primary">
                            {insight.replace(/\*\*/g, "")}
                          </div>
                        ))}
                      </div>
                    )}
                  </SurfaceCard>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
                  <SurfaceCard title="Recommendations">
                    {toolAdvice.length === 0 ? (
                      <p className="text-sm text-text-secondary">No optimization recommendations available.</p>
                    ) : (
                      <div className="space-y-3">
                        {toolAdvice.slice(0, 5).map((item, idx) => (
                          <div key={idx} className={`rounded-xl border px-4 py-3 ${severityTone(item.priority)}`}>
                            <div className="font-medium">{item.title}</div>
                            <p className="mt-1 text-sm opacity-90">{item.description}</p>
                            <p className="mt-2 text-sm font-medium opacity-95">{item.suggestedAction}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </SurfaceCard>
                  <SurfaceCard title="Top Savings Opportunities">
                    {dailyDigest ? (
                      <div className="space-y-3">
                        <div className="rounded-xl bg-background/70 px-4 py-3 font-medium">{dailyDigest.headline}</div>
                        {dailyDigest.summary.slice(0, 4).map((line, idx) => (
                          <div key={idx} className="rounded-xl bg-background/70 px-4 py-3 text-sm text-text-primary">
                            {line}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-text-secondary">No savings digest available.</p>
                    )}
                  </SurfaceCard>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
                  <SurfaceCard title="Tool Efficiency">
                    {toolBreakdown.length === 0 ? (
                      <p className="text-sm text-text-secondary">No tool metrics available.</p>
                    ) : (
                      <div className="space-y-2">
                        {toolBreakdown.slice(0, 6).map((tool, idx) => (
                          <div key={idx} className="flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 text-sm">
                            <span className="truncate">{tool.name}</span>
                            <span className="shrink-0 text-text-secondary">
                              ${Number(tool.estimatedCostUSD || 0).toFixed(2)} · {(Number(tool.errorRate || 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </SurfaceCard>
                  <SurfaceCard title="MCP Health">
                    {mcpBreakdown.length === 0 ? (
                      <p className="text-sm text-text-secondary">No MCP usage detected.</p>
                    ) : (
                      <div className="space-y-2">
                        {mcpBreakdown.slice(0, 6).map((mcp, idx) => (
                          <div key={idx} className="flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 text-sm">
                            <span className="truncate">{mcp.name}</span>
                            <span className="shrink-0 text-text-secondary">
                              {(Number(mcp.errorRate || 0) * 100).toFixed(0)}% · {mcp.invocationCount} calls
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </SurfaceCard>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "optimize" && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.75fr_0.75fr_1fr]">
              <SurfaceCard title="Health Grade" accentClass="border-emerald-500/45">
                <div className="flex items-center gap-5">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-4xl font-bold text-white">
                    {optimizeHealthGrade ?? "--"}
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">Score {typeof optimizeHealthScore === "number" ? optimizeHealthScore : "--"}</div>
                    <div className="mt-1 text-sm text-text-secondary">Overall optimization grade</div>
                  </div>
                </div>
              </SurfaceCard>
              <SurfaceCard title="Period Total">
                <div className="text-4xl font-semibold text-emerald-400">${Number(overview.totalCostLocal ?? 0).toFixed(2)}</div>
                <div className="mt-2 text-sm text-text-secondary">Selected period spend</div>
              </SurfaceCard>
              <SurfaceCard title={`Findings (${optimizeFindings.length})`}>
                {optimizeFindings.length === 0 ? (
                  <p className="text-sm text-text-secondary">No optimization findings in this period.</p>
                ) : (
                  <div className="space-y-3">
                    {optimizeFindings.slice(0, 2).map((finding: any, idx: number) => (
                      <div key={idx} className={`rounded-xl border px-4 py-3 ${severityTone(finding.severity)}`}>
                        <div className="font-medium">{finding.title}</div>
                        <div className="mt-1 text-sm opacity-90">{finding.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </SurfaceCard>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <SurfaceCard title="Detailed Findings">
                <OptimizationFindings findings={optimizeFindings} />
              </SurfaceCard>
              <SurfaceCard title="Optimization Insights">
                <InsightsPanel insights={optimizeInsights} />
              </SurfaceCard>
            </div>
          </div>
        )}

        {activeTab === "compare" && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Models Compared" value={compareModels.length} subtitle="Current comparison set" icon={<Cpu className="text-violet-300" />} highlight />
              <MetricCard title="Total Compared Spend" value={`$${Number(compareTotalCost || 0).toFixed(2)}`} subtitle="Combined model cost" icon={<DollarSign className="text-emerald-400" />} />
              <MetricCard title="Selected Provider" value={selectedProvider === "all" ? "All" : providerLabel(selectedProvider)} subtitle="Current filter" icon={<Filter className="text-sky-300" />} />
              <MetricCard title="Period" value={currentPeriodLabel} subtitle="Comparison window" icon={<Clock className="text-amber-300" />} />
            </div>

            <SurfaceCard
              title="Model Comparison"
              action={
                <div className="flex items-center gap-2">
                  <select
                    value={compareSortBy}
                    onChange={(e) => setCompareSortBy(e.target.value as any)}
                    className="rounded-xl border border-border/70 bg-background px-3 py-2 text-xs text-text-primary"
                  >
                    <option value="costUSD">Sort: Cost</option>
                    <option value="totalTokens">Sort: Tokens</option>
                    <option value="messageCount">Sort: Messages</option>
                    <option value="name">Sort: Name</option>
                  </select>
                  <button onClick={() => setCompareSortDir((value) => (value === "asc" ? "desc" : "asc"))} className="panel-button text-xs">
                    {compareSortDir === "asc" ? "Asc" : "Desc"}
                  </button>
                </div>
              }
            >
              {compareModels.length === 0 ? (
                <p className="text-sm text-text-secondary">No comparison data available for this period or provider.</p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  <table className="w-full text-sm">
                    <thead className="bg-background/80 text-left text-text-secondary">
                      <tr>
                        <th className="px-4 py-3">Model</th>
                        <th className="px-4 py-3">Cost</th>
                        <th className="px-4 py-3">Tokens</th>
                        <th className="px-4 py-3">Messages</th>
                        <th className="px-4 py-3">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCompareModels.map((model: any, idx: number) => {
                        const share = compareTotalCost > 0 ? Math.min(100, (Number(model.costUSD || 0) / compareTotalCost) * 100) : 0;
                        return (
                          <tr key={idx} className="border-t border-border/50 bg-surface/45">
                            <td className="px-4 py-3 font-medium">{model.name || "unknown"}</td>
                            <td className="px-4 py-3 text-emerald-400">${Number(model.costUSD || 0).toFixed(2)}</td>
                            <td className="px-4 py-3">{(((model.totalTokens || 0) / 1_000_000)).toFixed(2)}M</td>
                            <td className="px-4 py-3">{model.messageCount ?? 0}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="h-2 w-28 overflow-hidden rounded-full bg-background">
                                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-fuchsia-500" style={{ width: `${share}%` }} />
                                </div>
                                <span className="text-xs text-text-secondary">{share.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SurfaceCard>
          </div>
        )}
      </div>

      <BudgetSettings isOpen={showBudgetSettings} onClose={() => setShowBudgetSettings(false)} />
    </div>
  );
}

function TabButton({
  tab,
  activeTab,
  onClick,
}: {
  tab: TabType;
  activeTab: TabType;
  onClick: () => void;
}) {
  const meta: Record<TabType, { label: string; icon: ReactNode }> = {
    dashboard: { label: "Dashboard", icon: <Gauge className="h-4 w-4" /> },
    optimize: { label: "Optimize", icon: <Zap className="h-4 w-4" /> },
    compare: { label: "Compare", icon: <GitCompare className="h-4 w-4" /> },
  };

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors ${
        activeTab === tab ? "bg-primary text-white" : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
      }`}
    >
      {meta[tab].icon}
      {meta[tab].label}
    </button>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  highlight = false,
  loading = false,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: ReactNode;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-border/70 bg-surface/80 p-5 shadow-[0_16px_48px_rgba(0,0,0,0.25)] ${highlight ? "ring-1 ring-primary/30" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-text-secondary">{title}</span>
        {icon}
      </div>
      {loading ? (
        <>
          <div className="h-9 w-24 animate-pulse rounded-lg bg-white/8" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-white/8" />
        </>
      ) : (
        <>
          <div className="text-3xl font-semibold">{value}</div>
          <div className="mt-1 text-xs text-text-secondary">{subtitle}</div>
        </>
      )}
    </div>
  );
}

function SurfaceCard({
  title,
  children,
  icon,
  action,
  accentClass = "",
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  accentClass?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border/70 bg-surface/80 p-6 shadow-[0_16px_48px_rgba(0,0,0,0.25)] ${accentClass}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DashboardLoadingShell() {
  return (
    <>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard title="Daily Activity">
          <LoadingBlock className="h-64" />
        </SurfaceCard>
        <SurfaceCard title="Projects">
          <LoadingRows rows={5} />
        </SurfaceCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SurfaceCard title="Top Activities">
          <LoadingRows rows={6} />
        </SurfaceCard>
        <SurfaceCard title="Models Used">
          <LoadingBlock className="h-64" />
        </SurfaceCard>
      </div>

      <SurfaceCard title="Active Hours">
        <LoadingBlock className="h-52" />
      </SurfaceCard>
    </>
  );
}

function LoadingRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="rounded-xl bg-background/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <LoadingBlock className="h-4 w-2/3" />
            <LoadingBlock className="h-4 w-16" />
          </div>
          <LoadingBlock className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function LoadingBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/8 ${className ?? "h-4 w-full"}`} />;
}
