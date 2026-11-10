import type { Assumption, ExposureFact, Finding } from "solution-validator";

interface FindingsPanelProps {
  findings: readonly Finding[];
  assumptions: readonly Assumption[];
  exposure: readonly ExposureFact[];
  /** Whether the findings come from parsing (the model could not be built). */
  parseFailed: boolean;
  onSelectSubject(id: string): void;
}

export function FindingsPanel({
  findings,
  assumptions,
  exposure,
  parseFailed,
  onSelectSubject,
}: FindingsPanelProps) {
  const exposed = exposure.filter((fact) => fact.exposure !== "not-exposed");
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  return (
    <section className="findings" aria-label="Findings">
      <h2>
        Findings{" "}
        <span className="counts">
          {errors} error{errors === 1 ? "" : "s"}, {warnings} warning{warnings === 1 ? "" : "s"}
        </span>
      </h2>
      {parseFailed && (
        <p className="error">
          The document does not match the solution schema, so it cannot be drawn. Fix it in the JSON
          view.
        </p>
      )}
      {findings.length === 0 ? (
        <p className="hint">No findings.</p>
      ) : (
        <ul>
          {findings.map((finding) => {
            const subject = finding.subjects[0];
            return (
              <li
                key={`${finding.code}:${finding.subjects.join(",")}:${finding.message}`}
                className={`severity-${finding.severity}`}
              >
                <span className="severity">{finding.severity}</span>
                <code className="code">{finding.code}</code>
                {subject ? (
                  <button type="button" className="link" onClick={() => onSelectSubject(subject)}>
                    {finding.message}
                  </button>
                ) : (
                  <span>{finding.message}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {exposed.length > 0 && (
        <>
          <h3>Accessible from the internet</h3>
          <ul>
            {exposed.map((fact) => (
              <li key={fact.component}>
                <button
                  type="button"
                  className="link"
                  onClick={() => onSelectSubject(fact.component)}
                >
                  <code>{fact.component}</code>{" "}
                  {fact.exposure === "exposed"
                    ? `exposed${fact.actions ? ` (${fact.actions.join(", ")})` : ""}`
                    : "undecidable"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {assumptions.length > 0 && (
        <>
          <h3>Assumptions (pack defaults)</h3>
          <ul>
            {assumptions.map((assumption) => (
              <li key={`${assumption.component}.${assumption.property}`}>
                <code>
                  {assumption.component}.{assumption.property} = {JSON.stringify(assumption.value)}
                </code>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
