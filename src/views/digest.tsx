import type { DigestRow, NightDigest } from "../digest/types.js";

const dash = (value: string | null) => value ?? "—";

function mark(row: DigestRow) {
  const flags = [
    row.retries >= 3 ? "retries" : null,
    row.fails >= 1 ? "fail" : null,
  ].filter((flag): flag is string => flag !== null);
  return flags.length > 0 ? flags.join(" ") : "—";
}

export function DigestPage({
  night,
  digest,
}: {
  night: string;
  digest: NightDigest;
}) {
  return (
    <>
      <h1>{night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>fails</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
              <th>mark</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const warn = row.retries >= 3 || row.fails >= 1;
              return (
                <tr class={warn ? "warn" : undefined}>
                  <td>{row.job}</td>
                  <td>{dash(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.fails}</td>
                  <td>{row.lastStatus}</td>
                  <td>{dash(row.lastError)}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td>{mark(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {digest.badLines > 0 ? (
        <p class="warn">{digest.badLines} bad line(s) not counted</p>
      ) : null}
    </>
  );
}
