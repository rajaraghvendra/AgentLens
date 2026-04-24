"use client";

import { useEffect, useState } from "react";
import { DashboardHeader } from "../../components/DashboardHeader";
import { MetricsGrid } from "../../components/MetricsGrid";
import { ChartContainer } from "../../components/ChartContainer";
import { EnhancedActivityChart } from "../../components/EnhancedActivityChart";
import { EnhancedModelUsageChart } from "../../components/EnhancedModelUsageChart";
import { EnhancedCostTrendChart } from "../../components/EnhancedCostTrendChart";
import { EnhancedCacheEfficiencyChart } from "../../components/EnhancedCacheEfficiencyChart";
import { OptimizationFindings } from "../../components/OptimizationFindings";
import { InsightsPanel } from "../../components/InsightsPanel";
import { ActivityBreakdown } from "../../components/ActivityBreakdown";
import { BrainCircuit } from "lucide-react";

export default function EnhancedDashboard() {
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

  const { metrics, findings, insights } = data;
  const activities = Object.values(metrics.byActivity).sort((a: any, b: any) => b.totalTokens - a.totalTokens) as any[];

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      <DashboardHeader
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
        period={period}
        onPeriodChange={setPeriod}
      />

      <MetricsGrid overview={metrics.overview} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ChartContainer title="Activity Distribution">
          <EnhancedActivityChart data={activities} chartType="pie" />
        </ChartContainer>

        <ChartContainer title="Model Usage">
          <EnhancedModelUsageChart data={Object.values(metrics.byModel)} chartType="bar" />
        </ChartContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <ChartContainer title="Cost Trends">
            <EnhancedCostTrendChart data={data.daily || []} chartType="line" />
          </ChartContainer>

          <ActivityBreakdown activities={activities} />
        </div>

        <div className="space-y-6">
          <ChartContainer title="Cache Efficiency">
            <EnhancedCacheEfficiencyChart data={data.daily || []} chartType="area" />
          </ChartContainer>

          <OptimizationFindings findings={findings} />

          <InsightsPanel insights={insights} />
        </div>
      </div>
    </div>
  );
}