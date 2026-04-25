"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface HourlyData {
  hour: string;
  messages: number;
  tokens: number;
  costUSD: number;
}

interface ActiveHoursChartProps {
  hourly: Record<string, { messages: number; tokens: number; costUSD: number }>;
}

export default function ActiveHoursChart({ hourly }: ActiveHoursChartProps) {
  const data: HourlyData[] = Object.entries(hourly).map(([hour, values]) => ({
    hour,
    messages: values.messages,
    tokens: values.tokens,
    costUSD: values.costUSD,
  })).sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

  const maxMessages = Math.max(...data.map(d => d.messages), 1);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <XAxis 
          dataKey="hour" 
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={{ stroke: '#334155' }}
        />
        <YAxis 
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={{ stroke: '#334155' }}
        />
        <Tooltip
          contentStyle={{ 
            backgroundColor: '#1e293b', 
            border: '1px solid #334155', 
            borderRadius: '8px',
            fontSize: '12px'
          }}
          labelStyle={{ color: '#fff' }}
          formatter={(value: number) => [value.toString(), 'Messages']}
          labelFormatter={(label) => `Hour: ${label}:00`}
        />
        <Bar dataKey="messages" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => {
            const intensity = entry.messages / maxMessages;
            const hue = 250; // Purple hue
            const saturation = 70;
            const lightness = Math.max(20, Math.min(60, 70 - intensity * 50));
            return <Cell key={entry.hour} fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}