#!/usr/bin/env node

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { CoreEngine } from '../../core/engine.js';
import { getAllProviders } from '../../providers/index.js';
import { formatCurrency, formatSeverityBadge, colorize } from './formatters.js';
import type { ProviderFilter } from '../../providers/index.js';
import { getBudget, setBudget, resetBudget } from '../../core/budget.js';
import { notify } from '../../core/notifier.js';
import { clearProcessingIndex, getProcessingIndexStatus } from '../../core/processing/index.js';
import type { OptimizationEvent, ToolAdvice } from '../../types/index.js';
import config from '../../config/env.js';
import { analyzeModels, compareModels, getModelSessions } from '../../core/compare.js';
import { detectWaste, calculateHealthScore } from '../../core/waste-detector.js';

interface CLIOptions {
  period?: string;
  provider?: string;
  project?: string[];
  exclude?: string[];
  format?: string;
  currency?: string;
  fullReparse?: boolean;
  pricingOverride?: string;
}

function collect(val: string, acc: string[]): string[] {
  acc.push(val);
  return acc;
}

function parsePeriod(period: string): number {
  switch (period) {
    case 'today': return 1;
    case 'week': return 7;
    case 'month': return 30;
    case 'all': return 180;
    default:
      const parsed = parseInt(period, 10);
      return isNaN(parsed) ? 7 : parsed;
  }
}

function getFilters(options: CLIOptions) {
  return {
    provider: options.provider as ProviderFilter | undefined,
    projects: options.project,
    exclude: options.exclude,
    fullReparse: options.fullReparse,
  };
}

function printEvents(events: OptimizationEvent[], limit = 5): void {
  if (events.length === 0) return;
  console.log('\n' + colorize('Active Issues:', 'yellow'));
  for (const event of events.slice(0, limit)) {
    console.log(`  ${formatSeverityBadge(event.severity)} ${colorize(event.title, 'yellow')}`);
    console.log(`    → ${event.description}`);
  }
}

function printAdvice(advice: ToolAdvice[], limit = 5): void {
  if (advice.length === 0) return;
  console.log('\n' + colorize('Advice:', 'cyan'));
  for (const item of advice.slice(0, limit)) {
    console.log(`  ${formatSeverityBadge(item.priority)} ${item.title}`);
    console.log(`    → ${item.suggestedAction}`);
  }
}

function notifyHighSeverityEvents(events: OptimizationEvent[]): void {
  for (const event of events) {
    if (event.severity !== 'High') continue;
    void notify(`AgentLens ${event.title}`, event.recommendedAction).catch(() => {});
  }
}

function getPackageRoot(): string {
  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(cliDir, '../../..');
}

function getPackageVersion(): string {
  const packageJsonPath = path.join(getPackageRoot(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };
  return packageJson.version || '0.0.0';
}

function getDashboardAppDir(): string {
  return path.join(getPackageRoot(), 'src', 'apps', 'web');
}

function getPackagedDashboardRuntimeDir(): string {
  return path.join(getPackageRoot(), 'dist', 'apps', 'dashboard-runtime');
}

function sanitizeRelativeDistDir(rawValue: string | undefined): string {
  const fallback = '.agentlens-next';
  if (!rawValue) return fallback;

  const normalized = rawValue.trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    return fallback;
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0 || segments.includes('..')) {
    return fallback;
  }

  return segments.join('/');
}

function getDashboardDistDir(): string {
  return sanitizeRelativeDistDir(process.env['AGENTLENS_WEB_DIST_DIR']);
}

function normalizePort(portValue: string): string {
  const parsed = Number.parseInt(portValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port "${portValue}". Use a numeric port between 1 and 65535.`);
  }

  return String(parsed);
}

function getDashboardBinPath(appDir: string): string {
  const appLocalBin = path.join(appDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (existsSync(appLocalBin)) {
    return appLocalBin;
  }

  return path.join(getPackageRoot(), 'node_modules', 'next', 'dist', 'bin', 'next');
}

function getTuiEntryPath(): string {
  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(cliDir, '../tui/index.js');
}

function getTuiSourcePath(): string {
  return path.join(getPackageRoot(), 'src', 'apps', 'tui', 'index.ts');
}

function getTsxImportSpecifier(): string | null {
  try {
    const require = createRequire(import.meta.url);
    return pathToFileURL(require.resolve('tsx')).href;
  } catch {
    return null;
  }
}

function isInstalledUnderNodeModules(targetPath: string): boolean {
  return targetPath.split(path.sep).includes('node_modules');
}

function openBrowser(url: string): void {
  const platform = process.platform;

  if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    return;
  }

  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    return;
  }

  spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
}

async function waitForDashboard(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  const healthUrl = `${url.replace(/\/$/, '')}/api/status`;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return;
    } catch {
      // ignore until timeout
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Dashboard did not become ready within ${timeoutMs}ms`);
}

