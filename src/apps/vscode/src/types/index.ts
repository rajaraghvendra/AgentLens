export interface LiveSessionStatus {
  period: string;
  totalCostLocal: number;
  totalCostUSD: number;
  currencySymbol: string;
  totalTokens: number;
  budgetCapLocal: number | null;
  budgetCapUSD: number | null;
  isBudgetExceeded: boolean;
  budgetUtilizationPercentage: number;
  activeProviders: string[];
}

export interface StatusBarConfig {
  pollingInterval: number;
  cliPath: string;
  onClickAction: "openDashboard" | "showOutput" | "none";
}

export type StatusBarState = "loading" | "normal" | "warning" | "exceeded";