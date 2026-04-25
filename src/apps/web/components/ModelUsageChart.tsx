"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

interface ModelUsageChartProps {
  data: any[];
}

const COLORS = [
  "#22d3ee", // cyan
  "#06b6d4", // cyan-500
  "#0891b2", // cyan-600
  "#14b8a6", // teal
  "#0d9488", // teal-600
  "#22d3a2", // emerald-300
  "#34d399", // emerald
  "#10b981", // emerald-500
];

export function ModelUsageChart({ data }: ModelUsageChartProps) {
  // Prepare data for the bar chart
  const chartData = data.map((item: any) => ({
    name: item.model || "Unknown",
    tokens: item.totalTokens,
    cost: item.costUSD,
    messages: item.messageCount,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-card p-4 rounded-lg border border-border shadow-lg">
          <p className="font-semibold text-text-primary">{data.name}</p>
          <p className="text-sm text-text-secondary">
            {(data.tokens / 1_000_000).toFixed(2)}M tokens
          </p>
          <p className="text-sm text-text-secondary">
            ${data.cost.toFixed(2)} cost
          </p>
          <p className="text-sm text-text-secondary">
            {data.messages} messages
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{
          top: 20,
          right: 30,
          left: 20,
          bottom: 60,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="name"
          angle={-45}
          textAnchor="end"
          height={60}
          tick={{ fill: '#94a3b8' }}
        />
        <YAxis
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(value) => `${(value / 1_000_000).toFixed(1)}M`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="tokens" name="Tokens">
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}