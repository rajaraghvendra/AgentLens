#!/usr/bin/env node

import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { CoreEngine } from '../../core/engine.js';
import { getAllProviders } from '../../providers/index.js';
import { formatCurrency, formatSeverityBadge, colorize } from './formatters.js';
import type { ProviderFilter } from '../../providers/index.js';
import { getBudget, setBudget, resetBudget } from '../../core/budget.js';
import { notify } from '../../core/notifier.js';

interface CLIOptions {
  period?: string;
  provider?: string;
  project?: string[];
  exclude?: string[];
  format?: string;
  currency?: string;
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
  };
}

const program = new Command();

program
  .name('agentlens')
  .description('Local-first AI developer analytics CLI')
  .version('0.1.0');

program
  .command('tui')
  .description('Launch the interactive terminal UI dashboard (run: npm run tui)')
  .action(() => {
    console.log(colorize('Running TUI...', 'cyan'));
    spawn('npx', ['tsx', 'src/apps/tui/index.ts'], {
      stdio: 'inherit'
    });
  });

program
  .command('web')
  .description('Start the web dashboard (run: npm run dashboard)')
  .option('-p, --port <port>', 'Port to run on', '3000')
  .action((options) => {
    const port = options.port || '3000';
    console.log(colorize('Starting AgentLens web dashboard on port ' + port + '...', 'cyan'));
    
    spawn('npx', ['next', 'dev', '-p', port], {
      cwd: './src/apps/web',
      stdio: 'inherit',
      shell: true
    });
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

      const { metrics, findings, insights } = result;
      const { overview } = metrics;
      
      const periodLabel = options.period || 'week';
      
      console.log('\n' + colorize('┌─ AgentLens Usage Report ─────────────────────────────┐', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Period: ${periodLabel === 'week' ? 'Last 7 days' : periodLabel}`.padEnd(54) + colorize('│', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Sessions: ${overview.sessionsCount}`.padEnd(54) + colorize('│', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Tokens: ${(overview.totalTokens / 1_000_000).toFixed(2)}M`.padEnd(54) + colorize('│', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Cost: ${formatCurrency(overview.totalCostLocal, overview.localCurrency)}`.padEnd(54) + colorize('│', 'cyan'));
      console.log(colorize('└' + '─'.repeat(54) + '┘', 'cyan'));
      
      if (overview.sessionsCount > 0) {
        console.log(`  Avg/Session:  ${formatCurrency(overview.avgCostPerSession, 'USD')} (USD)`);
        console.log(`  Cache Hit:    ${overview.cacheHitRate.toFixed(1)}%`);
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
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || 'today');
      const filters = getFilters(options);
      
      const today = await CoreEngine.getQuickStats(1, filters);
      const period = await CoreEngine.getQuickStats(periodDays, filters);

      if (options.format === 'json') {
        console.log(JSON.stringify({
          today: { sessions: today.sessionsCount, tokens: today.totalTokens, cost: today.totalCostUSD },
          period: { sessions: period.sessionsCount, tokens: period.totalTokens, cost: period.totalCostUSD, period: options.period }
        }, null, 2));
        return;
      }

      console.log(`Today: ${today.sessionsCount} sessions, ${formatCurrency(today.totalCostUSD, 'USD')}`);
      console.log(`${options.period || 'today'}: ${period.sessionsCount} sessions, ${formatCurrency(period.totalCostUSD, 'USD')}`);
      
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
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || '30days');
      const filters = getFilters(options);
      const { findings, insights, metrics } = await CoreEngine.runFull(periodDays, 'USD', filters);

      if (options.format === 'json') {
        const { computeHealthScore } = await import('../../core/optimizer/index.js');
        const { score, grade } = computeHealthScore(findings);
        console.log(JSON.stringify({ 
          findings, 
          insights, 
          healthScore: score, 
          healthGrade: grade,
          totalCost: metrics?.overview?.totalCostUSD 
        }));
        process.exit(0);
      }

      console.log('\n' + colorize('┌─ AgentLens Optimizer ────────────────────────────┐', 'cyan'));
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

program
  .command('export')
  .description('Export usage data to CSV or JSON')
  .option('-f, --format <format>', 'Export format: csv, json', 'csv')
  .option('-o, --output <path>', 'Output file path')
  .option('-p, --period <period>', 'Time period: today, week, month, all', 'week')
  .option('--provider <provider>', 'Filter by provider')
  .option('--project <name>', 'Include projects (repeatable)', collect, [])
  .option('--exclude <name>', 'Exclude projects (repeatable)', collect, [])
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
  .description('Compare usage metrics across models')
  .option('-p, --period <period>', 'Time period: today, week, month, all', '30days')
  .option('--provider <provider>', 'Filter by provider')
  .option('--format <type>', 'Output format: text, json', 'text')
  .option('--model1 <model>', 'First model to compare')
  .option('--model2 <model>', 'Second model to compare')
  .action(async (options) => {
    try {
      const periodDays = parsePeriod(options.period || '30days');
      const filters = getFilters(options);
      const { metrics } = await CoreEngine.run(periodDays, 'USD', filters);

      const byModel = metrics.byModel;
      const models = Object.values(byModel)
        .sort((a, b) => b.costUSD - a.costUSD);

      if (options.format === 'json') {
        const compare = models.map(m => ({
          name: m.model,
          costUSD: m.costUSD,
          totalTokens: m.totalTokens,
          inputTokens: m.inputTokens,
          outputTokens: m.outputTokens,
          cacheHitTokens: m.cacheReadTokens,
          cacheWriteTokens: m.cacheWriteTokens,
          messageCount: m.messageCount,
          isEstimated: m.isEstimated,
        }));
        console.log(JSON.stringify({ models: compare, period: periodDays }));
        process.exit(0);
      }

      const maxModelLen = Math.max(...models.map(m => (m.model || '').length), 15);

      console.log('\n' + colorize('┌─ Model Comparison ───────────────────────────────┐', 'cyan'));
      console.log(colorize('│', 'cyan') + ` Period: ${options.period || '30days'}`.padEnd(52) + colorize('│', 'cyan'));
      console.log(colorize('└' + '─'.repeat(52) + '┘', 'cyan'));

      if (models.length === 0) {
        console.log(colorize('\nNo model data found.', 'yellow'));
        return;
      }

      console.log(`\n${'Model'.padEnd(maxModelLen)} ${'Cost'.padStart(10)} ${'Tokens'.padStart(12)} ${'Cache Hit'.padStart(10)} ${'Calls'.padStart(8)}`);
      console.log('─'.repeat(maxModelLen + 45));

      for (const m of models) {
        const totalInput = m.inputTokens + m.cacheReadTokens + m.cacheWriteTokens;
        const cacheRate = totalInput > 0 ? ((m.cacheReadTokens / totalInput) * 100) : 0;
        console.log(
          `${(m.model || 'unknown').padEnd(maxModelLen)} ` +
          `${formatCurrency(m.costUSD, 'USD').padStart(10)} ` +
          `${((m.totalTokens || 0) / 1_000_000).toFixed(2).padStart(10)}M ` +
          `${cacheRate.toFixed(1).padStart(9)}% ` +
          `${String(m.messageCount).padStart(8)}`
        );
      }

      if (models.length >= 2) {
        const a = models[0];
        const b = models[1];
        const costDiff = a.costUSD > 0 && b.costUSD > 0
          ? (((a.costUSD - b.costUSD) / b.costUSD) * 100).toFixed(1)
          : 'N/A';
        console.log(`\n${colorize('Top 2 comparison:', 'blue')}`);
        console.log(`  ${a.model} costs ${costDiff}% ${parseFloat(costDiff) > 0 ? 'more' : 'less'} than ${b.model} per call`);
      }

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
  .action(async (opts) => {
    try {
      const daily = opts.daily ? parseFloat(opts.daily) : undefined;
      const monthly = opts.monthly ? parseFloat(opts.monthly) : undefined;
      const currency = opts.currency || undefined;
      await setBudget({ daily, monthly, currency });
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