function bindChildLifecycle(child: ReturnType<typeof spawn>): void {
  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));
  process.once('SIGHUP', () => forwardSignal('SIGHUP'));

  child.on('close', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function hasPackagedDashboardRuntime(appDir: string): boolean {
  return existsSync(path.join(appDir, getDashboardDistDir(), 'BUILD_ID'));
}

function prepareDashboardRuntime(preferDevMode = false): { dashboardDir: string; nextBin: string; installedRuntime: boolean; usingProductionRuntime: boolean } {
  const packageRoot = getPackageRoot();
  const installedRuntime = isInstalledUnderNodeModules(packageRoot);
  const packagedRuntimeDir = getPackagedDashboardRuntimeDir();
  const canUsePackagedRuntime = hasPackagedDashboardRuntime(packagedRuntimeDir);
  const usingProductionRuntime = installedRuntime || !preferDevMode;
  const dashboardDir = usingProductionRuntime ? packagedRuntimeDir : getDashboardAppDir();
  const nextBin = getDashboardBinPath(dashboardDir);

  if (usingProductionRuntime) {
    console.log(colorize('Preparing dashboard runtime...', 'blue'));
    if (!canUsePackagedRuntime) {
      if (installedRuntime) {
        throw new Error('Packaged dashboard runtime is missing from this install. Reinstall AgentLens or publish a package built with `npm run build:all`.');
      }

      throw new Error('Packaged dashboard runtime is missing from this source checkout. Run `npm run build:all` or use `agentlens dashboard --dev`.');
    }
    console.log(colorize('Using packaged production dashboard runtime', 'green'));
  }

  return { dashboardDir, nextBin, installedRuntime, usingProductionRuntime };
}

const program = new Command();

program
  .name('agentlens')
  .description('Local-first AI developer analytics CLI')
  .version(getPackageVersion());

program
  .command('tui')
  .description('Launch the interactive terminal UI dashboard')
  .action(() => {
    console.log(colorize('Running TUI...', 'cyan'));
    const compiledTuiPath = getTuiEntryPath();
    const sourceTuiPath = getTuiSourcePath();
    const hasCompiledTui = existsSync(compiledTuiPath);
    const tsxImportSpecifier = getTsxImportSpecifier();

    const commandArgs = hasCompiledTui
      ? [compiledTuiPath]
      : tsxImportSpecifier
        ? ['--import', tsxImportSpecifier, sourceTuiPath]
        : [];

    if (!hasCompiledTui && commandArgs.length === 0) {
      console.error(colorize('Failed to launch TUI: compiled build is missing and tsx runtime could not be resolved.', 'red'));
      console.error(colorize('Reinstall AgentLens or run npm install before using the source fallback path.', 'yellow'));
      process.exit(1);
    }

    spawn(process.execPath, commandArgs, {
      stdio: 'inherit'
    });
  });

program
  .command('dashboard')
  .alias('web')
  .description('Start the web dashboard server')
  .option('-p, --port <port>', 'Port to run on', '3000')
  .option('--dev', 'Run the dashboard with the Next.js dev server')
  .option('--no-open', 'Do not open the browser automatically')
  .action((options) => {
    const port = normalizePort(options.port || '3000');
    const { dashboardDir, nextBin, usingProductionRuntime } = prepareDashboardRuntime(options.dev === true);
    const dashboardUrl = `http://127.0.0.1:${port}`;
    const dashboardMode = usingProductionRuntime ? 'production' : 'development';

    console.log(colorize(`Starting AgentLens dashboard (${dashboardMode}) on http://localhost:${port}...`, 'cyan'));

    const child = spawn(process.execPath, [nextBin, usingProductionRuntime ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', port], {
      cwd: dashboardDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        AGENTLENS_WEB_DIST_DIR: getDashboardDistDir(),
        NEXT_TELEMETRY_DISABLED: '1',
      },
    });

    bindChildLifecycle(child);

    child.on('error', (error) => {
      console.error(colorize(`Failed to start dashboard: ${error.message}`, 'red'));
      console.error(colorize('Make sure the package dependencies are installed correctly for this machine.', 'yellow'));
      process.exit(1);
    });

    if (options.open !== false) {
      void waitForDashboard(dashboardUrl)
        .then(() => {
          console.log(colorize(`Opening ${dashboardUrl} ...`, 'blue'));
          openBrowser(dashboardUrl);
        })
        .catch(() => {
          console.log(colorize(`Dashboard is running at ${dashboardUrl}`, 'yellow'));
        });
    }
  });

program
  .command('dashboard:build')
  .description('Verify the packaged production dashboard runtime')
  .action(() => {
    const { usingProductionRuntime, dashboardDir } = prepareDashboardRuntime();
    if (!usingProductionRuntime) {
      console.log(colorize('Packaged dashboard runtime is unavailable. Use `npm run build:all` first.', 'yellow'));
      return;
    }

    console.log(colorize(`Dashboard runtime is ready at ${dashboardDir}.`, 'green'));
  });

