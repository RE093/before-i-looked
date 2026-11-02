import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const NIGHT = '2026-01-01';

describe('readNight on the real log', () => {
  const digest = readNight('runs', '2026-10-28');
  const row = (job: string) => digest?.rows.find((r) => r.job === job);

  it('finds 5 jobs and 1 bad line, sorted by job', () => {
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps the last error after a later ok', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
    });
  });

  it('counts runs, retries and fails', () => {
    expect(row('lane/sync')).toMatchObject({ runs: 8, retries: 1 });
    expect(row('notes/backup')?.fails).toBe(1);
  });

  it('keeps a null owner and the times as logged', () => {
    expect(row('digest/render')?.owner).toBeNull();
    expect(row('fixtures/refresh')).toMatchObject({
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });
});

describe('readNight edge cases', () => {
  let root: string;
  let runsDir: string;
  const write = (text: string) => writeFileSync(join(runsDir, `${NIGHT}.jsonl`), text);
  const line = (fields: object) => JSON.stringify({ at: 't', job: 'a', status: 'ok', owner: 'x', ...fields });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'digest-read-'));
    runsDir = join(root, 'runs');
    mkdirSync(runsDir);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns null when the file or the directory is missing', () => {
    expect(readNight(runsDir, NIGHT)).toBeNull();
    expect(readNight(join(root, 'nope'), NIGHT)).toBeNull();
  });

  it('reads an empty file as no rows', () => {
    write('');
    expect(readNight(runsDir, NIGHT)).toEqual({ rows: [], badLines: 0 });
  });

  it('refuses a night that is not a date, even when the file exists', () => {
    writeFileSync(join(root, 'secret.jsonl'), `${line({})}\n`);
    writeFileSync(join(runsDir, 'x.jsonl'), `${line({})}\n`);
    write(`${line({})}\n`);
    for (const night of ['../secret', '..%2Fsecret', 'x', `${NIGHT}\n`, `../runs/${NIGHT}`, '']) {
      expect(readNight(runsDir, night)).toBeNull();
    }
  });

  it('counts malformed and invalid lines, not blank ones', () => {
    const bad = [
      '{nope',
      'null',
      '42',
      '[]',
      '"text"',
      line({ at: 1 }),
      line({ job: null }),
      line({ status: 'done' }),
      line({ owner: 7 }),
      JSON.stringify({ at: 't', job: 'a', status: 'ok' }),
    ];
    write(['', ...bad, '   ', line({}), '', ''].join('\n'));
    const digest = readNight(runsDir, NIGHT);
    expect(digest?.badLines).toBe(bad.length);
    expect(digest?.rows).toHaveLength(1);
  });

  it('sorts by code unit, not locale', () => {
    write([line({ job: 'a' }), line({ job: 'Z' }), line({ job: 'é' }), line({ job: 'B' })].join('\n'));
    expect(readNight(runsDir, NIGHT)?.rows.map((r) => r.job)).toEqual(['B', 'Z', 'a', 'é']);
  });

  it('uses file order for first and last, not the time values', () => {
    write([line({ at: '2', error: 'old' }), line({ at: '1', status: 'fail', error: 'new' }), line({ at: '3' })].join('\n'));
    expect(readNight(runsDir, NIGHT)?.rows[0]).toMatchObject({
      firstAt: '2',
      lastAt: '3',
      lastStatus: 'ok',
      lastError: 'new',
      fails: 1,
    });
  });

  it('treats a job named like an object key as a plain job', () => {
    write(line({ job: '__proto__' }));
    expect(readNight(runsDir, NIGHT)?.rows[0]?.job).toBe('__proto__');
  });
});
