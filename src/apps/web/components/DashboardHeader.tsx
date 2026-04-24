"use client";

import { useState } from "react";
import { BrainCircuit, Calendar, RefreshCw } from "lucide-react";

interface DashboardHeaderProps {
  lastUpdated: Date;
  onRefresh: () => void;
  period: number;
  onPeriodChange: (days: number) => void;
}

export function DashboardHeader({
  lastUpdated,
  onRefresh,
  period,
  onPeriodChange
}: DashboardHeaderProps) {
  const periodLabels: Record<number, string> = {
    1: "Today",
    7: "7 Days",
    30: "30 Days",
    90: "90 Days",
    180: "6 Months",
  };

  const formatDate = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent inline-flex items-center gap-3">
          <BrainCircuit className="text-primary h-8 w-8" />
          AgentLens
        </h1>
        <p className="text-text-secondary mt-1 ml-11">Local-first AI Developer Analytics</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 bg-surface/50 px-3 py-2 rounded-full border border-border">
          <Calendar className="w-4 h-4 text-text-secondary" />
          <select
            value={period}
            onChange={(e) => onPeriodChange(Number(e.target.value))}
            className="bg-transparent text-sm focus:outline-none"
          >
            {Object.entries(periodLabels).map(([days, label]) => (
              <option key={days} value={days}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="glass px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            Live Tracking
          </div>
          <button
            onClick={onRefresh}
            className="glass p-2 rounded-full hover:bg-border transition-colors"
            aria-label="Refresh data"
          >
            <RefreshCw className="w-4 h-4 text-text-secondary" />
          </button>
        </div>
      </div>
    </header>
  );
}