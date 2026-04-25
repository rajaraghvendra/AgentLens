"use client";

import { DollarSign, Database, Activity, Settings, BellRing } from "lucide-react";
import { MetricCard } from "./MetricCard";

interface MetricsGridProps {
  overview: any;
}

export function MetricsGrid({ overview }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <MetricCard
        title="Total Spending"
        value={`$${overview.totalCostLocal.toFixed(2)}`}
        subtitle={overview.localCurrency}
        icon={<DollarSign className="text-emerald-400" />}
      />
      {overview.budgetUSD > 0 && (
        <MetricCard
          title="Budget Utilization"
          value={`${((overview.totalCostUSD / overview.budgetUSD) * 100).toFixed(1)}%`}
          subtitle={`$${overview.totalCostUSD.toFixed(2)} / $${overview.budgetUSD.toFixed(2)}`}
          icon={<BellRing className={overview.totalCostUSD >= overview.budgetUSD * 0.9 ? "text-red-400 animate-bounce" : "text-emerald-400"} />}
        />
      )}
      <MetricCard
        title="Total Tokens"
        value={`${(overview.totalTokens / 1_000_000).toFixed(2)}M`}
        subtitle="Processed locally"
        icon={<Database className="text-blue-400" />}
      />
      <MetricCard
        title="Active Sessions"
        value={overview.sessionsCount}
        subtitle={`Avg $${overview.avgCostPerSession.toFixed(2)}/session`}
        icon={<Activity className="text-primary-400" />}
      />
      <MetricCard
        title="Cache Efficiency"
        value={`${overview.cacheHitRate.toFixed(1)}%`}
        subtitle="Context hit rate"
        icon={<Settings className="text-orange-400" />}
      />
    </div>
  );
}