import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { DigestRow } from "../src/digest/types.js";

const NIGHT = "2026-10-28";
const JOBS = ["alpha-sync", "fail-job", "mid-report", "zeta-backup"];

const night = [
  '{"at":"2026-10-28T02:00:00+13:00","job":"zeta-backup","status":"ok","owner":"ana"}',
  '{"at":"2026-10-28T02:05:00+13:00","job":"mid-report","status":"retry","owner":"bo","error":"timeout"}',
  "this line is not json",
  '{"at":"2026-10-28T02:01:00+13:00","job":"alpha-sync","status":"ok","owner":null}',
  '{"at":"2026-10-28T02:10:00+13:00","job":"mid-report","status":"retry","owner":"bo","error":"timeout"}',
  '{"at":"2026-10-28T02:20:00+13:00","job":"fail-job","status":"ok","owner":"cy"}',
  '{"at":"2026-10-28T02:30:00+13:00","job":"mid-report","status":"retry","owner":"bo","error":"timeout"}',
  '{"at":"2026-10-28T02:40:00+13:00","job":"mid-report","status":"ok","owner":"bo"}',
  '{"at":"2026-10-28T03:00:00+13:00","job":"fail-job","status":"fail","owner":"cy","error":"disk full"}',
].join("\n");

// The table row (<tr>) holding a job's name, so assertions stay on one row.
function rowOf(html: string, job: string): string {
  const at = html.indexOf(job);
  if (at < 0) return "";
  return html.slice(html.lastIndexOf("<tr", at), html.indexOf("</tr>", at));
}

describe("digest routes", () => {
  const base = mkdtempSync(join(tmpdir(), "rig-digest-"));
  const runsDir = join(base, "runs");
  const app = createApp({
    adapter: "shim",
    installed: "2026-10-29T14:06:00+01:00",
    beatEverySeconds: 60,
    runsDir,
  });

  beforeAll(() => {
    mkdirSync(runsDir);
    writeFileSync(join(runsDir, `${NIGHT}.jsonl`), night + "\n");
    writeFileSync(join(runsDir, "2026-10-27.jsonl"), "");
    writeFileSync(join(base, "secret.jsonl"), night + "\n");
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  describe("GET /digest/:night", () => {
    it("renders one table row per job, sorted by job", async () => {
      const res = await app.request(`/digest/${NIGHT}`);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain("<table");
      const positions = JOBS.map((job) => html.indexOf(job));
      positions.forEach((at) => expect(at).toBeGreaterThan(-1));
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    it("renders a missing owner as an em dash", async () => {
      const html = await (await app.request(`/digest/${NIGHT}`)).text();
      expect(rowOf(html, "alpha-sync")).toContain("—");
    });

    it('marks retries of 3 or more and any fail with class="warn"', async () => {
      const html = await (await app.request(`/digest/${NIGHT}`)).text();
      expect(rowOf(html, "mid-report")).toContain('class="warn"');
      expect(rowOf(html, "fail-job")).toContain('class="warn"');
      expect(rowOf(html, "zeta-backup")).not.toContain('class="warn"');
    });

    it("counts bad lines in the page footer text", async () => {
      const html = await (await app.request(`/digest/${NIGHT}`)).text();
      expect(html).toContain("1 bad line(s) not counted");
    });

    it("returns 404 for a night with no file", async () => {
      expect((await app.request("/digest/2026-10-01")).status).toBe(404);
    });

    it('renders "nothing ran" and no table for an empty file', async () => {
      const res = await app.request("/digest/2026-10-27");
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain("nothing ran");
      expect(html).not.toContain("<table");
    });

    it("returns 404 for a traversal night outside the runs dir", async () => {
      expect((await app.request("/digest/..%2Fsecret")).status).toBe(404);
    });
  });

  describe("GET /api/digest/:night", () => {
    it("returns rows with the digest fields, sorted by job", async () => {
      const res = await app.request(`/api/digest/${NIGHT}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        rows: DigestRow[];
        badLines: number;
      };
      expect(body.rows.map((row) => row.job)).toEqual(JOBS);
      expect(body.badLines).toBe(1);
      for (const row of body.rows) {
        expect(row).toMatchObject({
          job: expect.any(String),
          runs: expect.any(Number),
          retries: expect.any(Number),
          fails: expect.any(Number),
          lastStatus: expect.any(String),
          firstAt: expect.any(String),
          lastAt: expect.any(String),
        });
      }
    });

    it("reports a missing owner as null and keeps the row", async () => {
      const body = (await (
        await app.request(`/api/digest/${NIGHT}`)
      ).json()) as {
        rows: DigestRow[];
      };
      expect(body.rows.find((row) => row.job === "alpha-sync")).toMatchObject({
        owner: null,
        runs: 1,
        lastStatus: "ok",
      });
    });

    it("counts retries and fails and keeps the offset in times", async () => {
      const body = (await (
        await app.request(`/api/digest/${NIGHT}`)
      ).json()) as {
        rows: DigestRow[];
      };
      expect(body.rows.find((row) => row.job === "mid-report")).toMatchObject({
        owner: "bo",
        runs: 4,
        retries: 3,
        fails: 0,
        lastStatus: "ok",
        firstAt: "2026-10-28T02:05:00+13:00",
        lastAt: "2026-10-28T02:40:00+13:00",
      });
      expect(body.rows.find((row) => row.job === "fail-job")).toMatchObject({
        fails: 1,
        lastStatus: "fail",
        lastError: "disk full",
      });
    });

    it("returns 404 for a night with no file", async () => {
      expect((await app.request("/api/digest/2026-10-01")).status).toBe(404);
    });

    it("returns no rows and zero bad lines for an empty file", async () => {
      const res = await app.request("/api/digest/2026-10-27");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ rows: [], badLines: 0 });
    });

    it("returns 404 for a traversal night outside the runs dir", async () => {
      expect((await app.request("/api/digest/..%2Fsecret")).status).toBe(404);
    });
  });

  it("lists the page jobs in the same order as the JSON rows", async () => {
    const html = await (await app.request(`/digest/${NIGHT}`)).text();
    const body = (await (await app.request(`/api/digest/${NIGHT}`)).json()) as {
      rows: DigestRow[];
    };
    const pageOrder = body.rows
      .map((row) => row.job)
      .map((job) => ({ job, at: html.indexOf(job) }))
      .sort((a, b) => a.at - b.at)
      .map((entry) => entry.job);
    expect(pageOrder).toEqual(body.rows.map((row) => row.job));
  });
});
