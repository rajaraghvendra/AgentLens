"use client";

import { Terminal, Copy, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface OptimizationFindingsProps {
  findings: any[];
}

export function OptimizationFindings({ findings }: OptimizationFindingsProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "High": return "#ef4444";
      case "Medium": return "#eab308";
      case "Low": return "#3b82f6";
      default: return "#94a3b8";
    }
  };

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case "High": return "bg-red-500/20";
      case "Medium": return "bg-yellow-500/20";
      case "Low": return "bg-blue-500/20";
      default: return "bg-gray-500/20";
    }
  };

  const getSeverityText = (severity: string) => {
    switch (severity) {
      case "High": return "text-red-400";
      case "Medium": return "text-yellow-400";
      case "Low": return "text-blue-400";
      default: return "text-gray-400";
    }
  };

  if (findings.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-text-secondary">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500 mb-4 opacity-80" />
        <p>Your sessions are highly optimized. No waste detected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {findings.map((finding: any, idx: number) => (
        <div
          key={idx}
          className="glass-card rounded-2xl p-5 border-l-4"
          style={{
            borderLeftColor: getSeverityColor(finding.severity)
          }}
        >
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-semibold text-text-primary">{finding.title}</h4>
            <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${getSeverityBg(finding.severity)} ${getSeverityText(finding.severity)}`}>
              {finding.severity}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-4 leading-relaxed">{finding.description}</p>
          <div className="bg-background rounded-lg p-3 text-xs font-mono text-emerald-400 flex items-center justify-between border border-border">
            <span className="truncate mr-4">{finding.suggestedFix}</span>
            <button
              onClick={() => handleCopy(finding.suggestedFix)}
              className="p-1.5 hover:bg-border rounded flex-shrink-0 transition-colors"
            >
              {copied === finding.suggestedFix ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-text-secondary" />
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}