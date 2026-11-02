import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightCounts = { night: string; ok: number; retry: number; fail: number };

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightCounts[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function nightCounts(runsDir: string, night: string): NightCounts {
  const digest = readNight(runsDir, night);
  const counts = { night, ok: 0, retry: 0, fail: 0 };
  for (const row of digest?.rows ?? []) {
    counts.retry += row.retries;
    counts.fail += row.fails;
    counts.ok += row.runs - row.retries - row.fails;
  }
  return counts;
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => nightCounts(config.runsDir, night)),
  };
}
