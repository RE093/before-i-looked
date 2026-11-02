export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  fails: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type NightDigest = { rows: DigestRow[]; badLines: number };

// null means no file for that night. Rows are sorted by job, so every reader sees one order.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
