import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp, useWindowSize } from 'ink';
import { CoreEngine } from '../../../../dist/core/engine.js';
import { getAllProviders } from '../../../../dist/providers/index.js';

type Period = 'today' | 'week' | '30days' | 'month' | 'all';
const PERIODS: Period[] = ['today', 'week', '30days', 'month', 'all'];
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: '7 Days',
  '30days': '30 Days',
  month: 'This Month',
  all: 'All Time',
};

const MIN_WIDE = 90;
const VIOLET = '#D400FF';
const PINK = '#FF4081';
const CYAN = '#00E5FF';
const MINT = '#39FF14';
const AMBER = '#FFB300';
const RED = '#FF1744';
const DIM = '#555555';
const GOLD = '#FFD700';

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
  sessions: RED,
  model: PINK,
  activity: AMBER,
  tools: CYAN,
  mcp: VIOLET,
  bash: PINK,
};

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function gradientColor(pct: number): string {
  if (pct <= 0.33) {
    const t = pct / 0.33;
    return toHex(lerp(0, VIOLET, t), lerp(0, 255, t), lerp(0, 255, t));
  }
  if (pct <= 0.66) {
    const t = (pct - 0.33) / 0.33;
    return toHex(lerp(VIOLET, CYAN, t), lerp(255, 229, t), lerp(255, 0, t));
  }
  const t = (pct - 0.66) / 0.34;
  return toHex(lerp(CYAN, MINT, t), lerp(229, 255, t), lerp(0, 20, t));
}

type Layout = { dashWidth: number; wide: boolean; halfWidth: number; barWidth: number };

function getLayout(columns?: number): Layout {
  const termWidth = columns || parseInt(process.env['COLUMNS'] ?? '') || 80;
  const dashWidth = Math.min(160, termWidth);
  const wide = dashWidth >= MIN_WIDE;
  const halfWidth = wide ? Math.floor(dashWidth / 2) : dashWidth;
  const inner = halfWidth - 4;
  const barWidth = Math.max(6, Math.min(10, inner - 30));
  return { dashWidth, wide, halfWidth, barWidth };
}

function HBar({ value, max, width }: { value: number; max: number; width: number }) {
  if (max === 0) return <Text color={DIM}>{'░'.repeat(width)}</Text>;
  const filled = Math.round((value / max) * width);
  const fillChars: React.ReactNode[] = [];
  for (let i = 0; i < Math.min(filled, width); i++) {
    fillChars.push(<Text key={i} color={gradientColor(i / width)}>{'█'}</Text>);
  }
  return (
    <Text>
      {fillChars}
      <Text color="#333333">{'░'.repeat(Math.max(width - filled, 0))}</Text>
    </Text>
  );
}

function Panel({ title, color, children, width }: { title: string; color: string; children: React.ReactNode; width: number }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} width={width} overflowX="hidden">
      <Text bold color={color}>{title}</Text>
      {children}
    </Box>
  );
}

function fit(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s.padEnd(n);
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

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  all: 'All',
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  pi: 'Pi',
  copilot: 'Copilot',
};

function getProviderDisplayName(name: string): string {
  return PROVIDER_DISPLAY_NAMES[name.toLowerCase()] ?? name;
}

function PeriodTabs({ active, providerName }: { active: Period; providerName?: string }) {
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box gap={1}>
        {PERIODS.map(p => (
          <Text key={p} bold={active === p} color={active === p ? VIOLET : DIM}>
            {active === p ? `[ ${PERIOD_LABELS[p]} ]` : `  ${PERIOD_LABELS[p]}  `}
          </Text>
        ))}
      </Box>
      {providerName && (
        <Box>
          <Text color={DIM}>|  </Text>
          <Text color={VIOLET} bold>[p]</Text>
          <Text bold color={PROVIDER_COLORS[providerName.toLowerCase()] ?? VIOLET}> {getProviderDisplayName(providerName)}</Text>
        </Box>
      )}
    </Box>
  );
}

