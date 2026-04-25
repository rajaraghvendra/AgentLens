"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Activity, ChevronDown, Cpu, Database, DollarSign, Filter, Gauge, GitBranch, GitCompare, RefreshCw, TerminalSquare, Wallet, Wrench, Zap, Clock } from "lucide-react";
import BudgetSettings from "../components/BudgetSettings";
import { CostTrendChart } from "../components/CostTrendChart";
import { ActivityBreakdown } from "../components/ActivityBreakdown";
import { ModelUsageChart } from "../components/ModelUsageChart";
import { OptimizationFindings } from "../components/OptimizationFindings";
import ActiveHoursChart from "../components/ActiveHoursChart";
import { InsightsPanel } from "../components/InsightsPanel";

type TabType = "dashboard" | "optimize" | "compare";

type ReportResponse = {
  metrics?: {
    byActivity?: Record<string, any>;
    byModel?: Record<string, any>;
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
};

const PERIODS = [
  { label: "Today", days: 1, key: "today" },
  { label: "7 Days", days: 7, key: "7days" },
  { label: "30 Days", days: 30, key: "30days" },
  { label: "All Time", days: 365, key: "all" },
] as const;

export default function Dashboard() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [optimizeData, setOptimizeData] = useState<any>(null);
  const [compareData, setCompareData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<string>("7days");
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [showBudgetSettings, setShowBudgetSettings] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [compareSortBy, setCompareSortBy] = useState<"name" | "costUSD" | "totalTokens" | "messageCount">("costUSD");
  const [compareSortDir, setCompareSortDir] = useState<"asc" | "desc">("desc");

  const fetchReport = useCallback(async () => {
    setRefreshing(true);
    try {
      const selected = PERIODS.find(p => p.key === period);
      const params = new URLSearchParams({ period: String(selected?.days ?? 7) });
      if (selectedProvider !== "all") params.set("provider", selectedProvider);
      const res = await fetch(`/api/report?${params.toString()}`);
      setReport(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, selectedProvider]);

  const fetchOptimize = useCallback(async () => {
    const selected = PERIODS.find(p => p.key === period);
    const params = new URLSearchParams({ period: String(selected?.days ?? 7) });
    if (selectedProvider !== "all") params.set("provider", selectedProvider);
    const res = await fetch(`/api/optimize?${params.toString()}`);
    setOptimizeData(await res.json());
  }, [period, selectedProvider]);

  const fetchCompare = useCallback(async () => {
    const selected = PERIODS.find(p => p.key === period);
    const params = new URLSearchParams({ period: String(selected?.days ?? 7) });
    if (selectedProvider !== "all") params.set("provider", selectedProvider);
    const res = await fetch(`/api/compare?${params.toString()}`);
    setCompareData(await res.json());
  }, [period, selectedProvider]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    if (activeTab === "optimize") void fetchOptimize();
    if (activeTab === "compare") void fetchCompare();
  }, [activeTab, fetchOptimize, fetchCompare]);

  if (loading || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto h-12 w-12 text-primary animate-spin" />
          <p className="text-text-secondary mt-4">Loading AgentLens data...</p>
        </div>
      </div>
    );
  }

  const overview = report.metrics?.overview ?? {};
  const hourly = report.metrics?.hourly ?? {};
  const findings = report.findings ?? [];
  const activities = Object.values(report.metrics?.byActivity ?? {}).sort((a: any, b: any) => b.costUSD - a.costUSD);
  const models = Object.values(report.metrics?.byModel ?? {}).sort((a: any, b: any) => b.costUSD - a.costUSD);
  const daily = report.daily ?? [];
  const projects = report.projects ?? [];
  const providers = report.providers ?? [];
  const tools = report.tools ?? [];
  const commands = report.commands ?? [];
  const insights = report.insights ?? [];
  const optimizeFindings = optimizeData?.findings ?? [];
  const optimizeInsights = optimizeData?.insights ?? [];
  const optimizeHealthScore = optimizeData?.healthScore;
  const optimizeHealthGrade = optimizeData?.healthGrade;
  const compareModels = compareData?.models ?? [];
  const compareTotalCost = compareData?.totalCostUSD ?? 0;
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
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">AgentLens</h1>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-sm ${period === p.key ? "bg-primary text-white" : "glass"}`}
              >
                {p.label}
              </button>
            ))}
            <div className="relative">
              <button
                onClick={() => setShowProviderDropdown(v => !v)}
                className="glass px-3 py-1.5 rounded-lg text-sm inline-flex items-center gap-2"
              >
                <Filter className="w-4 h-4" />
                {selectedProvider === "all" ? "All Providers" : selectedProvider}
                <ChevronDown className="w-4 h-4" />
              </button>
              {showProviderDropdown && (
                <div className="absolute right-0 top-full mt-2 z-20 min-w-[180px] glass-card rounded-xl p-2">
                  <button
                    onClick={() => {
                      setSelectedProvider("all");
                      setShowProviderDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                      selectedProvider === "all" ? "bg-primary/20 text-primary" : "hover:bg-border/50"
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
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                        selectedProvider === provider.id ? "bg-primary/20 text-primary" : "hover:bg-border/50"
                      }`}
                    >
                      {provider.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedProvider("all")}
                className={`px-2 py-1 rounded-full text-xs ${selectedProvider === "all" ? "bg-primary text-white" : "glass"}`}
              >
                all
              </button>
              {providers.slice(0, 6).map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => setSelectedProvider(provider.id)}
                    className={`px-2 py-1 rounded-full text-xs ${
                      selectedProvider === provider.id ? "bg-primary text-white" : "glass"
                    }`}
                    title={provider.name}
                  >
                    {provider.id}
                  </button>
                ))}
            </div>
            <button
              onClick={() => void fetchReport()}
              className="glass p-2 rounded-full hover:bg-border/50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 text-text-secondary ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowBudgetSettings(true)}
              className="glass p-2 rounded-full hover:bg-border/50 transition-colors"
              title="Budget Settings"
            >
              <Wallet className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </header>

        <div className="flex gap-2 border-b border-border pb-2">
          <button onClick={() => setActiveTab("dashboard")} className={`px-4 py-2 rounded-lg ${activeTab === "dashboard" ? "bg-primary text-white" : "hover:bg-border/50"}`}>
            <Gauge className="w-4 h-4 inline mr-2" /> Dashboard
          </button>
          <button onClick={() => setActiveTab("optimize")} className={`px-4 py-2 rounded-lg ${activeTab === "optimize" ? "bg-primary text-white" : "hover:bg-border/50"}`}>
            <Zap className="w-4 h-4 inline mr-2" /> Optimize
          </button>
          <button onClick={() => setActiveTab("compare")} className={`px-4 py-2 rounded-lg ${activeTab === "compare" ? "bg-primary text-white" : "hover:bg-border/50"}`}>
            <GitCompare className="w-4 h-4 inline mr-2" /> Compare
          </button>
        </div>

        {activeTab === "dashboard" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard title="Total Cost" value={`$${(overview.totalCostLocal ?? 0).toFixed(2)}`} subtitle={overview.localCurrency ?? "USD"} icon={<DollarSign className="text-emerald-400" />} highlight />
              <MetricCard title="Sessions" value={overview.sessionsCount ?? 0} subtitle={`Avg $${(overview.avgCostPerSession ?? 0).toFixed(2)}/session`} icon={<Activity className="text-purple-400" />} />
              <MetricCard title="Total Tokens" value={`${(((overview.totalTokens ?? 0) / 1_000_000).toFixed(2))}M`} subtitle="Processed" icon={<Database className="text-blue-400" />} />
              <MetricCard title="Cache Efficiency" value={(overview.cacheHitRate ?? 0) > 0 ? `${(overview.cacheHitRate ?? 0).toFixed(1)}%` : "N/A"} subtitle={refreshing ? "Refreshing..." : "Context hit rate"} icon={<Zap className="text-yellow-400" />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Daily Cost Trend</h3>
                <div className="h-64">
                  <CostTrendChart data={daily} />
                </div>
              </div>
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-accent" />
                  Projects
                </h3>
                <div className="space-y-2 max-h-64 overflow-auto pr-1">
                  {projects.slice(0, 10).map((proj, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-background/40 border border-border/40">
                      <div className="font-medium text-sm truncate">{proj.name}</div>
                      <div className="text-xs text-text-secondary">{proj.sessions} sessions • ${proj.cost.toFixed(2)}</div>
                    </div>
                  ))}
                  {projects.length === 0 && <p className="text-xs text-text-secondary">No project data available.</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 glass-card rounded-2xl p-6">
                <ActivityBreakdown activities={activities.slice(0, 10)} />
              </div>
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-accent" />
                  Model Usage
                </h3>
                <div className="h-64">
                  <ModelUsageChart data={models.slice(0, 8)} />
                </div>
              </div>
            </div>

            {/* Active Hours Chart */}
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent" />
                Active Hours
              </h3>
              <p className="text-sm text-text-secondary mb-4">When you're most productive — optimize your AI sessions based on activity patterns.</p>
              <div className="h-48">
                <ActiveHoursChart hourly={hourly} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-accent" />
                  Top Tools
                </h3>
                <div className="space-y-2">
                  {tools.slice(0, 8).map((tool, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-background/40 text-sm">
                      <span>{tool.name}</span>
                      <span className="text-text-secondary">{tool.count}x</span>
                    </div>
                  ))}
                  {tools.length === 0 && <p className="text-xs text-text-secondary">No tool usage data available.</p>}
                </div>
              </div>
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TerminalSquare className="w-4 h-4 text-accent" />
                  Top Commands
                </h3>
                <div className="space-y-2">
                  {commands.slice(0, 8).map((cmd, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-background/40 text-sm gap-3">
                      <code className="truncate">{cmd.command}</code>
                      <span className="text-text-secondary shrink-0">{cmd.count}x</span>
                    </div>
                  ))}
                  {commands.length === 0 && <p className="text-xs text-text-secondary">No command data available.</p>}
                </div>
              </div>
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Providers</h3>
                <div className="space-y-2">
                  {providers.map((provider, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-background/40 text-sm">
                      <span>{provider.name}</span>
                      <span className={provider.available ? "text-emerald-400" : "text-text-secondary"}>
                        {provider.sessionCount ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-3">Findings</h3>
                {findings.length === 0 ? (
                  <p className="text-text-secondary text-sm">No findings available.</p>
                ) : (
                  <div className="space-y-3">
                    {findings.map((f, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-background/40 border border-border/60">
                        <div className="font-medium">{f.title} <span className="text-xs text-text-secondary">({f.severity})</span></div>
                        <p className="text-sm text-text-secondary mt-1">{f.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-3">Insights</h3>
                {insights.length === 0 ? (
                  <p className="text-text-secondary text-sm">No insights available.</p>
                ) : (
                  <div className="space-y-2">
                    {insights.map((insight, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-background/40 text-sm">
                        {insight.replace(/\*\*/g, "")}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "optimize" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard
                title="Health Score"
                value={typeof optimizeHealthScore === "number" ? optimizeHealthScore : "--"}
                subtitle="Overall optimization score"
                icon={<Zap className="text-yellow-400" />}
                highlight
              />
              <MetricCard
                title="Health Grade"
                value={optimizeHealthGrade ?? "--"}
                subtitle="A (best) to F (worst)"
                icon={<Activity className="text-purple-400" />}
              />
              <MetricCard
                title="Findings"
                value={optimizeFindings.length}
                subtitle="Total inefficiency findings"
                icon={<Wrench className="text-cyan-400" />}
              />
            </div>
            <OptimizationFindings findings={optimizeFindings} />
            <InsightsPanel insights={optimizeInsights} />
          </div>
        )}

        {activeTab === "compare" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard
                title="Models Compared"
                value={compareModels.length}
                subtitle="Model entries in current period"
                icon={<Cpu className="text-accent" />}
                highlight
              />
              <MetricCard
                title="Total Model Cost"
                value={`$${Number(compareTotalCost || 0).toFixed(2)}`}
                subtitle="Combined model spend"
                icon={<DollarSign className="text-emerald-400" />}
              />
              <MetricCard
                title="Selected Provider"
                value={selectedProvider === "all" ? "All" : selectedProvider}
                subtitle="Current comparison filter"
                icon={<Filter className="text-blue-400" />}
              />
            </div>

            <div className="glass-card rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold">Model Comparison Table</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={compareSortBy}
                    onChange={(e) => setCompareSortBy(e.target.value as any)}
                    className="bg-background border border-border rounded-lg px-2 py-1 text-xs"
                  >
                    <option value="costUSD">Sort: Cost</option>
                    <option value="totalTokens">Sort: Tokens</option>
                    <option value="messageCount">Sort: Messages</option>
                    <option value="name">Sort: Name</option>
                  </select>
                  <button
                    onClick={() => setCompareSortDir(d => (d === "asc" ? "desc" : "asc"))}
                    className="glass px-2 py-1 rounded-lg text-xs"
                  >
                    {compareSortDir === "asc" ? "Asc" : "Desc"}
                  </button>
                </div>
              </div>
              {compareModels.length === 0 ? (
                <p className="text-text-secondary text-sm">No comparison data available for this period/provider.</p>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-secondary border-b border-border">
                        <th className="py-2 pr-3">Model</th>
                        <th className="py-2 pr-3">Cost</th>
                        <th className="py-2 pr-3">Tokens</th>
                        <th className="py-2 pr-3">Messages</th>
                        <th className="py-2 pr-3">Cache In</th>
                        <th className="py-2 pr-3">Est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCompareModels.map((model: any, idx: number) => (
                        <tr key={idx} className="border-b border-border/40">
                          <td className="py-2 pr-3">{model.name || "unknown"}</td>
                          <td className="py-2 pr-3">${Number(model.costUSD || 0).toFixed(2)}</td>
                          <td className="py-2 pr-3">{(((model.totalTokens || 0) / 1_000_000)).toFixed(2)}M</td>
                          <td className="py-2 pr-3">{model.messageCount ?? 0}</td>
                          <td className="py-2 pr-3">{(((model.cacheHitTokens || 0) / 1_000)).toFixed(0)}k</td>
                          <td className="py-2 pr-3">{model.isEstimated ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <BudgetSettings isOpen={showBudgetSettings} onClose={() => setShowBudgetSettings(false)} />
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  highlight = false,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`glass-card rounded-2xl p-4 ${highlight ? "ring-1 ring-primary/30" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-secondary">{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-text-secondary mt-1">{subtitle}</div>
    </div>
  );
}