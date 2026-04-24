"use client";

import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

interface ChartContainerProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function ChartContainer({
  title,
  children,
  className = "",
  fullscreen = false,
  onToggleFullscreen
}: ChartContainerProps) {
  return (
    <div className={`glass-card rounded-2xl p-6 ${className}`}>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="p-2 hover:bg-border rounded-lg transition-colors"
            aria-label={fullscreen ? "Minimize" : "Maximize"}
          >
            {fullscreen ? (
              <Minimize2 className="w-4 h-4 text-text-secondary" />
            ) : (
              <Maximize2 className="w-4 h-4 text-text-secondary" />
            )}
          </button>
        )}
      </div>
      <div className={fullscreen ? "h-[600px]" : "h-80"}>
        {children}
      </div>
    </div>
  );
}