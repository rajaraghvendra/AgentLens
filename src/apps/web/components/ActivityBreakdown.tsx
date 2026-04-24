"use client";

import { Activity } from "lucide-react";

interface ActivityBreakdownProps {
  activities: any[];
}

export function ActivityBreakdown({ activities }: ActivityBreakdownProps) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
        <Activity className="w-5 h-5 text-accent" />
        Activity Breakdown
      </h3>
      <div className="space-y-4">
        {activities.map((act: any) => (
          <div key={act.category}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-text-primary">{act.category}</span>
              <span className="text-text-secondary">{act.percentage.toFixed(1)}% (${act.costUSD.toFixed(2)})</span>
            </div>
            <div className="w-full bg-border rounded-full h-2.5 overflow-hidden">
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-primary to-accent"
                style={{ width: `${act.percentage}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}