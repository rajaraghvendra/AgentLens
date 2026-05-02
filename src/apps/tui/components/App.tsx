import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp, useWindowSize } from 'ink';
import { CoreEngine } from '../../../../src/core/engine.js';
import { getAllProviders } from '../../../../src/providers/index.js';
import { getHomeDir } from '../../../../src/utils/paths.js';

type Period = 'today' | 'week' | '30days' | 'month' | 'all';
type Mode = 'dashboard' | 'compare' | 'detail';
type DashboardFocus = 'daily' | 'projects' | 'models';
type CompareFocus = 'models' | 'providers';
type SortMode = 'cost' | 'tokens' | 'sessions' | 'messages' | 'name';

const PERIODS: Period[] = ['today', 'week', '30days', 'month', 'all'];
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: '7 Days',
  '30days': '30 Days',
  month: 'This Month',
  all: 'All Time',
};

const MIN_WIDE = 92;
const VIOLET = '#D400FF';
const PINK = '#FF4081';
const CYAN = '#00E5FF';
const MINT = '#39FF14';
const AMBER = '#FFB300';
const RED = '#FF1744';
const DIM = '#555555';
const GOLD = '#FFD700';
const SOFT = '#A3A3A3';

const PROVIDER_COLORS: Record<string, string> = {
  claude: VIOLET,
  codex: MINT,
  cursor: CYAN,
  opencode: PINK,
  pi: AMBER,
  copilot: RED,
  all: VIOLET,
};

const PANEL_COLORS = {
  overview: VIOLET,
  daily: CYAN,
  project: MINT,
  model: PINK,
  compare: AMBER,
  findings: RED,
};

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  all: 'All',
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  pi: 'Pi',
  copilot: 'Copilot',
};

const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

type Layout = { dashWidth: number; wide: boolean; halfWidth: number; barWidth: number; nameWidth: number };

type DetailState = {
  title: string;
  subtitle: string;
  lines: string[];
};

function getLayout(columns?: number): Layout {
  const termWidth = columns || parseInt(process.env['COLUMNS'] ?? '') || 80;
  const dashWidth = Math.min(160, termWidth);
  const wide = dashWidth >= MIN_WIDE;
  const halfWidth = wide ? Math.floor(dashWidth / 2) : dashWidth;
  const inner = halfWidth - 4;
  const barWidth = Math.max(5, Math.min(12, inner - 34));
  const nameWidth = Math.max(14, Math.min(24, inner - barWidth - 16));
  return { dashWidth, wide, halfWidth, barWidth, nameWidth };
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function gradientColor(pct: number): string {
  if (pct <= 0.33) {
    const t = pct / 0.33;
    return toHex(lerp(0, 212, t), lerp(0, 0, t), lerp(0, 255, t));
  }
  if (pct <= 0.66) {
    const t = (pct - 0.33) / 0.33;
    return toHex(lerp(212, 0, t), lerp(0, 229, t), lerp(255, 255, t));
  }
  const t = (pct - 0.66) / 0.34;
  return toHex(lerp(0, 57, t), lerp(229, 255, t), lerp(255, 20, t));
}

function HBar({ value, max, width }: { value: number; max: number; width: number }) {
  if (max <= 0) return <Text color={DIM}>{'░'.repeat(width)}</Text>;
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  const fillChars: React.ReactNode[] = [];
  for (let i = 0; i < filled; i++) {
    fillChars.push(<Text key={i} color={gradientColor(i / Math.max(width, 1))}>{'█'}</Text>);
  }
  return (
    <Text>
      {fillChars}
      <Text color="#333333">{'░'.repeat(Math.max(width - filled, 0))}</Text>
    </Text>
  );
}

function sparkline(values: number[], width = 12): string {
  if (values.length === 0) return ''.padEnd(width, '·');
  const trimmed = values.slice(-width);
  const max = Math.max(...trimmed, 0);
  if (max <= 0) return ''.padEnd(trimmed.length, '·');
  return trimmed.map((value) => SPARKS[Math.min(SPARKS.length - 1, Math.floor((value / max) * (SPARKS.length - 1)))]).join('');
}

function fit(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s.padEnd(n);
}

function formatCost(cost: number): string {
  if (cost >= 1000) return `$${(cost / 1000).toFixed(1)}k`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

function shortProject(s: string): string {
  if (!s) return 'home';
  s = s.replace(/^-/, '');
  const home = getHomeDir().replace(/[\\/]/g, '-');
  if (s.startsWith(home)) s = s.slice(home.length).replace(/^-/, '');
  s = s.replace(/^private-tmp-[^-]+-[^-]+-/, '').replace(/^private-tmp-/, '').replace(/^tmp-/, '');
  if (!s) return 'home';
  const parts = s.split('-').filter(Boolean);
  if (parts.length <= 3) return parts.join('/');
  return parts.slice(-3).join('/');
}

function getProviderDisplayName(name: string): string {
  return PROVIDER_DISPLAY_NAMES[name.toLowerCase()] ?? name;
}

function Panel({ title, color, children, width }: { title: string; color: string; children: React.ReactNode; width: number }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} width={width} overflowX="hidden">
      <Text bold color={color}>{title}</Text>
      {children}
    </Box>
  );
}