function StatusBar({ width, providerCount }: { width: number; providerCount: number }) {
  return (
    <Box borderStyle="round" borderColor={DIM} width={width} justifyContent="center" paddingX={1}>
      <Text>
        <Text color={VIOLET} bold>{'<'}</Text>
        <Text color={VIOLET}>{'>'}</Text>
        <Text dimColor> switch   </Text>
        <Text color={VIOLET} bold>q</Text>
        <Text dimColor> quit   </Text>
        <Text color={VIOLET} bold>r</Text>
        <Text dimColor> refresh   </Text>
        <Text color={VIOLET} bold>1</Text>
        <Text dimColor> today   </Text>
        <Text color={VIOLET} bold>2</Text>
        <Text dimColor> week   </Text>
        <Text color={VIOLET} bold>3</Text>
        <Text dimColor> 30 days   </Text>
        <Text color={VIOLET} bold>4</Text>
        <Text dimColor> month   </Text>
        <Text color={VIOLET} bold>5</Text>
        <Text dimColor> all time</Text>
        {providerCount > 1 && (
          <>
            <Text dimColor>   </Text>
            <Text color={VIOLET} bold>p</Text>
            <Text dimColor> provider</Text>
          </>
        )}
      </Text>
    </Box>
  );
}

function Overview({ overview, label, width }: { overview: any; label: string; width: number }) {
  const { totalCostLocal, sessionsCount, totalTokens, cacheHitRate } = overview || {};
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={PANEL_COLORS.overview} paddingX={1} width={width}>
      <Text wrap="truncate-end">
        <Text bold color={VIOLET}>AgentLens</Text>
        <Text dimColor>  {label}</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text bold color={GOLD}>{formatCost(totalCostLocal || 0)}</Text>
        <Text dimColor> cost   </Text>
        <Text bold>{sessionsCount || 0}</Text>
        <Text dimColor> sessions   </Text>
        <Text bold>{((totalTokens || 0) / 1_000_000).toFixed(1)}M</Text>
        <Text dimColor> tokens   </Text>
        <Text bold>{(cacheHitRate || 0).toFixed(1)}%</Text>
        <Text dimColor> cache hit</Text>
      </Text>
    </Box>
  );
}

function DailyActivity({ daily, pw, bw }: { daily: any[]; pw: number; bw: number }) {
  const sortedDays = daily.slice(-14).sort((a, b) => a.date.localeCompare(b.date));
  const maxCost = Math.max(...sortedDays.map(d => d.costUSD || 0), 0.01);

  if (sortedDays.length === 0) {
    return (
      <Panel title="Daily Activity" color={PANEL_COLORS.daily} width={pw}>
        <Text dimColor>No daily data</Text>
      </Panel>
    );
  }

  return (
    <Panel title="Daily Activity" color={PANEL_COLORS.daily} width={pw}>
      <Text dimColor wrap="truncate-end">{''.padEnd(6 + bw)}{'cost'.padStart(8)}{'sess'.padStart(6)}</Text>
      {sortedDays.map(day => (
        <Text key={day.date} wrap="truncate-end">
          <Text dimColor>{day.date.slice(5)} </Text>
          <HBar value={day.costUSD || 0} max={maxCost} width={bw} />
          <Text color={GOLD}>{formatCost(day.costUSD || 0).padStart(8)}</Text>
          <Text>{String(day.sessions || 0).padStart(6)}</Text>
        </Text>
      ))}
    </Panel>
  );
}

