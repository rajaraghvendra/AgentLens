// ─────────────────────────────────────────────────────────────
// Tests – Utility Functions (dates, fs-stream)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { getDateRange, isWithinWindow, isWithinRange, relativeTime } from '../../src/utils/dates.js';
import { streamJsonlFile, readJsonlFile } from '../../src/utils/fs-stream.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/mock-session.jsonl');

describe('Date Utilities', () => {
  it('getDateRange returns a valid range', () => {
    const range = getDateRange(7);
    expect(range.from).toBeLessThan(range.to);
    expect(range.to).toBeCloseTo(Date.now(), -2);

    const diff = range.to - range.from;
    const expectedDiff = 7 * 24 * 60 * 60 * 1000;
    expect(diff).toBeCloseTo(expectedDiff, -2);
  });

  it('isWithinWindow returns true for recent timestamps', () => {
    const now = Date.now();
    expect(isWithinWindow(now, 7)).toBe(true);
    expect(isWithinWindow(now - 3600_000, 7)).toBe(true); // 1 hour ago
  });

  it('isWithinWindow returns false for old timestamps', () => {
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    expect(isWithinWindow(tenDaysAgo, 7)).toBe(false);
  });

  it('isWithinRange checks against explicit range', () => {
    const range = { from: 1000, to: 5000 };
    expect(isWithinRange(3000, range)).toBe(true);
    expect(isWithinRange(500, range)).toBe(false);
    expect(isWithinRange(6000, range)).toBe(false);
  });

  it('relativeTime produces human-readable strings', () => {
    const now = Date.now();
    expect(relativeTime(now - 30_000)).toMatch(/\d+s ago/);
    expect(relativeTime(now - 300_000)).toMatch(/\d+m ago/);
    expect(relativeTime(now - 7200_000)).toMatch(/\d+h ago/);
    expect(relativeTime(now - 172800_000)).toMatch(/\d+d ago/);
  });
});

describe('JSONL Streaming', () => {
  it('streamJsonlFile yields parsed objects', async () => {
    const items: unknown[] = [];
    for await (const item of streamJsonlFile(FIXTURE_PATH)) {
      items.push(item);
    }
    // 11 valid JSON lines (1 corrupt line should be skipped)
    expect(items.length).toBe(11);
  });

  it('readJsonlFile returns array of all valid objects', async () => {
    const items = await readJsonlFile(FIXTURE_PATH);
    expect(items.length).toBe(11);
  });

  it('all parsed items have a uuid field', async () => {
    const items = await readJsonlFile<{ uuid: string }>(FIXTURE_PATH);
    for (const item of items) {
      expect(item.uuid).toBeDefined();
      expect(typeof item.uuid).toBe('string');
    }
  });

  it('skips corrupt JSON lines silently', async () => {
    // The fixture has one corrupt line: "CORRUPT LINE — this should be skipped"
    // We should get 11 items, not 12 (11 valid + 1 corrupt)
    const items = await readJsonlFile(FIXTURE_PATH);
    expect(items.length).toBe(11);
  });
});
