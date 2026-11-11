import type { Facts } from "solution-validator";

/** The metadata and structural facts `collect` returns, as tables. */
export function FactsPanel({ facts }: { facts: Facts | undefined }) {
  if (!facts) return <p className="hint">Facts are collected once the model is valid JSON.</p>;
  const { totals } = facts;
  return (
    <div className="facts-panel">
      <p className="hint">
        What <code>collect</code> returns for consumers that compute their own scores or metrics.
        The library itself does not score.
      </p>
      <h3>Totals</h3>
      <ul className="totals">
        <li>
          {totals.components} components, {totals.intents} intents
        </li>
        <li>By category: {format(totals.byCategory)}</li>
        <li>By type: {format(totals.byType)}</li>
        {totals.byVerdict && <li>Intents by verdict: {format(totals.byVerdict)}</li>}
      </ul>
      <h3>Components</h3>
      <table>
        <thead>
          <tr>
            <th>Id</th>
            <th>Type</th>
            <th>In / out</th>
            <th>Exposure</th>
            <th>Meta</th>
          </tr>
        </thead>
        <tbody>
          {facts.components.map((component, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ids may repeat in an invalid model
            <tr key={`${component.id}:${index}`}>
              <td>{component.id}</td>
              <td>
                {component.type}
                {component.category && <div className="hint">{component.category}</div>}
              </td>
              <td>
                {component.incoming} / {component.outgoing}
              </td>
              <td>{component.exposure ?? "—"}</td>
              <td>
                <code>{JSON.stringify(withoutPosition(component.meta))}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Intents</h3>
      <table>
        <thead>
          <tr>
            <th>Id</th>
            <th>From → to</th>
            <th>Purpose</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {facts.intents.map((intent, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ids may repeat in an invalid model
            <tr key={`${intent.id}:${index}`}>
              <td>{intent.id}</td>
              <td>
                {intent.from} → {intent.to}
              </td>
              <td>
                {[intent.action, intent.port].filter((part) => part !== undefined).join(" · ")}
              </td>
              <td className={intent.verdict ? `verdict verdict-${intent.verdict}` : ""}>
                {intent.verdict ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function format(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  return entries.length === 0 ? "—" : entries.map(([key, count]) => `${key} ${count}`).join(", ");
}

/** The demo stores canvas positions in meta; they are hidden here to keep the table short. */
function withoutPosition(meta: Record<string, unknown>): Record<string, unknown> {
  const { position: _position, ...rest } = meta;
  return rest;
}