function shortProject(s: string): string {
  if (!s) return 'home';
  s = s.replace(/^-/, '');
  const home = process.env.HOME?.replace(/\//g, '-') || '';
  if (s.startsWith(home)) s = s.slice(home.length).replace(/^-/, '');
  s = s.replace(/^private-tmp-[^-]+-[^-]+-/, '').replace(/^private-tmp-/, '').replace(/^tmp-/, '');
  if (!s) return 'home';
  const parts = s.split('-').filter(Boolean);
  if (parts.length <= 3) return parts.join('/');
  return parts.slice(-3).join('/');
}

function ProjectBreakdown({ projects, pw, bw }: { projects: any[]; pw: number; bw: number }) {
  const maxCost = Math.max(...projects.map(p => p.cost || 0), 0.01);

  if (projects.length === 0) {
    return (
      <Panel title="By Project" color={PANEL_COLORS.project} width={pw}>
        <Text dimColor>No project data</Text>
      </Panel>
    );
  }

  return (
    <Panel title="By Project" color={PANEL_COLORS.project} width={pw}>
      <Text dimColor wrap="truncate-end">
        {''.padEnd(bw + 1 + 20)}{'cost'.padStart(8)}{'sess'.padStart(6)}
      </Text>
      {projects.slice(0, 8).map((project, i) => {
        const name = shortProject(project.name || project.project || 'home');
        return (
          <Text key={`${project.name}-${i}`} wrap="truncate-end">
            <HBar value={project.cost || 0} max={maxCost} width={bw} />
            <Text dimColor> {fit(name, 20)}</Text>
            <Text color={GOLD}>{formatCost(project.cost || 0).padStart(8)}</Text>
            <Text>{String(project.sessions || 0).padStart(6)}</Text>
          </Text>
        );
      })}
    </Panel>
  );
}

function ModelBreakdown({ models, pw, bw }: { models: any[]; pw: number; bw: number }) {
  const sorted = [...models].sort((a, b) => (b.costUSD || 0) - (a.costUSD || 0));
  const maxCost = Math.max(...sorted.map(m => m.costUSD || 0), 0.01);

  if (sorted.length === 0) {
    return (
      <Panel title="By Model" color={PANEL_COLORS.model} width={pw}>
        <Text dimColor>No model data</Text>
      </Panel>
    );
  }

  return (
    <Panel title="By Model" color={PANEL_COLORS.model} width={pw}>
      <Text dimColor wrap="truncate-end">
        {''.padEnd(bw + 1 + 18)}{'cost'.padStart(8)}{'tokens'.padStart(10)}
      </Text>
      {sorted.map((model, i) => {
        const name = model.model || model.name || model.id || 'Unknown';
        return (
          <Text key={`${name}-${i}`} wrap="truncate-end">
            <HBar value={model.costUSD || 0} max={maxCost} width={bw} />
            <Text> {fit(name, 18)}</Text>
            <Text color={GOLD}>{formatCost(model.costUSD || 0).padStart(8)}</Text>
            <Text>{formatTokens(model.totalTokens || 0).padStart(10)}</Text>
          </Text>
        );
      })}
    </Panel>
  );
}

function ActivityBreakdown({ activities, pw, bw }: { activities: any[]; pw: number; bw: number }) {
  const sorted = [...activities].sort((a, b) => (b.costUSD || 0) - (a.costUSD || 0));
  const maxCost = Math.max(...sorted.map(a => a.costUSD || 0), 0.01);

  if (sorted.length === 0) {
    return (
      <Panel title="By Activity" color={PANEL_COLORS.activity} width={pw}>
        <Text dimColor>No activity data</Text>
      </Panel>
    );
  }

  return (
    <Panel title="By Activity" color={PANEL_COLORS.activity} width={pw}>
      <Text dimColor wrap="truncate-end">
        {''.padEnd(bw + 14)}{'cost'.padStart(8)}{'%'.padStart(6)}
      </Text>
      {sorted.map((activity, i) => {
        const name = activity.category || activity.name || 'Unknown';
        return (
          <Text key={`${name}-${i}`} wrap="truncate-end">
            <HBar value={activity.costUSD || 0} max={maxCost} width={bw} />
            <Text color={CYAN}> {fit(name, 13)}</Text>
            <Text color={GOLD}>{formatCost(activity.costUSD || 0).padStart(8)}</Text>
            <Text>{(activity.percentage || 0).toFixed(0).padStart(5)}%</Text>
          </Text>
        );
      })}
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

export const App: React.FC = () => {
  const { exit } = useApp();
  const { columns } = useWindowSize();
  const { dashWidth, wide, halfWidth, barWidth } = getLayout(columns);

  const [period, setPeriod] = useState<Period>('30days');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentProvider, setCurrentProvider] = useState<string>('all');

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

      setData({
        metrics: result.metrics,
        findings: result.findings,
        insights: result.insights,
        providers: allProviders,
        daily: exportData.byDay ?? [],
        projects: exportData.byProject ?? [],
        models: Object.values(result.metrics?.byModel ?? {}),
      });
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
  }, []);

  const switchPeriod = useCallback((np: Period) => {
    fetchData(np, currentProvider);
    setCurrentProvider(prev => prev);
  }, [currentProvider, fetchData]);

  const switchProvider = useCallback(() => {
    const provs = [{ id: 'all' }, ...providersListRef.current];
    const nextIdx = (providerIndexRef.current + 1) % Math.max(provs.length, 1);
    providerIndexRef.current = nextIdx;
    const nextProv = provs[nextIdx]?.id ?? 'all';
    setCurrentProvider(nextProv);
    fetchData(period, nextProv);
  }, [period, fetchData]);

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (input === 'r') { fetchData(period, currentProvider); return; }
    if (input === 'p') { switchProvider(); return; }

    const idx = PERIODS.indexOf(period);
    if (key.leftArrow) { setPeriod(PERIODS[(idx - 1 + PERIODS.length) % PERIODS.length]); fetchData(PERIODS[(idx - 1 + PERIODS.length) % PERIODS.length], currentProvider); }
    else if (key.rightArrow) { setPeriod(PERIODS[(idx + 1) % PERIODS.length]); fetchData(PERIODS[(idx + 1) % PERIODS.length], currentProvider); }
    else if (input === '1') { setPeriod('today'); fetchData('today', currentProvider); }
    else if (input === '2') { setPeriod('week'); fetchData('week', currentProvider); }
    else if (input === '3') { setPeriod('30days'); fetchData('30days', currentProvider); }
    else if (input === '4') { setPeriod('month'); fetchData('month', currentProvider); }
    else if (input === '5') { setPeriod('all'); fetchData('all', currentProvider); }
  });

  if (loading) {
    return (
      <Box flexDirection="column" width={dashWidth}>
        <PeriodTabs active={period} providerName={currentProvider} />
        <Panel title="AgentLens" color={VIOLET} width={dashWidth}>
          <Text dimColor>Loading {PERIOD_LABELS[period]}...</Text>
        </Panel>
        <StatusBar width={dashWidth} providerCount={providersListRef.current.length} />
      </Box>
    );
  }

  const { metrics, daily = [], projects = [], providers = [] } = data || {};
  const overview = metrics?.overview;
  const activities = metrics?.byActivity ? Object.values(metrics.byActivity) : [];
  const models = metrics?.byModel ? Object.values(metrics.byModel) : [];
  const pw = wide ? halfWidth : dashWidth;

  return (
    <Box flexDirection="column" width={dashWidth}>
      <PeriodTabs active={period} providerName={currentProvider} />
      <Overview overview={overview} label={PERIOD_LABELS[period]} width={dashWidth} />
      <Row wide={wide} width={dashWidth}>
        <DailyActivity daily={daily} pw={pw} bw={barWidth} />
        <ProjectBreakdown projects={projects} pw={pw} bw={barWidth} />
      </Row>
      <Row wide={wide} width={dashWidth}>
        <ActivityBreakdown activities={activities} pw={pw} bw={barWidth} />
        <ModelBreakdown models={models} pw={pw} bw={barWidth} />
      </Row>
      <StatusBar width={dashWidth} providerCount={providers.length} />
    </Box>
  );
};
