"use client";

import { BrainCircuit } from "lucide-react";

interface InsightsPanelProps {
  insights: string[];
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  if (insights.length === 0) {
    return null;
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <BrainCircuit className="w-5 h-5 text-accent" />
        AI Insights
      </h3>
      <div className="space-y-3">
        {insights.map((insight: string, idx: number) => (
          <div key={idx} className="p-4 rounded-xl bg-background border border-border text-sm leading-relaxed">
            <span className="mr-2 text-primary">💡</span> {insight.replace(/\*\*/g, '')}
          </div>
        ))}
      </div>
    </div>
  );
}