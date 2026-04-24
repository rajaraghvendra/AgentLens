"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface CostTrendChartProps {
  data: any[];
}

export function CostTrendChart({ data }: CostTrendChartProps) {
  // Prepare data for the line chart
  const chartData = data.map((item: any) => ({
    date: item.date,
    cost: item.costUSD,
    sessions: item.sessions,
    tokens: item.tokens,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-card p-4 rounded-lg border border-border shadow-lg">
          <p className="font-semibold text-text-primary">{data.date}</p>
          <p className="text-sm text-text-secondary">
            Cost: ${data.cost.toFixed(2)}
          </p>
          <p className="text-sm text-text-secondary">
            {data.sessions} sessions
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
      <LineChart
        data={chartData}
        margin={{
          top: 20,
          right: 30,
          left: 20,
          bottom: 20,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#94a3b8' }}
        />
        <YAxis
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(value) => `$${value}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line
          type="monotone"
          dataKey="cost"
          name="Cost (USD)"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}