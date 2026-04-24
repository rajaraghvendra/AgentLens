"use client";

import { useEffect, useState } from "react";
import { ChartContainer } from "../../components/ChartContainer";
import { EnhancedActivityChart } from "../../components/EnhancedActivityChart";
import { EnhancedModelUsageChart } from "../../components/EnhancedModelUsageChart";
import { EnhancedCostTrendChart } from "../../components/EnhancedCostTrendChart";
import { EnhancedCacheEfficiencyChart } from "../../components/EnhancedCacheEfficiencyChart";
import { BrainCircuit, RefreshCw } from "lucide-react";

export default function ChartsDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(7);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/report?period=${period}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        setLastUpdated(new Date());
      }
    }

    fetchData();

    // Auto refresh every 30s
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [period]);

  const handleRefresh = () => {
    setLoading(true);
    // The useEffect will automatically fetch data when loading is set to true
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!data || !data.metrics) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-text-secondary mb-4 opacity-50">
            <BrainCircuit className="h-12 w-12" />
          </div>
          <h2 className="text-xl font-medium text-text-secondary">No Data Found</h2>
          <p className="text-text-secondary text-sm mt-2">Ensure your providers are configured correctly.</p>
        </div>
      </div>
    );
  }

  const { metrics } = data;
  const activities = Object.values(metrics.byActivity).sort((a: any, b: any) => b.totalTokens - a.totalTokens) as any[];

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent inline-flex items-center gap-3">
            <BrainCircuit className="text-primary h-8 w-8" />
            Charts Dashboard
          </h1>
          <p className="text-text-secondary mt-1 ml-11">Advanced visualizations for AgentLens analytics</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-surface/50 px-3 py-2 rounded-full border border-border">
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="bg-transparent text-sm focus:outline-none"
            >
              <option value="1">Today</option>
              <option value="7">7 Days</option>
              <option value="30">30 Days</option>
              <option value="90">90 Days</option>
              <option value="180">6 Months</option>
            </select>
          </div>

          <button
            onClick={handleRefresh}
            className="glass p-2 rounded-full hover:bg-border transition-colors"
            aria-label="Refresh data"
          >
            <RefreshCw className="w-4 h-4 text-text-secondary" />
          </button>
        </div>
      </header>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ChartContainer title="Activity Distribution">
          <EnhancedActivityChart data={activities} chartType="pie" />
        </ChartContainer>

        <ChartContainer title="Model Usage Comparison">
          <EnhancedModelUsageChart data={Object.values(metrics.byModel)} chartType="bar" />
        </ChartContainer>

        <ChartContainer title="Cost Trends Over Time">
          <EnhancedCostTrendChart data={data.daily || []} chartType="line" />
        </ChartContainer>

        <ChartContainer title="Cache Efficiency">
          <EnhancedCacheEfficiencyChart data={data.daily || []} chartType="area" />
        </ChartContainer>
      </div>

      {/* Additional Chart Views */}
      <div className="grid grid-cols-1 gap-8">
        <ChartContainer title="Activity Treemap View">
          <EnhancedActivityChart data={activities} chartType="treemap" />
        </ChartContainer>

        <ChartContainer title="Model Performance Composition">
          <EnhancedModelUsageChart data={Object.values(metrics.byModel)} chartType="composed" />
        </ChartContainer>
      </div>
    </div>
  );
}