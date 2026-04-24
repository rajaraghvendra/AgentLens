"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ComposedChart, Line, Area, Scatter,
  ResponsiveContainer, Cell as RechartsCell, ScatterChart
} from "recharts";
import { useState } from "react";

interface EnhancedModelUsageChartProps {
  data: any[];
  chartType?: "bar" | "composed" | "scatter";
}

const COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f59e0b", // amber
  "#10b981", // emerald
  "#0ea5e9", // sky
];

export function EnhancedModelUsageChart({ data, chartType = "bar" }: EnhancedModelUsageChartProps) {
  // Prepare data for charts
  const chartData = data.map((item: any) => ({
    name: item.model || "Unknown",
    tokens: item.totalTokens,
    cost: item.costUSD,
    messages: item.messageCount,
    cacheRead: item.cacheReadTokens || 0,
    cacheWrite: item.cacheWriteTokens || 0,
    input: item.inputTokens || 0,
    output: item.outputTokens || 0,
  })).filter((item: any) => item.tokens > 0);

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
          <p className="text-sm text-text-secondary">
            Cache Read: {(data.cacheRead / 1_000).toFixed(0)}k tokens
          </p>
          <p className="text-sm text-text-secondary">
            Cache Write: {(data.cacheWrite / 1_000).toFixed(0)}k tokens
          </p>
        </div>
      );
    }
    return null;
  };

  const renderBarChart = () => (
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
        <Bar dataKey="tokens" name="Tokens" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderComposedChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
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
          yAxisId="left"
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(value) => `${(value / 1_000_000).toFixed(1)}M`}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(value) => `$${value}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar yAxisId="left" dataKey="tokens" name="Tokens" fill="#8884d8" />
        <Line yAxisId="right" type="monotone" dataKey="cost" name="Cost" stroke="#f59e0b" />
      </ComposedChart>
    </ResponsiveContainer>
  );

  const renderScatterChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart
        margin={{
          top: 20,
          right: 20,
          bottom: 20,
          left: 40,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          type="number"
          dataKey="tokens"
          name="Tokens"
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(value) => `${(value / 1_000_000).toFixed(1)}M`}
        />
        <YAxis
          type="number"
          dataKey="cost"
          name="Cost"
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(value) => `$${value}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Scatter name="Models" data={chartData} fill="#8884d8">
          {chartData.map((entry, index) => (
            <RechartsCell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );

  return (
    <div className="h-full">
      {chartType === "bar" && renderBarChart()}
      {chartType === "composed" && renderComposedChart()}
      {chartType === "scatter" && renderScatterChart()}
    </div>
  );
}