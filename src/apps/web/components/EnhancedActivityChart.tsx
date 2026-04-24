"use client";

import {
  PieChart, Pie, Cell as RechartsCell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Treemap, Cell as BarCell
} from "recharts";
import { useState } from "react";

interface EnhancedActivityChartProps {
  data: any[];
  chartType?: "pie" | "bar" | "treemap";
}

const COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f59e0b", // amber
  "#10b981", // emerald
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#d946ef", // fuchsia
  "#f97316", // orange
  "#22d3ee", // cyan
  "#818cf8", // light indigo
  "#c084fc", // light purple
];

export function EnhancedActivityChart({ data, chartType = "pie" }: EnhancedActivityChartProps) {
  // Prepare data for charts
  const chartData = data.map((item: any) => ({
    name: item.category,
    value: item.percentage,
    tokens: item.totalTokens,
    cost: item.costUSD,
    oneShotRate: item.oneShotRate || 0,
  })).filter((item: any) => item.value > 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-card p-4 rounded-lg border border-border shadow-lg">
          <p className="font-semibold text-text-primary">{data.name}</p>
          <p className="text-sm text-text-secondary">
            {data.value.toFixed(1)}% of activity
          </p>
          <p className="text-sm text-text-secondary">
            {(data.tokens / 1_000_000).toFixed(2)}M tokens
          </p>
          <p className="text-sm text-text-secondary">
            ${data.cost.toFixed(2)} cost
          </p>
          {data.oneShotRate > 0 && (
            <p className="text-sm text-text-secondary">
              {data.oneShotRate.toFixed(0)}% one-shot rate
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const renderPieChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={true}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
        >
          {chartData.map((entry, index) => (
            <RechartsCell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend />
      </PieChart>
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
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="value" name="Percentage" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderTreemap = () => (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap
        data={chartData}
        dataKey="value"
        aspectRatio={4 / 3}
        stroke="#fff"
        fill="#8884d8"
        content={({ depth, x, y, width, height, index, payload, colors, rank, name }) => (
          <g>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill={COLORS[index % COLORS.length]}
              stroke="#fff"
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              fill="#fff"
              fontSize={12}
            >
              {name}
            </text>
          </g>
        )}
      >
        <Tooltip content={<CustomTooltip />} />
      </Treemap>
    </ResponsiveContainer>
  );

  return (
    <div className="h-full">
      {chartType === "pie" && renderPieChart()}
      {chartType === "bar" && renderBarChart()}
      {chartType === "treemap" && renderTreemap()}
    </div>
  );
}