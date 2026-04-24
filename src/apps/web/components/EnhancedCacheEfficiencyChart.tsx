"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, BarChart, Bar
} from "recharts";
import { useState } from "react";

interface EnhancedCacheEfficiencyChartProps {
  data: any[];
  chartType?: "area" | "line" | "bar";
}

export function EnhancedCacheEfficiencyChart({ data, chartType = "area" }: EnhancedCacheEfficiencyChartProps) {
  // Calculate cache hit rate for each day
  const chartData = data.map((item: any) => {
    const totalTokens = item.tokens || 0;
    const cacheReadTokens = item.cacheReadTokens || 0;
    const inputTokens = item.inputTokens || 0;
    const cacheHitRate = (inputTokens + cacheReadTokens) > 0
      ? (cacheReadTokens / (inputTokens + cacheReadTokens)) * 100
      : 0;

    return {
      date: item.date,
      cacheHitRate: cacheHitRate,
      tokens: totalTokens,
      cacheRead: cacheReadTokens,
      input: inputTokens,
    };
  }).filter((item: any) => item.cacheRead > 0 || item.input > 0);

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
          <p className="text-sm text-text-secondary">
            Cache Read: {(data.cacheRead / 1_000).toFixed(0)}k tokens
          </p>
          <p className="text-sm text-text-secondary">
            Input: {(data.input / 1_000).toFixed(0)}k tokens
          </p>
        </div>
      );
    }
    return null;
  };

  const renderAreaChart = () => (
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

  const renderLineChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
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
        <Line
          type="monotone"
          dataKey="cacheHitRate"
          name="Cache Hit Rate"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  const renderBarChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
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
        <Bar dataKey="cacheHitRate" name="Cache Hit Rate" fill="#8b5cf6" />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="h-full">
      {chartType === "area" && renderAreaChart()}
      {chartType === "line" && renderLineChart()}
      {chartType === "bar" && renderBarChart()}
    </div>
  );
}