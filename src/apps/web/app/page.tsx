"use client";

import { useEffect, useState, useCallback } from "react";
import { 
  Activity, DollarSign, Database, BrainCircuit, Terminal, Settings, Copy, CheckCircle2, 
  Flame, TrendingUp, BarChart3, GitBranch, TerminalSquare, Code2, ChevronDown, ChevronUp, RefreshCw,
  Layers, Cpu, Zap, Calendar, Filter, X, GitCompare, Gauge, AlertTriangle, Wallet
} from "lucide-react";
import BudgetSettings from "../components/BudgetSettings";

type TabType = "dashboard" | "optimize" | "compare";

const PERIODS = [
  { label: "Today", days: 1, key: "today" },
  { label: "7 Days", days: 7, key: "7days" },
  { label: "30 Days", days: 30, key: "30days" },
  { label: "Month", days: 30, key: "month" },
  { label: "All Time", days: 365, key: "all" },
];

const PERIOD_LABELS: Record<string, string> = {
  today: "Last 24 Hours",
  "7days": "Last 7 Days",
  "30days": "Last 30 Days",
  month: "This Month",
  all: "All Time",
};

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [optimizeData, setOptimizeData] = useState<any>(null);
  const [compareData, setCompareData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [period, setPeriod] = useState("7days");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [showBudgetSettings, setShowBudgetSettings] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const params = new URLSearchParams({ period: PERIODS.find(p => p.key === period)?.days.toString() || "7" });
      if (selectedProvider !== "all") params.set("provider", selectedProvider);
      const res = await fetch(`/api/report?${params}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [period, selectedProvider]);

  const fetchOptimize = useCallback(async () => {
    try {
      const params = new URLSearchParams({ period: PERIODS.find(p => p.key === period)?.days.toString() || "7" });
      if (selectedProvider !== "all") params.set("provider", selectedProvider);
      const res = await fetch(`/api/optimize?${params}`);
      setOptimizeData(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, [period, selectedProvider]);

  const fetchCompare = useCallback(async () => {
    try {
      const params = new URLSearchParams({ period: PERIODS.find(p => p.key === period)?.days.toString() || "7" });
      if (selectedProvider !== "all") params.set("provider", selectedProvider);
      const res = await fetch(`/api/compare?${params}`);
      setCompareData(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, [period, selectedProvider]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === "optimize") fetchOptimize();
    if (activeTab === "compare") fetchCompare();
  }, [activeTab, fetchOptimize, fetchCompare]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto h-12 w-12 text-primary animate-spin" />
          <p className="text-text-secondary mt-4">Loading AgentLens data...</p>
        </div>
</div>
  );
}

// Additional sub-components and budget display
function BudgetBar({ budget, spent, currency }: { budget: number; spent: number; currency: string }) {
  const percentage = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const isOver = spent > budget && budget > 0;
  const isWarning = percentage >= 75 && percentage < 100;
  
  if (budget === 0) return null;
  
  return (
    <div className="glass-card rounded-lg p-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-text-secondary">Budget ({currency})</span>
        <span className={isOver ? "text-red-400" : "text-text-secondary"}>
          {spent.toFixed(2)} / {budget.toFixed(2)}
        </span>
      </div>
      <div className="h-2 bg-background rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all ${
            isOver ? "bg-red-500" : isWarning ? "bg-yellow-500" : "bg-primary"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs text-text-secondary mt-1 text-right">
        {percentage.toFixed(0)}% used
      </div>
    </div>
  );
}

  const { overview } = data.metrics || {};
  const providers = data.providers || [];
  const daily = data.daily || [];
  const projects = data.projects || [];
  const models = data.models || [];
  const activities = data.activities || [];
  const tools = data.tools || [];
  const commands = data.commands || [];

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent inline-flex items-center gap-3">
              <span className="bg-primary/20 p-2 rounded-lg">◊</span>
              AgentLens
            </h1>
            <p className="text-text-secondary mt-1 ml-11">AI Developer Analytics</p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* Period Switcher */}
            <div className="glass rounded-full p-1 flex gap-1">
              {PERIODS.filter(p => p.key !== "month").map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    period === p.key 
                      ? "bg-primary text-white" 
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Provider Selector */}
            <div className="relative">
              <button
                onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                className="glass rounded-full px-3 py-1.5 text-sm font-medium flex items-center gap-2 hover:bg-border/50 transition-colors"
              >
                <Filter className="w-4 h-4" />
                {selectedProvider === "all" ? "All Providers" : selectedProvider}
                <ChevronDown className="w-4 h-4" />
              </button>
              {showProviderDropdown && (
                <div className="absolute right-0 top-full mt-2 glass-card rounded-xl p-2 z-50 min-w-[160px]">
                  <button
                    onClick={() => { setSelectedProvider("all"); setShowProviderDropdown(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedProvider === "all" ? "bg-primary/20 text-primary" : "hover:bg-border"
                    }`}
                  >
                    All Providers
                  </button>
                  {providers.filter((p: any) => p.available).map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedProvider(p.id); setShowProviderDropdown(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                        selectedProvider === p.id ? "bg-primary/20 text-primary" : "hover:bg-border"
                      }`}
                    >
                      <span>{p.name}</span>
                      <span className="text-xs text-text-secondary">{p.sessionCount || 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Live Indicator */}
            <div className="glass px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${refreshing ? "bg-yellow-400 animate-pulse" : "bg-emerald-400"}`}></div>
              {PERIOD_LABELS[period]}
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setShowBudgetSettings(true)}
              className="glass p-2 rounded-full hover:bg-border/50 transition-colors"
              title="Budget Settings"
            >
              <Wallet className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </header>

        {/* Tabs Navigation */}
        <div className="flex gap-2 border-b border-border pb-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === "dashboard" 
                ? "bg-primary text-white" 
                : "text-text-secondary hover:text-text-primary hover:bg-border/50"
            }`}
          >
            <Gauge className="w-4 h-4" /> Dashboard
          </button>
          <button
            onClick={() => setActiveTab("optimize")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === "optimize" 
                ? "bg-primary text-white" 
                : "text-text-secondary hover:text-text-primary hover:bg-border/50"
            }`}
          >
            <Zap className="w-4 h-4" /> Optimize
          </button>
          <button
            onClick={() => setActiveTab("compare")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === "compare" 
                ? "bg-primary text-white" 
                : "text-text-secondary hover:text-text-primary hover:bg-border/50"
            }`}
          >
            <GitCompare className="w-4 h-4" /> Compare
          </button>
        </div>

        {activeTab === "dashboard" && (
        <>
        {/* Warning Alerts */}
        {data.findings && data.findings.length > 0 && (
          <div className="space-y-2">
            {data.findings.map((finding: any, idx: number) => (
              <div key={idx} className={`p-4 rounded-xl border flex items-start gap-3 ${
                finding.severity === 'High' ? 'border-red-500/50 bg-red-500/10' :
                finding.severity === 'Medium' ? 'border-yellow-500/50 bg-yellow-500/10' :
                'border-border bg-background/50'
              }`}>
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  finding.severity === 'High' ? 'text-red-400' : 'text-yellow-400'
                }`} />
                <div>
                  <h4 className="font-medium">{finding.title}</h4>
                  <p className="text-sm text-text-secondary mt-1">{finding.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard 
            title="Total Cost" 
            value={`$${overview?.totalCostLocal?.toFixed(2) || "0.00"}`} 
            subtitle={overview?.localCurrency || "USD"}
            icon={<DollarSign className="text-emerald-400" />}
            highlight={true}
          />
          <MetricCard 
            title="Sessions" 
            value={overview?.sessionsCount || 0} 
            subtitle={`Avg $${overview?.avgCostPerSession?.toFixed(2)}/session`}
            icon={<Activity className="text-purple-400" />}
          />
          <MetricCard 
            title="Total Tokens" 
            value={`${(overview?.totalTokens / 1_000_000).toFixed(2)}M`} 
            subtitle="Processed"
            icon={<Database className="text-blue-400" />}
          />
          <MetricCard 
            title="Cache Efficiency" 
            value={`${overview?.cacheHitRate?.toFixed(1) || 0}%`} 
            subtitle="Context hit rate"
            icon={<Zap className="text-yellow-400" />}
          />
          <MetricCard 
            title="Providers" 
            value={providers.filter((p: any) => p.available).length || 0} 
            subtitle="Active"
            icon={<Layers className="text-cyan-400" />}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Daily Chart + Projects */}
          <div className="lg:col-span-2 space-y-6">
            {/* Daily Cost Chart */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-accent" />
                  Daily Cost Breakdown
                </h3>
                <span className="text-xs text-text-secondary">
                  {daily.length} days
                </span>
              </div>
              <DailyChart data={daily} />
            </div>

            {/* Projects */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-accent" />
                  Projects
                </h3>
                <span className="text-xs text-text-secondary">
                  {projects.length} projects
                </span>
              </div>
              {projects.length === 0 ? (
                <p className="text-text-secondary text-sm">No project data available</p>
              ) : (
                <div className="space-y-2">
                  {projects.slice(0, 8).map((proj: any, idx: number) => (
                    <div key={idx}>
                      <button
                        onClick={() => setExpandedProject(expandedProject === proj.name ? null : proj.name)}
                        className="w-full flex justify-between items-center p-3 rounded-lg hover:bg-border/30 transition-colors text-left"
                      >
                        <span className="font-medium truncate">{proj.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-text-secondary">{proj.sessions} sessions</span>
                          <span className="text-emerald-400 font-medium">${proj.cost?.toFixed(2)}</span>
                          {expandedProject === proj.name ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </button>
                      {expandedProject === proj.name && (
                        <div className="ml-4 p-3 bg-background/50 rounded-lg text-sm space-y-2">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Sessions</span>
                            <span>{proj.sessions}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Avg Cost</span>
                            <span>${(proj.cost / proj.sessions).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Share</span>
                            <span>{((proj.cost / (overview?.totalCostUSD || 1)) * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity Breakdown */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-accent" />
                  Activity Breakdown
                </h3>
                <span className="text-xs text-text-secondary">13 categories</span>
              </div>
              <div className="space-y-3">
                {activities.sort((a: any, b: any) => b.cost - a.cost).slice(0, 10).map((act: any) => (
                  <div key={act.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-text-primary flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary"></span>
                        {act.name}
                      </span>
                      <div className="flex items-center gap-3 text-text-secondary">
                        <span>{act.percentage?.toFixed(1)}%</span>
                        <span className="text-emerald-400">${act.cost?.toFixed(2)}</span>
                        {act.oneShotRate > 0 && (
                          <span className="text-xs text-yellow-400" title="One-shot rate">
                            {act.oneShotRate.toFixed(0)}% 1-shot
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent" 
                        style={{ width: `${act.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Models, Tools, Commands, Findings */}
          <div className="space-y-6">
            {/* Models */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-accent" />
                  Models
                </h3>
              </div>
              <div className="space-y-3">
                {models.slice(0, 6).map((model: any) => (
                  <div key={model.id} className="p-3 bg-background/50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-sm truncate">{model.name}</span>
                      <span className="text-emerald-400 font-medium">${model.costUSD?.toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-text-secondary">
                      <div>
                        <span className="block text-text-secondary">Input</span>
                        <span>{(model.inputTokens / 1_000).toFixed(0)}k</span>
                      </div>
                      <div>
                        <span className="block text-text-secondary">Output</span>
                        <span>{(model.outputTokens / 1_000).toFixed(0)}k</span>
                      </div>
                      <div>
                        <span className="block text-text-secondary">Cache</span>
                        <span>{model.cacheHitRate?.toFixed(0)}%</span>
                      </div>
                    </div>
                    {model.isEstimated && (
                      <span className="text-xs text-yellow-500 mt-1 block">(estimated)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Core Tools */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-accent" />
                  Core Tools
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tools.slice(0, 8).map((tool: any) => (
                  <div key={tool.name} className="p-2 bg-background/50 rounded-lg text-center">
                    <div className="font-medium text-sm">{tool.name}</div>
                    <div className="text-xs text-text-secondary">{tool.count}x</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Shell Commands */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TerminalSquare className="w-5 h-5 text-accent" />
                  Top Commands
                </h3>
              </div>
              <div className="space-y-1">
                {commands.slice(0, 6).map((cmd: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center p-2 bg-background/30 rounded text-sm">
                    <code className="text-primary truncate mr-2">{cmd.command}</code>
                    <span className="text-text-secondary text-xs">{cmd.count}x</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Optimizer Findings */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-accent" />
                  Optimizer Findings
                </h3>
                <span className="text-xs text-text-secondary">{data.findings?.length || 0}</span>
              </div>
              
              {(!data.findings || data.findings.length === 0) ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500 mb-4 opacity-80" />
                  <p className="text-text-secondary text-sm">Your sessions are highly optimized.</p>
                  <p className="text-text-secondary text-xs mt-1">No waste detected.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.findings.map((finding: any, idx: number) => (
                    <div 
                      key={idx} 
                      className="p-4 rounded-xl border-l-4 bg-background/50"
                      style={{ borderLeftColor: 
                        finding.severity === 'High' ? '#ef4444' : 
                        finding.severity === 'Medium' ? '#eab308' : '#3b82f6'
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-sm">{finding.title}</h4>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                          finding.severity === 'High' ? 'bg-red-500/20 text-red-400' : 
                          finding.severity === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' : 
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {finding.severity}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary mb-3">{finding.description}</p>
                      <div className="bg-background rounded-lg p-2 text-xs font-mono text-emerald-400 flex items-center justify-between">
                        <span className="truncate mr-2">{finding.suggestedFix}</span>
                        <button 
                          onClick={() => handleCopy(finding.suggestedFix)}
                          className="p-1 hover:bg-border rounded flex-shrink-0 transition-colors"
                        >
                          {copied === finding.suggestedFix ? 
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : 
                            <Copy className="w-3 h-3 text-text-secondary" />
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Insights */}
            {data.insights?.length > 0 && (
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Flame className="w-5 h-5 text-accent" />
                  AI Insights
                </h3>
                <div className="space-y-2">
                  {data.insights.map((insight: string, idx: number) => (
                    <div key={idx} className="p-3 rounded-lg bg-background/50 text-sm flex items-start gap-2">
                      <span className="text-primary">💡</span>
                      <span className="text-text-secondary">{insight.replace(/\*\*/g, '')}</span>
                    </div>
                  ))}
                </div>
              </div>
)}
        </div>
      </div>

      {/* Budget Settings Modal - rendered as sibling to main content */}
      <BudgetSettings isOpen={showBudgetSettings} onClose={() => setShowBudgetSettings(false)} />
    </div>
  );
}

// Budget bar display component - used inside dashboard
function BudgetBar({ budget, spent, currency }: { budget: number; spent: number; currency: string }) {
  const percentage = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const isOver = spent > budget && budget > 0;
  const isWarning = percentage >= 75 && percentage < 100;
  
  if (budget === 0) return null;
  
  return (
    <div className="glass-card rounded-lg p-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-text-secondary">Budget ({currency})</span>
        <span className={isOver ? "text-red-400" : "text-text-secondary"}>
          {spent.toFixed(2)} / {budget.toFixed(2)}
        </span>
      </div>
      <div className="h-2 bg-background rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all ${
            isOver ? "bg-red-500" : isWarning ? "bg-yellow-500" : "bg-primary"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs text-text-secondary mt-1 text-right">
        {percentage.toFixed(0)}% used
      </div>
    </div>
  );
}