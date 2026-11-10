import type { Finding } from "solution-validator";

interface FindingsPanelProps {
  findings: readonly Finding[];
  /** Whether the findings come from parsing (the model could not be built). */
  parseFailed: boolean;
  onSelectSubject(id: string): void;
}

export function FindingsPanel({ findings, parseFailed, onSelectSubject }: FindingsPanelProps) {
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
    </section>
  );
}