program
  .command('report')
  .description('Generate a detailed usage and cost report')
  .option('-p, --period <period>', 'Time period: today, week, month, all, or number of days', 'week')
  .option('--provider <provider>', 'Filter by provider: claude, codex, cursor, opencode, pi, copilot, all')
  .option('--project <name>', 'Show only projects matching name (repeatable)', collect, [])
  .option('--exclude <name>', 'Exclude projects matching name (repeatable)', collect, [])
  .option('--format <type>', 'Output format: text, json', 'text')
  .option('-c, --currency <code>', 'Target currency code (e.g. EUR, GBP)', 'USD')
  .option('--full-reparse', 'Ignore incremental cache and reparse source sessions')
  .option('--minimal', 'Output minimal JSON without session content')
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || 'week');
      const filters = getFilters(options);
      const result = await CoreEngine.runFull(periodDays, options.currency, filters);

      if (options.format === 'json') {
        const exportData = await CoreEngine.getExportData(periodDays, filters);
        if (options.minimal) {
          console.log(JSON.stringify({
            metrics: result.metrics,
            findings: result.findings,
            insights: result.insights,
            providers: result.providers,
            events: result.events,
            digests: result.digests,
            toolAdvice: result.toolAdvice,
            processing: result.processing,
            daily: exportData.byDay,
            projects: exportData.byProject,
            models: Object.values(result.metrics.byModel).map((m: any) => ({
              id: m.model,
              name: m.model,
              costUSD: m.costUSD,
              totalTokens: m.totalTokens,
              inputTokens: m.inputTokens,
              outputTokens: m.outputTokens
            }))
          }, null, 2));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        process.exit(0);
      }

      const { metrics, findings, insights, events = [], toolAdvice = [], processing } = result;
      const { overview } = metrics;
      
      const periodLabel = options.period || 'week';
      
      console.log('\n' + colorize('┌─◊ AgentLens Report ──────────────────────────────────┐', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Period: ${periodLabel === 'week' ? 'Last 7 days' : periodLabel}`.padEnd(54) + colorize('│', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Sessions: ${overview.sessionsCount}`.padEnd(54) + colorize('│', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Tokens: ${(overview.totalTokens / 1_000_000).toFixed(2)}M`.padEnd(54) + colorize('│', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Cost: ${formatCurrency(overview.totalCostLocal, overview.localCurrency)}`.padEnd(54) + colorize('│', 'cyan'));
      console.log(colorize('└' + '─'.repeat(54) + '┘', 'cyan'));
      
      if (overview.sessionsCount > 0) {
        const cacheDisplay = overview.cacheHitRate > 0 ? `${overview.cacheHitRate.toFixed(1)}%` : 'N/A';
        console.log(`  Avg/Session:  ${formatCurrency(overview.avgCostPerSession, 'USD')} (USD)`);
        console.log(`  Cache Hit:    ${cacheDisplay}`);
        if (processing) {
          console.log(`  Parsed:       ${processing.filesReparsed} reparsed, ${processing.cachedFilesReused} cached`);
        }
      }

      console.log('\n' + colorize('Top Activities:', 'blue'));
      const activities = Object.values(metrics.byActivity).sort((a, b) => b.totalTokens - a.totalTokens);
      for (const t of activities) {
        const oneShotInfo = t.oneShotRate > 0 ? ` (${t.oneShotRate.toFixed(0)}% 1-shot)` : '';
        console.log(`  ${t.category.padEnd(15)} ${t.percentage.toFixed(0).padStart(3)}%${oneShotInfo.padStart(18)}  ${formatCurrency(t.costUSD, 'USD')}`);
      }

      if (findings.length > 0) {
        console.log('\n' + colorize('Inefficiencies:', 'yellow'));
        for (const f of findings) {
          console.log(`  ${formatSeverityBadge(f.severity)} ${colorize(f.title, 'yellow')}`);
          console.log(`    → ${f.description}`);
        }
      }

      printEvents(events);

      if (Object.keys(metrics.byModel).length > 0) {
        console.log('\n' + colorize('Models Used:', 'blue'));
        const models = Object.values(metrics.byModel).sort((a, b) => b.costUSD - a.costUSD);
        for (const m of models.slice(0, 5)) {
          const est = m.isEstimated ? ' (est.)' : '';
          console.log(`  ${(m.model || 'unknown').padEnd(25)} ${formatCurrency(m.costUSD, 'USD')}${est}`);
        }
      }

      if (insights.length > 0) {
        console.log('\n' + colorize('Insights:', 'cyan'));
        for (const i of insights) {
          console.log(`  💡 ${i}`);
        }
      }
      printAdvice(toolAdvice);
      
      // Automatic budget alerts (console-only)
      try {
        const b = await getBudget();
        const budgetCurrency = b.currency || options.currency || 'USD';
        const dailyRes = await CoreEngine.run(1, budgetCurrency, filters);
        const monthRes = await CoreEngine.run(30, budgetCurrency, filters);
        const dailyCost = dailyRes.metrics.overview.totalCostLocal || 0;
        const monthlyCost = monthRes.metrics.overview.totalCostLocal || 0;

        const dailyPct = b.daily ? (dailyCost / b.daily) * 100 : 0;
        const monthPct = b.monthly ? (monthlyCost / b.monthly) * 100 : 0;
        const thresholds = [50, 75, 90, 100];
        const highestThreshold = (pct: number) => {
          for (let i = thresholds.length - 1; i >= 0; i--) {
            if (pct >= thresholds[i]) return thresholds[i];
          }
          return 0;
        };

        const dHit = highestThreshold(dailyPct);
        const mHit = highestThreshold(monthPct);

        if (dHit >= 50) {
          console.log(colorize(`⚠️ Daily budget reached ${dHit}% (${formatCurrency(dailyCost, budgetCurrency)} / ${formatCurrency(b.daily || 0, budgetCurrency)})`, dHit >= 90 ? 'red' : dHit >= 75 ? 'yellow' : 'yellow'));
          // System notification
          void notify('AgentLens Budget Alert', `Daily budget reached ${dHit}% (${formatCurrency(dailyCost, budgetCurrency)} / ${formatCurrency(b.daily || 0, budgetCurrency)})`).catch(() => {});
        }
        if (mHit >= 50) {
          console.log(colorize(`⚠️ Monthly budget reached ${mHit}% (${formatCurrency(monthlyCost, budgetCurrency)} / ${formatCurrency(b.monthly || 0, budgetCurrency)})`, mHit >= 90 ? 'red' : mHit >= 75 ? 'yellow' : 'yellow'));
          // System notification
          void notify('AgentLens Budget Alert', `Monthly budget reached ${mHit}% (${formatCurrency(monthlyCost, budgetCurrency)} / ${formatCurrency(b.monthly || 0, budgetCurrency)})`).catch(() => {});
        }
      } catch (e: any) {
        // Non-fatal; do not disrupt report output if budget check fails
      }

      console.log('');
      
    } catch (err: any) {
      console.error(colorize(`Error: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Quick one-line status check')
  .option('-p, --period <period>', 'Time period: today, week, month, all', 'today')
  .option('--provider <provider>', 'Filter by provider')
  .option('--format <type>', 'Output format: text, json', 'text')
  .option('--full-reparse', 'Ignore incremental cache and reparse source sessions')
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || 'today');
      const filters = getFilters(options);
      
      const today = await CoreEngine.getQuickStats(1, filters);
      const period = await CoreEngine.getQuickStats(periodDays, filters);
      const todayFull = await CoreEngine.runFull(1, 'USD', filters);
      
      const budget = await getBudget();
      const dailyBudget = budget?.daily || 0;
      const isBudgetExceeded = dailyBudget > 0 && today.totalCostUSD >= dailyBudget;
      const budgetUtilization = dailyBudget > 0 ? (today.totalCostUSD / dailyBudget) * 100 : 0;

      if (options.format === 'json') {
        const activeProviders = (await import('../../providers/index.js')).getAllProviders()
          .filter(p => p.isAvailable())
          .map(p => p.id);
          
        console.log(JSON.stringify({
          period: options.period || 'today',
          totalCostLocal: today.totalCostUSD,
          totalCostUSD: today.totalCostUSD,
          currencySymbol: '$',
          totalTokens: today.totalTokens,
          budgetCapLocal: budget?.daily || null,
          budgetCapUSD: budget?.daily || null,
          isBudgetExceeded,
          budgetUtilizationPercentage: budgetUtilization,
          activeProviders,
          costsByProvider: Object.fromEntries(
            Object.entries(todayFull.metrics.byProvider || {}).map(([provider, data]: [string, any]) => [provider, data.costUSD]),
          ),
          activeIssuesCount: todayFull.events?.length || 0,
          topAlert: todayFull.events?.[0] || null,
          recommendations: (todayFull.toolAdvice || []).slice(0, 3).map((item) => item.title),
          processing: todayFull.processing,
        }, null, 2));
        return;
      }

      console.log(`Today: ${today.sessionsCount} sessions, ${formatCurrency(today.totalCostUSD, 'USD')}`);
      console.log(`${options.period || 'today'}: ${period.sessionsCount} sessions, ${formatCurrency(period.totalCostUSD, 'USD')}`);
      if ((todayFull.events || []).length > 0) {
        console.log(colorize(`Active issues: ${todayFull.events!.length}`, 'yellow'));
      }
      
    } catch (err: any) {
      console.error(colorize(`Error: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('optimize')
  .description('Run optimization rules and surface findings')
  .option('-p, --period <period>', 'Time period: today, week, month, all', '30days')
  .option('--provider <provider>', 'Filter by provider')
  .option('--format <type>', 'Output format: text, json', 'text')
  .option('--full-reparse', 'Ignore incremental cache and reparse source sessions')
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || '30days');
      const filters = getFilters(options);
      const { findings, insights, metrics, events = [], digests = [], toolAdvice = [], processing } = await CoreEngine.runFull(periodDays, 'USD', filters);

      if (options.format === 'json') {
        const { computeHealthScore } = await import('../../core/optimizer/index.js');
        const { score, grade } = computeHealthScore(findings);
        console.log(JSON.stringify({ 
          findings, 
          insights, 
          events,
          digests,
          toolAdvice,
          processing,
          healthScore: score, 
          healthGrade: grade,
          totalCost: metrics?.overview?.totalCostUSD 
        }));
        process.exit(0);
      }

      console.log('\n' + colorize('┌─◊ AgentLens Optimize ─────────────────────────────┐', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Period: ${options.period || '30days'}`.padEnd(52) + colorize('│', 'cyan'));
      console.log(colorize('└' + '─'.repeat(52) + '┘', 'cyan'));
      
      if (findings.length === 0) {
        console.log(colorize('\n✓ No inefficiencies detected. Your sessions are optimized!', 'green'));
      } else {
        for (const f of findings) {
          console.log(`\n${formatSeverityBadge(f.severity)} ${colorize(f.title, 'yellow')}`);
          console.log(`  ${f.description}`);
          console.log(`  Est. waste: ${formatCurrency(f.estimatedCostWastedUSD, 'USD')} | ~${(f.estimatedTokensWasted / 1000).toFixed(0)}k tokens`);
          console.log(`  ${colorize('Fix:', 'green')} ${f.suggestedFix}`);
        }
      }

      if (insights.length > 0) {
        console.log('\n' + colorize('Insights:', 'cyan'));
        for (const i of insights) {
          console.log(`  💡 ${i}`);
        }
      }
      printEvents(events);
      printAdvice(toolAdvice);
      if (processing) {
        console.log(colorize(`\nProcessing: ${processing.filesReparsed} reparsed, ${processing.cachedFilesReused} cached`, 'gray'));
      }
      notifyHighSeverityEvents(events);
      
      // Automatic budget alerts (console-only)
      try {
        const b = await getBudget();
        const budgetCurrency = b.currency || 'USD';
        const dailyRes = await CoreEngine.run(1, budgetCurrency, filters);
        const monthRes = await CoreEngine.run(30, budgetCurrency, filters);
        const dailyCost = dailyRes.metrics.overview.totalCostLocal || 0;
        const monthlyCost = monthRes.metrics.overview.totalCostLocal || 0;

        const dailyPct = b.daily ? (dailyCost / b.daily) * 100 : 0;
        const monthPct = b.monthly ? (monthlyCost / b.monthly) * 100 : 0;
        const thresholds = [50, 75, 90, 100];
        const highestThreshold = (pct: number) => {
          for (let i = thresholds.length - 1; i >= 0; i--) {
            if (pct >= thresholds[i]) return thresholds[i];
          }
          return 0;
        };

        const dHit = highestThreshold(dailyPct);
        const mHit = highestThreshold(monthPct);

        if (dHit >= 50) {
          console.log(colorize(`⚠️ Daily budget reached ${dHit}% (${formatCurrency(dailyCost, budgetCurrency)} / ${formatCurrency(b.daily || 0, budgetCurrency)})`, dHit >= 90 ? 'red' : dHit >= 75 ? 'yellow' : 'yellow'));
          // System notification
          void notify('AgentLens Budget Alert', `Daily budget reached ${dHit}% (${formatCurrency(dailyCost, budgetCurrency)} / ${formatCurrency(b.daily || 0, budgetCurrency)})`).catch(() => {});
        }
        if (mHit >= 50) {
          console.log(colorize(`⚠️ Monthly budget reached ${mHit}% (${formatCurrency(monthlyCost, budgetCurrency)} / ${formatCurrency(b.monthly || 0, budgetCurrency)})`, mHit >= 90 ? 'red' : mHit >= 75 ? 'yellow' : 'yellow'));
          // System notification
          void notify('AgentLens Budget Alert', `Monthly budget reached ${mHit}% (${formatCurrency(monthlyCost, budgetCurrency)} / ${formatCurrency(b.monthly || 0, budgetCurrency)})`).catch(() => {});
        }
      } catch (e: any) {
        // Non-fatal; do not disrupt optimize output if budget check fails
      }

      console.log('');
      
    } catch (err: any) {
      console.error(colorize(`Error: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('providers')
  .description('List all supported providers')
  .action(async () => {
    try {
      const all = getAllProviders();
      console.log('\n' + colorize('┌─ Supported Providers ─────────────────────────────┐', 'cyan'));
      for (const p of all) {
        const status = p.isAvailable() ? colorize('✓ Available', 'green') : colorize('✗ Not Found', 'gray');
        console.log(colorize('│', 'cyan') + ` ${p.name.padEnd(20)} [${p.id.padEnd(8)}] ${status}`.padEnd(52) + colorize('│', 'cyan'));
      }
      console.log(colorize('└' + '─'.repeat(52) + '┘', 'cyan'));
      console.log('');
    } catch (err: any) {
      console.error(colorize(`Error: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

const cacheProgram = program
  .command('cache')
  .description('Inspect and manage the incremental processing cache');

cacheProgram
  .command('status')
  .description('Show incremental processing cache status')
  .action(async () => {
    try {
      const status = await getProcessingIndexStatus();
      console.log(JSON.stringify(status, null, 2));
    } catch (err: any) {
      console.error(colorize(`Failed to read cache status: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

cacheProgram
  .command('rebuild')
  .description('Clear the processing index and reparse sessions')
  .option('-p, --period <period>', 'Time period to warm after rebuild', '30days')
  .option('--provider <provider>', 'Filter by provider')
  .action(async (options) => {
    try {
      await clearProcessingIndex();
      const filters = getFilters({ provider: options.provider, fullReparse: true });
      const periodDays = parsePeriod(options.period || '30days');
      const result = await CoreEngine.runFull(periodDays, 'USD', filters);
      console.log(colorize('Cache rebuilt successfully.', 'green'));
      console.log(JSON.stringify(result.processing || {}, null, 2));
    } catch (err: any) {
      console.error(colorize(`Failed to rebuild cache: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

cacheProgram
  .command('clear')
  .description('Clear the incremental processing index')
  .action(async () => {
    try {
      await clearProcessingIndex();
      console.log(colorize('Cache cleared successfully.', 'green'));
    } catch (err: any) {
      console.error(colorize(`Failed to clear cache: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('advise')
  .description('Show optimization advice based on current session data')
  .option('-p, --period <period>', 'Time period: today, week, month, all', '7days')
  .option('--provider <provider>', 'Filter by provider')
  .option('--format <type>', 'Output format: text, json', 'text')
  .option('--full-reparse', 'Ignore incremental cache and reparse source sessions')
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || '7days');
      const filters = getFilters(options);
      const result = await CoreEngine.runFull(periodDays, 'USD', filters);
      if (options.format === 'json') {
        console.log(JSON.stringify({ events: result.events || [], toolAdvice: result.toolAdvice || [], digests: result.digests || [] }, null, 2));
        return;
      }
      printEvents(result.events || []);
      printAdvice(result.toolAdvice || []);
      const dailyDigest = (result.digests || []).find((digest) => digest.period === 'daily');
      if (dailyDigest) {
        console.log('\n' + colorize('Digest:', 'blue'));
        console.log(`  ${dailyDigest.headline}`);
      }
    } catch (err: any) {
      console.error(colorize(`Error: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('anomalies')
  .description('List active anomaly and optimizer events')
  .option('-p, --period <period>', 'Time period: today, week, month, all', '7days')
  .option('--provider <provider>', 'Filter by provider')
  .option('--format <type>', 'Output format: text, json', 'text')
  .option('--full-reparse', 'Ignore incremental cache and reparse source sessions')
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || '7days');
      const filters = getFilters(options);
      const result = await CoreEngine.runFull(periodDays, 'USD', filters);
      if (options.format === 'json') {
        console.log(JSON.stringify(result.events || [], null, 2));
        return;
      }
      printEvents(result.events || [], 10);
    } catch (err: any) {
      console.error(colorize(`Error: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('tools')
  .description('Show tool, MCP, and command efficiency rankings')
  .option('-p, --period <period>', 'Time period: today, week, month, all', '30days')
  .option('--provider <provider>', 'Filter by provider')
  .option('--format <type>', 'Output format: text, json', 'text')
  .option('--full-reparse', 'Ignore incremental cache and reparse source sessions')
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || '30days');
      const filters = getFilters(options);
      const result = await CoreEngine.runFull(periodDays, 'USD', filters);
      const toolRows = Object.values(result.metrics.byTool || {}).sort((a, b) => b.estimatedCostUSD - a.estimatedCostUSD);
      const mcpRows = Object.values(result.metrics.byMcpServer || {}).sort((a, b) => b.errorRate - a.errorRate);
      const commandRows = Object.values(result.metrics.byCommandPattern || {}).sort((a, b) => b.estimatedCostUSD - a.estimatedCostUSD);
      if (options.format === 'json') {
        console.log(JSON.stringify({ tools: toolRows, mcpServers: mcpRows, commands: commandRows, advice: result.toolAdvice || [] }, null, 2));
        return;
      }
      console.log(colorize('Top Tools:', 'blue'));
      for (const row of toolRows.slice(0, 8)) {
        console.log(`  ${row.name.padEnd(18)} ${formatCurrency(row.estimatedCostUSD, 'USD').padStart(8)}  ${(row.errorRate * 100).toFixed(0).padStart(4)}% err`);
      }
      if (mcpRows.length > 0) {
        console.log('\n' + colorize('MCP Health:', 'blue'));
        for (const row of mcpRows.slice(0, 5)) {
          console.log(`  ${row.name.padEnd(18)} ${(row.errorRate * 100).toFixed(0).padStart(4)}% err  ${row.invocationCount} calls`);
        }
      }
      if (commandRows.length > 0) {
        console.log('\n' + colorize('Command Patterns:', 'blue'));
        for (const row of commandRows.slice(0, 5)) {
          console.log(`  ${row.pattern.padEnd(18)} ${formatCurrency(row.estimatedCostUSD, 'USD').padStart(8)}  ${(row.errorRate * 100).toFixed(0).padStart(4)}% err`);
        }
      }
      printAdvice(result.toolAdvice || [], 4);
    } catch (err: any) {
      console.error(colorize(`Error: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('digest')
  .description('Show a daily or weekly optimization digest')
  .option('--daily', 'Show the daily digest')
  .option('--weekly', 'Show the weekly digest')
  .option('--provider <provider>', 'Filter by provider')
  .option('--format <type>', 'Output format: text, json', 'text')
  .option('--full-reparse', 'Ignore incremental cache and reparse source sessions')
  .action(async (options) => {
    try {
      const periodDays = options.daily ? 1 : 7;
      const digestPeriod = options.daily ? 'daily' : 'weekly';
      const filters = getFilters(options);
      const result = await CoreEngine.runFull(periodDays, 'USD', filters);
      const digest = (result.digests || []).find((entry) => entry.period === digestPeriod);
      if (options.format === 'json') {
        console.log(JSON.stringify(digest || null, null, 2));
        return;
      }
      if (!digest) {
        console.log(colorize('No digest available.', 'yellow'));
        return;
      }
      console.log(colorize(digest.headline, 'cyan'));
      for (const line of digest.summary) {
        console.log(`  • ${line}`);
      }
    } catch (err: any) {
      console.error(colorize(`Error: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export usage data to CSV or JSON')
  .option('-f, --format <format>', 'Export format: csv, json', 'csv')
  .option('-o, --output <path>', 'Output file path')
  .option('-p, --period <period>', 'Time period: today, week, month, all', 'week')
  .option('--provider <provider>', 'Filter by provider')
  .option('--project <name>', 'Include projects (repeatable)', collect, [])
  .option('--exclude <name>', 'Exclude projects (repeatable)', collect, [])
  .option('--full-reparse', 'Ignore incremental cache and reparse source sessions')
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || 'week');
      const filters = getFilters(options);
      const data = await CoreEngine.getExportData(periodDays, filters);

      const defaultName = `agentlens-${options.period || 'week'}-${new Date().toISOString().split('T')[0]}`;
      const outputPath = options.output || `${defaultName}.${options.format}`;

      if (options.format === 'json') {
        writeFileSync(outputPath, JSON.stringify(data, null, 2));
        console.log(`Exported to: ${outputPath}`);
      } else {
        let csv = `Period,Total Cost,Total Sessions,Total Tokens\n`;
        csv += `${data.period},${data.totalCost.toFixed(2)},${data.totalSessions},${data.totalTokens}\n\n`;
        
        csv += `Date,Cost,Sessions,Tokens\n`;
        for (const d of data.byDay) {
          csv += `${d.date},${d.costUSD.toFixed(2)},${d.sessions},${d.tokens}\n`;
        }

        writeFileSync(outputPath, csv);
        console.log(`Exported to: ${outputPath}`);
      }
} catch (err: any) {
      console.error(colorize(`Error: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('compare')
  .description('Compare usage metrics across models (enhanced)')
  .option('-p, --period <period>', 'Time period: today, week, month, all', '30days')
  .option('--provider <provider>', 'Filter by provider')
  .option('--format <type>', 'Output format: text, json', 'text')
  .option('--full-reparse', 'Ignore incremental cache and reparse source sessions')
  .option('--model1 <model>', 'First model to compare')
  .option('--model2 <model>', 'Second model to compare')
  .option('--pricing-override <path>', 'Path to custom pricing JSON file')
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || '30days');
      const filters = getFilters(options);

      // Apply pricing override if specified
      if (options.pricingOverride) {
        config.pricingOverridePath = options.pricingOverride;
      }

      const { sessions } = await CoreEngine.run(periodDays, 'USD', filters);

      // Use enhanced compare module
      const modelStats = analyzeModels(sessions);

      if (options.format === 'json') {
        const totalCost = modelStats.reduce((sum, m) => sum + m.costUSD, 0);
        console.log(JSON.stringify({ 
          models: modelStats, 
          totalCostUSD: totalCost, 
          period: periodDays,
          wasteFindings: detectWaste(sessions),
        }));
        process.exit(0);
      }

      const maxModelLen = Math.max(...modelStats.map(m => (m.model || '').length), 15);

      console.log('\n' + colorize('┌─ Enhanced Model Comparison ──────────────────────┐', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Period: ${options.period || '30days'}`.padEnd(52) + colorize('│', 'cyan'));
      console.log(colorize('└' + '─'.repeat(52) + '┘', 'cyan'));

      if (modelStats.length === 0) {
        console.log(colorize('\nNo model data found.', 'yellow'));
        return;
      }

      console.log(`\n${'Model'.padEnd(maxModelLen)} ${'Cost'.padStart(10)} ${'Tokens'.padStart(12)} ${'Efficiency'.padStart(12)} ${'Calls'.padStart(8)}`);
      console.log('─'.repeat(maxModelLen + 45));

      for (const m of modelStats) {
        console.log(
          `${(m.model || 'unknown').padEnd(maxModelLen)} ` +
          `${formatCurrency(m.costUSD, 'USD').padStart(10)} ` +
          `${((m.totalTokens || 0) / 1_000_000).toFixed(2).padStart(10)}M ` +
          `${m.efficiency.toFixed(1).padStart(11)}% ` +
          `${String(m.messageCount).padStart(8)}`
        );
      }

      // Model-to-model comparison
      if (options.model1 && options.model2) {
        const comparison = compareModels(sessions, options.model1, options.model2);
        if (comparison) {
          console.log(`\n${colorize('Model Comparison:', 'blue')}`);
          console.log(`  ${comparison.modelA.model} vs ${comparison.modelB.model}`);
          console.log(`  Winner by efficiency: ${colorize(comparison.winner, 'green')}`);
          console.log(`  Model A efficiency: ${comparison.modelA.efficiency.toFixed(1)}%`);
          console.log(`  Model B efficiency: ${comparison.modelB.efficiency.toFixed(1)}%`);
        }
      }

      // Waste detection
      const wasteFindings = detectWaste(sessions);
      if (wasteFindings.length > 0) {
        console.log(`\n${colorize('─'.repeat(50), 'yellow')}`);
        console.log(`${colorize('⚠ Waste Findings:', 'yellow')}`);
        for (const finding of wasteFindings) {
          console.log(`  • [${formatSeverityBadge(finding.severity)}] ${finding.title}`);
          console.log(`    ${finding.description}`);
          console.log(`    Estimated waste: ${formatCurrency(finding.estimatedCostWastedUSD, 'USD')} (${finding.estimatedTokensWasted} tokens)`);
          console.log(`    Fix: ${finding.suggestedFix}`);
        }
      }

      // Health score
      const health = calculateHealthScore(wasteFindings);
      console.log(`\n${colorize('Health Score:', 'blue')} ${health.score}/100 (Grade: ${health.grade})`);

    } catch (err: any) {
      console.error(colorize(`Error: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

// Budget management commands
program
  .command('budget:set')
  .description('Set budgets (amounts are numbers in your currency)')
  .option('--daily <amount>', 'Daily budget amount')
  .option('--monthly <amount>', 'Monthly budget amount')
  .option('--currency <code>', 'Currency code (e.g. USD)')
  .option('--claude <amount>', 'Claude Code daily budget')
  .option('--opencode <amount>', 'OpenCode daily budget')
  .option('--codex <amount>', 'Codex daily budget')
  .option('--cursor <amount>', 'Cursor daily budget')
  .option('--copilot <amount>', 'Copilot daily budget')
  .action(async (opts) => {
    try {
      const daily = opts.daily ? parseFloat(opts.daily) : undefined;
      const monthly = opts.monthly ? parseFloat(opts.monthly) : undefined;
      const currency = opts.currency || undefined;
      const providers: Record<string, number> = {};
      if (opts.claude) providers.claude = parseFloat(opts.claude);
      if (opts.opencode) providers.opencode = parseFloat(opts.opencode);
      if (opts.codex) providers.codex = parseFloat(opts.codex);
      if (opts.cursor) providers.cursor = parseFloat(opts.cursor);
      if (opts.copilot) providers.copilot = parseFloat(opts.copilot);
      
      await setBudget({ daily, monthly, currency, providers: Object.keys(providers).length > 0 ? providers : undefined });
      console.log(colorize(`Budget updated: daily=${daily ?? 'unchanged'} monthly=${monthly ?? 'unchanged'} ${currency ? 'currency='+currency : ''}`, 'green'));
    } catch (err: any) {
      console.error(colorize(`Failed to set budget: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('budget:get')
  .description('Show current budget settings')
  .action(async () => {
    try {
      const b = await getBudget();
      console.log(JSON.stringify(b, null, 2));
    } catch (err: any) {
      console.error(colorize(`Failed to read budget: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('budget:reset')
  .description('Reset budgets to zero')
  .action(async () => {
    try {
      await resetBudget();
      console.log(colorize('Budget reset to 0 (daily/monthly).', 'green'));
    } catch (err: any) {
      console.error(colorize(`Failed to reset budget: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program
  .command('budget:status')
  .description('Show current spend vs budget (daily and monthly)')
  .option('--project <name>', 'Filter by project (repeatable)', collect, [])
  .action(async (opts) => {
    try {
      const b = await getBudget();
      const currency = b.currency || 'USD';

      // Use CoreEngine.run to get local-currency costs
      const dailyRes = await CoreEngine.run(1, currency, { projects: opts.project || [], exclude: [] });
      const monthRes = await CoreEngine.run(30, currency, { projects: opts.project || [], exclude: [] });

      const dailyCost = dailyRes.metrics.overview.totalCostLocal || 0;
      const monthlyCost = monthRes.metrics.overview.totalCostLocal || 0;

      console.log(colorize(`Budget Currency: ${currency}`, 'cyan'));
      console.log(`Daily: ${formatCurrency(dailyCost, currency)} / ${formatCurrency(b.daily || 0, currency)} (${((b.daily ? (dailyCost / b.daily) : 0) * 100).toFixed(1)}%)`);
      console.log(`Monthly: ${formatCurrency(monthlyCost, currency)} / ${formatCurrency(b.monthly || 0, currency)} (${((b.monthly ? (monthlyCost / b.monthly) : 0) * 100).toFixed(1)}%)`);

      const thresholds = [50, 75, 90, 100];
      function highestThreshold(pct: number) {
        for (let i = thresholds.length - 1; i >= 0; i--) {
          if (pct >= thresholds[i]) return thresholds[i];
        }
        return 0;
      }

      const dailyPct = b.daily ? (dailyCost / b.daily) * 100 : 0;
      const monthPct = b.monthly ? (monthlyCost / b.monthly) * 100 : 0;

      const dailyHit = highestThreshold(dailyPct);
      const monthHit = highestThreshold(monthPct);

      if (dailyHit >= 50) {
        console.log(colorize(`⚠️ Daily budget reached ${dailyHit}%`, dailyHit >= 90 ? 'red' : dailyHit >= 75 ? 'yellow' : 'yellow'));
        void notify('AgentLens Budget Alert', `Daily budget reached ${dailyHit}% (${formatCurrency(dailyCost, currency)} / ${formatCurrency(b.daily || 0, currency)})`).catch(() => {});
      }
      if (monthHit >= 50) {
        console.log(colorize(`⚠️ Monthly budget reached ${monthHit}%`, monthHit >= 90 ? 'red' : monthHit >= 75 ? 'yellow' : 'yellow'));
        void notify('AgentLens Budget Alert', `Monthly budget reached ${monthHit}% (${formatCurrency(monthlyCost, currency)} / ${formatCurrency(b.monthly || 0, currency)})`).catch(() => {});
      }

    } catch (err: any) {
      console.error(colorize(`Failed to compute budget status: ${err.message}`, 'red'));
      process.exit(1);
    }
  });

program.parse(process.argv);
