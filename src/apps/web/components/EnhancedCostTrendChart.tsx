"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, BarChart, Bar,
  ResponsiveContainer
} from "recharts";
import { useState } from "react";

interface EnhancedCostTrendChartProps {
  data: any[];
  chartType?: "line" | "area" | "bar";
}

export function EnhancedCostTrendChart({ data, chartType = "line" }: EnhancedCostTrendChartProps) {
  // Prepare data for charts
  const chartData = data.map((item: any) => ({
    date: item.date,
    cost: item.costUSD,
    sessions: item.sessions,
    tokens: item.tokens,
    avgCostPerSession: item.sessions > 0 ? item.costUSD / item.sessions : 0,
  })).filter((item: any) => item.cost > 0);

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
          <p className="text-sm text-text-secondary">
            Avg: ${(data.avgCostPerSession || 0).toFixed(2)}/session
          </p>
        </div>
      );
    }
    return null;
  };

  const renderLineChart = () => (
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

  const renderAreaChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
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
        <Area
          type="monotone"
          dataKey="cost"
          name="Cost (USD)"
          stroke="#10b981"
          fill="url(#colorCost)"
          fillOpacity={0.3}
        />
        <defs>
          <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
          </linearGradient>
        </defs>
      </AreaChart>
    </ResponsiveContainer>
  );

  const renderBarChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
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
        <Bar dataKey="cost" name="Cost (USD)" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="h-full">
      {chartType === "line" && renderLineChart()}
      {chartType === "area" && renderAreaChart()}
      {chartType === "bar" && renderBarChart()}
    </div>
  );
}