function PeriodTabs({ active, providerName, mode }: { active: Period; providerName?: string; mode: Mode }) {
  const modeLabel = mode === 'dashboard' ? 'Dashboard' : mode === 'compare' ? 'Compare' : 'Detail';
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box gap={1}>
        {PERIODS.map(p => (
          <Text key={p} bold={active === p} color={active === p ? VIOLET : DIM}>
            {active === p ? `[ ${PERIOD_LABELS[p]} ]` : `  ${PERIOD_LABELS[p]}  `}
          </Text>
        ))}
      </Box>
      <Box>
        <Text color={DIM}>{modeLabel}</Text>
        {providerName && (
          <>
            <Text color={DIM}>  |  </Text>
            <Text color={VIOLET} bold>[p]</Text>
            <Text bold color={PROVIDER_COLORS[providerName.toLowerCase()] ?? VIOLET}> {getProviderDisplayName(providerName)}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}

function ProviderChips({ currentProvider, providers, width }: { currentProvider: string; providers: any[]; width: number }) {
  const chipProviders = [{ id: 'all', name: 'All', available: true, sessionCount: null }, ...providers];
  return (
    <Box borderStyle="round" borderColor={DIM} width={width} paddingX={1}>
      <Box gap={1} flexWrap="wrap">
        {chipProviders.map((provider) => {
          const isActive = currentProvider === provider.id;
          const color = isActive ? (PROVIDER_COLORS[provider.id] ?? VIOLET) : provider.available ? SOFT : DIM;
          const count = provider.sessionCount == null ? '' : ` ${provider.sessionCount}`;
          return (
            <Text key={provider.id} color={color} bold={isActive}>
              {isActive ? `[${provider.name}${count}]` : `${provider.name}${count}`}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}

function StatusBar({
  width,
  providerCount,
  period,
  providerName,
  mode,
  lastLoaded,
  focusHint,
}: {
  width: number;
  providerCount: number;
  period: Period;
  providerName: string;
  mode: Mode;
  lastLoaded?: string;
  focusHint?: string;
}) {
  return (
    <Box borderStyle="round" borderColor={DIM} width={width} justifyContent="center" paddingX={1}>
      <Text wrap="truncate-end">
        <Text color={VIOLET} bold>{'<'}</Text>
        <Text color={VIOLET}>{'>'}</Text>
        <Text dimColor> period   </Text>
        <Text color={VIOLET} bold>↑↓</Text>
        <Text dimColor> row   </Text>
        <Text color={VIOLET} bold>tab</Text>
        <Text dimColor> panel   </Text>
        <Text color={VIOLET} bold>enter</Text>
        <Text dimColor> detail   </Text>
        <Text color={VIOLET} bold>s</Text>
        <Text dimColor> sort   </Text>
        <Text color={VIOLET} bold>c</Text>
        <Text dimColor> compare   </Text>
        <Text color={VIOLET} bold>r</Text>
        <Text dimColor> refresh   </Text>
        <Text color={VIOLET} bold>q</Text>
        <Text dimColor> quit</Text>
        {providerCount > 1 && (
          <>
            <Text dimColor>   </Text>
            <Text color={VIOLET} bold>p</Text>
            <Text dimColor> provider</Text>
          </>
        )}
        <Text dimColor>   |   </Text>
        <Text color={CYAN}>{PERIOD_LABELS[period]}</Text>
        <Text dimColor> · </Text>
        <Text color={PROVIDER_COLORS[providerName.toLowerCase()] ?? VIOLET}>{getProviderDisplayName(providerName)}</Text>
        <Text dimColor> · </Text>
        <Text color={AMBER}>{mode}</Text>
        {focusHint && (
          <>
            <Text dimColor> · </Text>
            <Text dimColor>{focusHint}</Text>
          </>
        )}
        {lastLoaded && (
          <>
            <Text dimColor> · </Text>
            <Text dimColor>{lastLoaded}</Text>
          </>
        )}
      </Text>
    </Box>
  );
}

function Overview({
  overview,
  label,
  providerName,
  width,
}: {
  overview: any;
  label: string;
  providerName: string;
  width: number;
}) {
  const { totalCostLocal, sessionsCount, totalTokens, cacheHitRate } = overview || {};
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={PANEL_COLORS.overview} paddingX={1} width={width}>
      <Text wrap="truncate-end">
        <Text bold color={VIOLET}>AgentLens</Text>
        <Text dimColor>  {label}</Text>
        <Text dimColor>  |  </Text>
        <Text color={PROVIDER_COLORS[providerName.toLowerCase()] ?? VIOLET}>{getProviderDisplayName(providerName)}</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text bold color={GOLD}>{formatCost(totalCostLocal || 0)}</Text>
        <Text dimColor> cost   </Text>
        <Text bold>{sessionsCount || 0}</Text>
        <Text dimColor> sessions   </Text>
        <Text bold>{formatTokens(totalTokens || 0)}</Text>
        <Text dimColor> tokens   </Text>
        <Text bold>{(cacheHitRate || 0).toFixed(1)}%</Text>
        <Text dimColor> cache</Text>
      </Text>
      <Text dimColor wrap="truncate-end">Local-first analytics across providers with retry and waste visibility.</Text>
    </Box>
  );
}

function DailyBreakdown({
  rows,
  width,
  selectedIndex,
  focused,
}: {
  rows: any[];
  width: number;
  selectedIndex: number;
  focused: boolean;
}) {
  const innerWidth = Math.max(20, width - 4);
  const dateWidth = 8;
  const costWidth = 8;
  const sessionsWidth = 4;
  const tokensWidth = 7;
  const avgWidth = 6;
  const reserved = dateWidth + costWidth + sessionsWidth + tokensWidth + avgWidth + 10;
  const barWidth = Math.max(5, Math.min(12, innerWidth - reserved));
  const maxValue = Math.max(...rows.map((row) => row.cost || 0), 0.01);

  return (
    <Panel title={`${focused ? '▶ ' : ''}Daily Breakdown`} color={PANEL_COLORS.daily} width={width}>
      <Text dimColor wrap="truncate-end">
        {' '.repeat(barWidth + 2)}date      cost      sess   tokens   avg/s
      </Text>
      {rows.length === 0 && <Text dimColor>No daily data</Text>}
      {rows.map((row, index) => {
        const selected = focused && index === selectedIndex;
        return (
          <Text key={row.rawDate} wrap="truncate-end" backgroundColor={selected ? '#1E1E2A' : undefined}>
            <Text color={selected ? PANEL_COLORS.daily : DIM}>{selected ? '› ' : '  '}</Text>
            <HBar value={row.cost || 0} max={maxValue} width={barWidth} />
            <Text color={selected ? '#FFFFFF' : SOFT}>{fit(row.label, 8)}</Text>
            <Text color={GOLD}> {formatCost(row.cost).padStart(8)}</Text>
            <Text> {String(row.sessions || 0).padStart(4)}</Text>
            <Text dimColor> {formatTokens(row.tokens || 0).padStart(7)}</Text>
            <Text color={CYAN}> {formatCost(row.avg || 0).padStart(6)}</Text>
          </Text>
        );
      })}
    </Panel>
  );
}

function SelectableBreakdown({
  title,
  color,
  rows,
  width,
  barWidth,
  nameWidth,
  selectedIndex,
  focused,
  metricLabel,
  valueForBar,
  valueForText,
  secondaryText,
}: {
  title: string;
  color: string;
  rows: any[];
  width: number;
  barWidth: number;
  nameWidth: number;
  selectedIndex: number;
  focused: boolean;
  metricLabel: string;
  valueForBar: (row: any) => number;
  valueForText: (row: any) => string;
  secondaryText: (row: any) => string;
}) {
  const maxValue = Math.max(...rows.map((row) => valueForBar(row)), 0.01);
  return (
    <Panel title={`${focused ? '▶ ' : ''}${title}`} color={color} width={width}>
      <Text dimColor wrap="truncate-end">
        {''.padEnd(barWidth + nameWidth + 2)}{metricLabel.padStart(8)}
      </Text>
      {rows.length === 0 && <Text dimColor>No data</Text>}
      {rows.map((row, index) => {
        const selected = focused && index === selectedIndex;
        return (
          <Text key={`${title}-${index}`} wrap="truncate-end" backgroundColor={selected ? '#1E1E2A' : undefined}>
            <Text color={selected ? color : DIM}>{selected ? '› ' : '  '}</Text>
            <HBar value={valueForBar(row)} max={maxValue} width={barWidth} />
            <Text color={selected ? '#FFFFFF' : SOFT}> {fit(row.label, nameWidth)}</Text>
            <Text color={GOLD}>{valueForText(row).padStart(8)}</Text>
            <Text dimColor> {secondaryText(row)}</Text>
          </Text>
        );
      })}
    </Panel>
  );
}

function FindingsPanel({
  findings,
  insights,
  events,
  toolAdvice,
  width,
}: {
  findings: any[];
  insights: string[];
  events: any[];
  toolAdvice: any[];
  width: number;
}) {
  const topFindings = findings.slice(0, 3);
  const topInsights = insights.slice(0, 2).map((insight) => insight.replace(/\*\*/g, ''));
  const topEvents = events.slice(0, 2);
  const topAdvice = toolAdvice.slice(0, 2);

  return (
    <Panel title="Findings & Insights" color={PANEL_COLORS.findings} width={width}>
      {topEvents.map((event, index) => (
        <Box key={`${event.id || event.title}-${index}`} flexDirection="column" marginBottom={1}>
          <Text color={event.severity?.toLowerCase() === 'high' ? RED : AMBER} bold wrap="truncate-end">
            ALERT {event.title}
          </Text>
          <Text dimColor wrap="truncate-end">{event.recommendedAction || event.description}</Text>
        </Box>
      ))}
      {topFindings.length === 0 ? (
        <Text dimColor>No active findings. Session behavior looks stable.</Text>
      ) : (
        topFindings.map((finding, index) => (
          <Box key={`${finding.title}-${index}`} flexDirection="column" marginBottom={index === topFindings.length - 1 && topInsights.length === 0 ? 0 : 1}>
            <Text color={finding.severity?.toLowerCase() === 'high' ? RED : AMBER} bold wrap="truncate-end">
              {(finding.severity || 'info').toUpperCase()} {finding.title}
            </Text>
            <Text dimColor wrap="truncate-end">{finding.description}</Text>
          </Box>
        ))
      )}
      {topInsights.length > 0 && (
        <Box flexDirection="column" marginTop={topFindings.length > 0 ? 1 : 0}>
          {topInsights.map((insight, index) => (
            <Text key={`${insight}-${index}`} color={CYAN} wrap="truncate-end">
              • {insight}
            </Text>
          ))}
        </Box>
      )}
      {topAdvice.length > 0 && (
        <Box flexDirection="column" marginTop={topFindings.length > 0 || topInsights.length > 0 ? 1 : 0}>
          {topAdvice.map((advice, index) => (
            <Text key={`${advice.title}-${index}`} color={SOFT} wrap="truncate-end">
              → {advice.title}
            </Text>
          ))}
        </Box>
      )}
    </Panel>
  );
}

function DetailPanel({ detail, width }: { detail: DetailState; width: number }) {
  return (
    <Panel title={detail.title} color={PANEL_COLORS.compare} width={width}>
      <Text color={CYAN} wrap="truncate-end">{detail.subtitle}</Text>
      <Text dimColor> </Text>
      {detail.lines.map((line, index) => (
        <Text key={`${line}-${index}`} wrap="truncate-end">{line}</Text>
      ))}
    </Panel>
  );
}

function Row({ wide, width, children }: { wide: boolean; width: number; children: React.ReactNode }) {
  if (wide) return <Box width={width}>{children}</Box>;
  return <>{children}</>;
}

function periodToDays(p: Period): number {
  if (p === 'today') return 1;
  if (p === 'week') return 7;
  if (p === '30days') return 30;
  if (p === 'month') return 30;
  return 365;
}

function formatLoadedAt(date: Date | null): string | undefined {
  if (!date) return undefined;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `loaded ${hh}:${mm}:${ss}`;
}

function sortRows(rows: any[], mode: SortMode): any[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (mode === 'name') return String(a.label).localeCompare(String(b.label));
    if (mode === 'tokens') return (b.tokens || 0) - (a.tokens || 0);
    if (mode === 'sessions') return (b.sessions || 0) - (a.sessions || 0);
    if (mode === 'messages') return (b.messages || 0) - (a.messages || 0);
    return (b.cost || 0) - (a.cost || 0);
  });
  return sorted;
}

export const App: React.FC = () => {
  const { exit } = useApp();
  const { columns } = useWindowSize();
  const { dashWidth, wide, halfWidth, barWidth, nameWidth } = getLayout(columns);

  const [period, setPeriod] = useState<Period>('30days');
  const [mode, setMode] = useState<Mode>('dashboard');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentProvider, setCurrentProvider] = useState<string>('all');
  const [dashboardFocus, setDashboardFocus] = useState<DashboardFocus>('daily');
  const [compareFocus, setCompareFocus] = useState<CompareFocus>('models');
  const [dailyIndex, setDailyIndex] = useState(0);
  const [projectIndex, setProjectIndex] = useState(0);
  const [modelIndex, setModelIndex] = useState(0);
  const [compareModelIndex, setCompareModelIndex] = useState(0);
  const [compareProviderIndex, setCompareProviderIndex] = useState(0);
  const [dailySort, setDailySort] = useState<SortMode>('cost');
  const [projectSort, setProjectSort] = useState<SortMode>('cost');
  const [modelSort, setModelSort] = useState<SortMode>('cost');
  const [compareModelSort, setCompareModelSort] = useState<SortMode>('cost');
  const [compareProviderSort, setCompareProviderSort] = useState<SortMode>('cost');
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const providersListRef = useRef<any[]>([]);
  const providerIndexRef = useRef(0);
  const initializedRef = useRef(false);

  const fetchData = useCallback(async (p: Period, prov: string) => {
    setLoading(true);
    try {
      const days = periodToDays(p);
      const filters = prov && prov !== 'all' ? { provider: prov as any } : undefined;
      const result = await CoreEngine.runFull(days, 'USD', filters);
      const exportData = CoreEngine.buildExportData(result.sessions, result.metrics, days);

      const allProviders = getAllProviders().map((provider) => ({
        id: provider.id,
        name: provider.name,
        available: provider.isAvailable(),
        sessionCount: result.providers.find((item) => item.id === provider.id)?.sessionCount ?? 0,
      }));

      const selectableProviders = allProviders.filter((provider) => (provider.sessionCount ?? 0) > 0);
      if (prov === 'all' || providersListRef.current.length === 0) {
        providersListRef.current = selectableProviders;
      } else {
        const merged = new Map<string, any>();
        for (const provider of providersListRef.current) merged.set(provider.id, provider);
        for (const provider of selectableProviders) merged.set(provider.id, provider);
        providersListRef.current = Array.from(merged.values());
      }

      const projectRows = (exportData.byProject ?? []).map((project: any) => ({
        label: shortProject(project.name || project.project || 'home'),
        rawName: project.name || project.project || 'home',
        cost: project.cost || 0,
        sessions: project.sessions || 0,
        tokens: 0,
      }));

      const modelRows = Object.values(result.metrics?.byModel ?? {}).map((model: any) => ({
        label: model.model || model.name || model.id || 'Unknown',
        cost: model.costUSD || 0,
        tokens: model.totalTokens || 0,
        messages: model.messageCount || 0,
        raw: model,
      }));

      const providerRows = Object.values(result.metrics?.byProvider ?? {}).map((provider: any) => ({
        label: getProviderDisplayName(provider.provider || 'unknown'),
        providerId: provider.provider || 'unknown',
        cost: provider.costUSD || 0,
        tokens: provider.totalTokens || 0,
        messages: provider.messageCount || 0,
      }));

      setData({
        metrics: result.metrics,
        findings: result.findings,
        insights: result.insights,
        events: result.events || [],
        toolAdvice: result.toolAdvice || [],
        providers: allProviders,
        daily: exportData.byDay ?? [],
        projects: projectRows,
        models: modelRows,
        providerRows,
        sessions: result.sessions,
      });
      setLastLoaded(new Date());
      setDailyIndex(0);
      setProjectIndex(0);
      setModelIndex(0);
      setCompareModelIndex(0);
      setCompareProviderIndex(0);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchData('30days', 'all');
  }, [fetchData]);

  const switchProvider = useCallback(() => {
    const provs = [{ id: 'all' }, ...providersListRef.current];
    const nextIdx = (providerIndexRef.current + 1) % Math.max(provs.length, 1);
    providerIndexRef.current = nextIdx;
    const nextProv = provs[nextIdx]?.id ?? 'all';
    setCurrentProvider(nextProv);
    setMode('dashboard');
    setDetail(null);
    fetchData(period, nextProv);
  }, [period, fetchData]);

  const cycleSort = useCallback(() => {
    const nextSort = (current: SortMode): SortMode => {
      const order: SortMode[] = ['cost', 'tokens', 'sessions', 'messages', 'name'];
      return order[(order.indexOf(current) + 1) % order.length];
    };

    if (mode === 'dashboard') {
      if (dashboardFocus === 'daily') setDailySort((value) => nextSort(value));
      else if (dashboardFocus === 'projects') setProjectSort((value) => nextSort(value));
      else setModelSort((value) => nextSort(value));
      return;
    }
    if (mode === 'compare') {
      if (compareFocus === 'models') setCompareModelSort((value) => nextSort(value));
      else setCompareProviderSort((value) => nextSort(value));
    }
  }, [mode, dashboardFocus, compareFocus]);

  const buildDetail = useCallback(() => {
    if (!data) return;
    const sessions = data.sessions ?? [];
    const dailyRows = sortRows(
      (data.daily ?? []).slice(-7).map((day: any) => ({
        label: day.date.slice(5),
        rawDate: day.date,
        cost: day.costUSD || 0,
        sessions: day.sessions || 0,
        tokens: day.tokens || 0,
        avg: (day.sessions || 0) > 0 ? (day.costUSD || 0) / day.sessions : 0,
      })),
      dailySort,
    );
    const projects = sortRows(data.projects ?? [], projectSort);
    const models = sortRows(data.models ?? [], modelSort);
    const providers = sortRows(data.providerRows ?? [], compareProviderSort);

    if (mode === 'dashboard' && dashboardFocus === 'daily') {
      const row = dailyRows[dailyIndex];
      if (!row) return;
      const matching = sessions.filter((session: any) => {
        const ts = session.messages?.[session.messages.length - 1]?.timestamp || session.timestamp;
        return new Date(ts).toISOString().slice(0, 10) === row.rawDate;
      });

      const aggregate = (items: any[], labelFor: (item: any) => string, tokenFor: (item: any) => number) => {
        const map = new Map<string, { cost: number; tokens: number; count: number }>();
        for (const item of items) {
          const label = labelFor(item) || 'Unknown';
          const prev = map.get(label) || { cost: 0, tokens: 0, count: 0 };
          prev.cost += item.costUSD || 0;
          prev.tokens += tokenFor(item);
          prev.count += 1;
          map.set(label, prev);
        }
        return Array.from(map.entries())
          .map(([label, value]) => ({ label, ...value }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 3);
      };

      const topProviders = aggregate(
        matching,
        (session) => getProviderDisplayName(session.provider || 'unknown'),
        (session) => (session.messages || []).reduce((sum: number, message: any) => sum + (message.totalTokens || 0), 0),
      );
      const topProjects = aggregate(
        matching,
        (session) => shortProject(session.project || 'home'),
        (session) => (session.messages || []).reduce((sum: number, message: any) => sum + (message.totalTokens || 0), 0),
      );
      const topModels = aggregate(
        matching.flatMap((session: any) => (session.messages || []).map((message: any) => ({ ...message, costUSD: message.costUSD || 0 }))),
        (message) => message.model || 'Unknown',
        (message) => message.totalTokens || 0,
      );

      setDetail({
        title: `Day: ${row.rawDate}`,
        subtitle: `${formatCost(row.cost)} · ${row.sessions} sessions · ${formatTokens(row.tokens)} · avg ${formatCost(row.avg)}`,
        lines: [
          'Providers',
          ...(topProviders.length > 0 ? topProviders.map((item) => `  ${fit(item.label, 18)} ${formatCost(item.cost).padStart(8)}  ${formatTokens(item.tokens).padStart(7)}`) : ['  n/a']),
          'Projects',
          ...(topProjects.length > 0 ? topProjects.map((item) => `  ${fit(item.label, 18)} ${formatCost(item.cost).padStart(8)}  ${item.count.toString().padStart(3)} sess`) : ['  n/a']),
          'Models',
          ...(topModels.length > 0 ? topModels.map((item) => `  ${fit(item.label, 18)} ${formatCost(item.cost).padStart(8)}  ${formatTokens(item.tokens).padStart(7)}`) : ['  n/a']),
        ],
      });
      setMode('detail');
      return;
    }

    if (mode === 'dashboard' && dashboardFocus === 'projects') {
      const row = projects[projectIndex];
      if (!row) return;
      const matching = sessions.filter((session: any) => session.project === row.rawName);
      const byProvider = new Map<string, number>();
      for (const session of matching) {
        byProvider.set(session.provider, (byProvider.get(session.provider) || 0) + 1);
      }
      setDetail({
        title: `Project: ${shortProject(row.rawName)}`,
        subtitle: `${formatCost(row.cost)} · ${row.sessions} sessions`,
        lines: [
          `sessions ${matching.length}`,
          `providers ${Array.from(byProvider.entries()).map(([provider, count]) => `${provider}:${count}`).join('  ') || 'n/a'}`,
          ...matching.slice(0, 6).map((session: any) => {
            const lastTs = session.messages?.[session.messages.length - 1]?.timestamp || session.timestamp;
            const date = new Date(lastTs).toISOString().slice(0, 16).replace('T', ' ');
            return `${date}  ${fit(session.provider, 8)}  ${session.messages?.length || 0} msgs  ${session.id.slice(0, 20)}`;
          }),
        ],
      });
      setMode('detail');
      return;
    }

    if (mode === 'dashboard' && dashboardFocus === 'models') {
      const row = models[modelIndex];
      if (!row) return;
      const matchingSessions = sessions.filter((session: any) => session.messages?.some((message: any) => (message.model || 'Unknown') === row.label));
      setDetail({
        title: `Model: ${row.label}`,
        subtitle: `${formatCost(row.cost)} · ${formatTokens(row.tokens)} · ${row.messages} msgs`,
        lines: [
          `sessions ${matchingSessions.length}`,
          ...matchingSessions.slice(0, 6).map((session: any) => {
            const date = new Date(session.timestamp).toISOString().slice(0, 16).replace('T', ' ');
            return `${date}  ${fit(shortProject(session.project), 18)}  ${fit(session.provider, 8)}  ${session.messages?.length || 0} msgs`;
          }),
        ],
      });
      setMode('detail');
      return;
    }

    if (mode === 'compare' && compareFocus === 'models') {
      const row = sortRows(data.models ?? [], compareModelSort)[compareModelIndex];
      if (!row) return;
      setDetail({
        title: `Compare: ${row.label}`,
        subtitle: `${formatCost(row.cost)} · ${formatTokens(row.tokens)} · ${row.messages} msgs`,
        lines: [
          `sort ${compareModelSort}`,
          `share ${(row.cost / Math.max(0.01, data.metrics?.overview?.totalCostUSD || 0) * 100).toFixed(1)}% of selected spend`,
          `estimated ${row.raw?.isEstimated ? 'yes' : 'no'}`,
          `cache read ${formatTokens(row.raw?.cacheReadTokens || 0)}`,
          `cache write ${formatTokens(row.raw?.cacheWriteTokens || 0)}`,
        ],
      });
      setMode('detail');
      return;
    }

    if (mode === 'compare' && compareFocus === 'providers') {
      const row = providers[compareProviderIndex];
      if (!row) return;
      setDetail({
        title: `Provider: ${row.label}`,
        subtitle: `${formatCost(row.cost)} · ${formatTokens(row.tokens)} · ${row.messages} msgs`,
        lines: [
          `provider ${row.providerId}`,
          `share ${(row.cost / Math.max(0.01, data.metrics?.overview?.totalCostUSD || 0) * 100).toFixed(1)}% of selected spend`,
          ...sessions.filter((session: any) => session.provider === row.providerId).slice(0, 6).map((session: any) => {
            const date = new Date(session.timestamp).toISOString().slice(0, 16).replace('T', ' ');
            return `${date}  ${fit(shortProject(session.project), 18)}  ${session.messages?.length || 0} msgs`;
          }),
        ],
      });
      setMode('detail');
    }
  }, [data, mode, dashboardFocus, dailySort, projectSort, modelSort, compareModelSort, compareProviderSort, dailyIndex, projectIndex, modelIndex, compareModelIndex, compareProviderIndex]);

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (input === 'r') { fetchData(period, currentProvider); return; }
    if (input === 'p') { switchProvider(); return; }
    if (input === 'c') { setDetail(null); setMode((value) => value === 'compare' ? 'dashboard' : 'compare'); return; }
    if (input === 's') { cycleSort(); return; }
    if (key.return) { if (mode === 'detail') { setMode('dashboard'); setDetail(null); } else { buildDetail(); } return; }
    if (key.escape) { if (mode === 'detail') { setMode('dashboard'); setDetail(null); } return; }
    if (key.tab) {
      if (mode === 'dashboard') {
        setDashboardFocus((value) => value === 'daily' ? 'projects' : value === 'projects' ? 'models' : 'daily');
      }
      if (mode === 'compare') setCompareFocus((value) => value === 'models' ? 'providers' : 'models');
      return;
    }

    const idx = PERIODS.indexOf(period);
    if (key.leftArrow) {
      const next = PERIODS[(idx - 1 + PERIODS.length) % PERIODS.length];
      setPeriod(next);
      setMode('dashboard');
      setDetail(null);
      fetchData(next, currentProvider);
      return;
    }
    if (key.rightArrow) {
      const next = PERIODS[(idx + 1) % PERIODS.length];
      setPeriod(next);
      setMode('dashboard');
      setDetail(null);
      fetchData(next, currentProvider);
      return;
    }
    if (input === '1') { setPeriod('today'); setMode('dashboard'); setDetail(null); fetchData('today', currentProvider); return; }
    if (input === '2') { setPeriod('week'); setMode('dashboard'); setDetail(null); fetchData('week', currentProvider); return; }
    if (input === '3') { setPeriod('30days'); setMode('dashboard'); setDetail(null); fetchData('30days', currentProvider); return; }
    if (input === '4') { setPeriod('month'); setMode('dashboard'); setDetail(null); fetchData('month', currentProvider); return; }
    if (input === '5') { setPeriod('all'); setMode('dashboard'); setDetail(null); fetchData('all', currentProvider); return; }

    if (key.upArrow) {
      if (mode === 'dashboard') {
        if (dashboardFocus === 'daily') setDailyIndex((value) => Math.max(0, value - 1));
        else if (dashboardFocus === 'projects') setProjectIndex((value) => Math.max(0, value - 1));
        else setModelIndex((value) => Math.max(0, value - 1));
      } else if (mode === 'compare') {
        if (compareFocus === 'models') setCompareModelIndex((value) => Math.max(0, value - 1));
        else setCompareProviderIndex((value) => Math.max(0, value - 1));
      }
      return;
    }

    if (key.downArrow && data) {
      if (mode === 'dashboard') {
        if (dashboardFocus === 'daily') {
          const rows = sortRows((data.daily ?? []).slice(-7).map((day: any) => ({
            label: day.date.slice(5),
            rawDate: day.date,
            cost: day.costUSD || 0,
            sessions: day.sessions || 0,
            tokens: day.tokens || 0,
            avg: (day.sessions || 0) > 0 ? (day.costUSD || 0) / day.sessions : 0,
          })), dailySort);
          setDailyIndex((value) => Math.min(rows.length - 1, value + 1));
        } else if (dashboardFocus === 'projects') setProjectIndex((value) => Math.min(sortRows(data.projects ?? [], projectSort).length - 1, value + 1));
        else setModelIndex((value) => Math.min(sortRows(data.models ?? [], modelSort).length - 1, value + 1));
      } else if (mode === 'compare') {
        if (compareFocus === 'models') setCompareModelIndex((value) => Math.min(sortRows(data.models ?? [], compareModelSort).length - 1, value + 1));
        else setCompareProviderIndex((value) => Math.min(sortRows(data.providerRows ?? [], compareProviderSort).length - 1, value + 1));
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" width={dashWidth}>
        <PeriodTabs active={period} providerName={currentProvider} mode={mode} />
        <ProviderChips currentProvider={currentProvider} providers={providersListRef.current} width={dashWidth} />
        <Panel title="AgentLens" color={VIOLET} width={dashWidth}>
          <Text dimColor>Loading {PERIOD_LABELS[period]}...</Text>
        </Panel>
        <StatusBar width={dashWidth} providerCount={providersListRef.current.length} period={period} providerName={currentProvider} mode={mode} lastLoaded={formatLoadedAt(lastLoaded)} />
      </Box>
    );
  }

  const { metrics, daily = [], projects = [], models = [], providerRows = [], providers = [], findings = [], insights = [], events = [], toolAdvice = [] } = data || {};
  const overview = metrics?.overview;
  const pw = wide ? halfWidth : dashWidth;
  const sortedDaily = sortRows(
    daily.slice(-7).map((day: any) => ({
      label: day.date.slice(5),
      rawDate: day.date,
      cost: day.costUSD || 0,
      sessions: day.sessions || 0,
      tokens: day.tokens || 0,
      avg: (day.sessions || 0) > 0 ? (day.costUSD || 0) / day.sessions : 0,
    })),
    dailySort,
  );
  const sortedProjects = sortRows(projects, projectSort);
  const sortedModels = sortRows(models, modelSort);
  const sortedCompareModels = sortRows(models, compareModelSort);
  const sortedCompareProviders = sortRows(providerRows, compareProviderSort);
  const focusHint =
    mode === 'dashboard'
      ? `${dashboardFocus} sort:${dashboardFocus === 'daily' ? dailySort : dashboardFocus === 'projects' ? projectSort : modelSort}`
      : mode === 'compare'
        ? `${compareFocus} sort:${compareFocus === 'models' ? compareModelSort : compareProviderSort}`
        : 'enter/esc back';

  return (
    <Box flexDirection="column" width={dashWidth}>
      <PeriodTabs active={period} providerName={currentProvider} mode={mode} />
      <ProviderChips currentProvider={currentProvider} providers={providersListRef.current} width={dashWidth} />
      <Overview overview={overview} label={PERIOD_LABELS[period]} providerName={currentProvider} width={dashWidth} />

      {mode === 'dashboard' && (
        <>
          <Row wide={wide} width={dashWidth}>
            <DailyBreakdown
              rows={sortedDaily}
              width={pw}
              selectedIndex={dailyIndex}
              focused={dashboardFocus === 'daily'}
            />
            <SelectableBreakdown
              title="Projects"
              color={PANEL_COLORS.project}
              rows={sortedProjects.slice(0, 8)}
              width={pw}
              barWidth={barWidth}
              nameWidth={nameWidth}
              selectedIndex={projectIndex}
              focused={dashboardFocus === 'projects'}
              metricLabel="cost"
              valueForBar={(row) => row.cost || 0}
              valueForText={(row) => formatCost(row.cost || 0)}
              secondaryText={(row) => `${row.sessions || 0}s`}
            />
          </Row>
          <Row wide={wide} width={dashWidth}>
            <SelectableBreakdown
              title="Models"
              color={PANEL_COLORS.model}
              rows={sortedModels.slice(0, 8)}
              width={pw}
              barWidth={barWidth}
              nameWidth={nameWidth}
              selectedIndex={modelIndex}
              focused={dashboardFocus === 'models'}
              metricLabel="cost"
              valueForBar={(row) => row.cost || 0}
              valueForText={(row) => formatCost(row.cost || 0)}
              secondaryText={(row) => formatTokens(row.tokens || 0)}
            />
            <FindingsPanel findings={findings} insights={insights} events={events} toolAdvice={toolAdvice} width={pw} />
          </Row>
        </>
      )}

      {mode === 'compare' && (
        <>
          <Row wide={wide} width={dashWidth}>
            <SelectableBreakdown
              title="Compare Models"
              color={PANEL_COLORS.compare}
              rows={sortedCompareModels.slice(0, 10)}
              width={pw}
              barWidth={barWidth}
              nameWidth={nameWidth}
              selectedIndex={compareModelIndex}
              focused={compareFocus === 'models'}
              metricLabel="cost"
              valueForBar={(row) => row.cost || 0}
              valueForText={(row) => formatCost(row.cost || 0)}
              secondaryText={(row) => `${formatTokens(row.tokens || 0)} ${row.messages || 0}m`}
            />
            <SelectableBreakdown
              title="Compare Providers"
              color={CYAN}
              rows={sortedCompareProviders.slice(0, 10)}
              width={pw}
              barWidth={barWidth}
              nameWidth={nameWidth}
              selectedIndex={compareProviderIndex}
              focused={compareFocus === 'providers'}
              metricLabel="cost"
              valueForBar={(row) => row.cost || 0}
              valueForText={(row) => formatCost(row.cost || 0)}
              secondaryText={(row) => `${formatTokens(row.tokens || 0)} ${row.messages || 0}m`}
            />
          </Row>
          <CompactCompareSummary models={sortedCompareModels} providers={sortedCompareProviders} width={dashWidth} />
        </>
      )}

      {mode === 'detail' && detail && <DetailPanel detail={detail} width={dashWidth} />}

      <StatusBar
        width={dashWidth}
        providerCount={providers.length}
        period={period}
        providerName={currentProvider}
        mode={mode}
        lastLoaded={formatLoadedAt(lastLoaded)}
        focusHint={focusHint}
      />
    </Box>
  );
};

function CompactCompareSummary({ models, providers, width }: { models: any[]; providers: any[]; width: number }) {
  const topModel = models[0];
  const topProvider = providers[0];
  return (
    <Panel title="Compare Summary" color={AMBER} width={width}>
      <Text wrap="truncate-end">
        <Text dimColor>top model    </Text>
        <Text color={PINK}>{fit(topModel?.label || 'n/a', 24)}</Text>
        <Text color={GOLD}> {formatCost(topModel?.cost || 0)}</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text dimColor>top provider </Text>
        <Text color={CYAN}>{fit(topProvider?.label || 'n/a', 24)}</Text>
        <Text color={GOLD}> {formatCost(topProvider?.cost || 0)}</Text>
      </Text>
      <Text dimColor wrap="truncate-end">Press Enter on any selected row for a deeper breakdown.</Text>
    </Panel>
  );
}
