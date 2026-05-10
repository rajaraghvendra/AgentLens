"use client";

import { useState, useEffect, useCallback } from "react";
import { X, DollarSign, Wallet, Globe, TrendingUp, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

interface BudgetSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BudgetData {
  daily: number;
  monthly: number;
  currency: string;
  providers: Record<string, number>;
}

const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
];

const PROVIDERS = [
  { id: "claudeCodeBudget", name: "Claude Code", key: "claude" },
  { id: "opencodeBudget", name: "OpenCode", key: "opencode" },
  { id: "codexBudget", name: "Codex", key: "codex" },
  { id: "cursorBudget", name: "Cursor", key: "cursor" },
  { id: "copilotBudget", name: "Copilot", key: "copilot" },
  { id: "piBudget", name: "Pi", key: "pi" },
  { id: "ompBudget", name: "OMP", key: "omp" },
  { id: "kiroBudget", name: "Kiro", key: "kiro" },
  { id: "kiroVSCodeBudget", name: "Kiro VS Code", key: "kiro-vscode" },
  { id: "geminiBudget", name: "Gemini", key: "gemini" },
  { id: "openclawBudget", name: "OpenClaw", key: "openclaw" },
  { id: "rooCodeBudget", name: "Roo Code", key: "roo-code" },
  { id: "kilocodeBudget", name: "KiloCode", key: "kilocode" },
];

export default function BudgetSettings({ isOpen, onClose }: BudgetSettingsProps) {
  const [budget, setBudget] = useState<BudgetData>({
    daily: 0,
    monthly: 0,
    currency: "USD",
    providers: {},
  });
  const [formData, setFormData] = useState<BudgetData>({
    daily: 0,
    monthly: 0,
    currency: "USD",
    providers: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const normalizeBudgetData = (raw: any): BudgetData => ({
    daily: Number(raw?.daily ?? 0),
    monthly: Number(raw?.monthly ?? 0),
    currency: typeof raw?.currency === "string" ? raw.currency : "USD",
    providers: raw?.providers && typeof raw.providers === "object" ? raw.providers : {},
  });

  useEffect(() => {
    if (isOpen) {
      fetchBudget();
    }
  }, [isOpen]);

  const fetchBudget = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = normalizeBudgetData(await res.json());
      setBudget(data);
      setFormData(data);
    } catch (err) {
      console.error("Failed to fetch budget:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await res.json();
      if (result.success) {
        setSaved(true);
        setBudget(formData);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("Failed to save budget:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setFormData({ daily: 0, monthly: 0, currency: "USD", providers: {} });
  };

  const updateProviderBudget = (key: string, value: number) => {
    setFormData((prev) => ({
      ...prev,
      providers: { ...prev.providers, [key]: value },
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#334155]">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Budget Settings</h2>
              <p className="text-sm text-[#94a3b8]">Set your AI spending limits</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[#334155] transition-colors"
          >
            <X className="w-5 h-5 text-[#94a3b8]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <>
              {/* Currency */}
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-2">
                  <Globe className="w-4 h-4 inline mr-1" />
                  Currency
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>

              {/* Daily Budget */}
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-2">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  Daily Budget (0 = disabled)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.daily || ""}
                  onChange={(e) => setFormData({ ...formData, daily: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="w-full bg-[#0f172a] border border-[#334155] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary"
                />
              </div>

              {/* Monthly Budget */}
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-2">
                  <TrendingUp className="w-4 h-4 inline mr-1" />
                  Monthly Budget (0 = disabled)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.monthly || ""}
                  onChange={(e) => setFormData({ ...formData, monthly: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="w-full bg-[#0f172a] border border-[#334155] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary"
                />
              </div>

              {/* Per-Provider Budgets */}
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-3">
                  Per-Provider Daily Budgets
                </label>
                <div className="space-y-3">
                  {PROVIDERS.map((provider) => (
                    <div key={provider.id} className="flex items-center justify-between">
                      <span className="text-white text-sm">{provider.name}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.providers?.[provider.key] || ""}
                        onChange={(e) => updateProviderBudget(provider.key, parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-32 bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Current Settings */}
              {(budget.daily > 0 || budget.monthly > 0) && (
                <div className="bg-[#0f172a] rounded-lg p-4">
                  <div className="flex items-center gap-2 text-sm text-[#94a3b8] mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    Current Settings
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-[#94a3b8]">Daily:</span>{" "}
                      <span className="text-white font-medium">
                        {budget.currency} {budget.daily.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#94a3b8]">Monthly:</span>{" "}
                      <span className="text-white font-medium">
                        {budget.currency} {budget.monthly.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-[#334155]">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-[#94a3b8] hover:text-white transition-colors"
          >
            Reset
          </button>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                Saved
              </span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#334155] text-white hover:bg-[#334155] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}