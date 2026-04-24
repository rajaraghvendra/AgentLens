"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface CacheEfficiencyChartProps {
  data: any[];
}

export function CacheEfficiencyChart({ data }: CacheEfficiencyChartProps) {
  // Prepare data for the area chart
  const chartData = data.map((item: any) => ({
    date: item.date,
    cacheHitRate: item.cacheHitRate,
    tokens: item.tokens,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-card p-4 rounded-lg border border-border shadow-lg">
          <p className="font-semibold text-text-primary">{data.date}</p>
          <p className="text-sm text-text-secondary">
            Cache Hit: {data.cacheHitRate.toFixed(1)}%
          </p>
          <p className="text-sm text-text-secondary">
            {(data.tokens / 1_000_000).toFixed(2)}M tokens
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={chartData}
        margin={{
          top: 10,
          right: 30,
          left: 0,
          bottom: 0,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#94a3b8' }}
        />
        <YAxis
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(value) => `${value}%`}
          domain={[0, 100]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="cacheHitRate"
          name="Cache Hit Rate"
          stroke="#8b5cf6"
          fill="url(#colorCache)"
          fillOpacity={0.3}
        />
        <defs>
          <linearGradient id="colorCache" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1}/>
          </linearGradient>
        </defs>
      </AreaChart>
    </ResponsiveContainer>
  );
}