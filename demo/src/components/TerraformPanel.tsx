import { useMemo, useState } from "react";
import { exportTerraform, type SolutionModel } from "solution-validator";

function download(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** The solution exported to Terraform, as HCL or Terraform's JSON syntax. */
export function TerraformPanel({ model }: { model: SolutionModel | undefined }) {
  const [format, setFormat] = useState<"hcl" | "json">("hcl");
  const result = useMemo(() => (model ? exportTerraform(model) : undefined), [model]);
  if (!result) {
    return <p className="hint">The export needs a model that matches the solution schema.</p>;
  }
  const text = format === "hcl" ? result.hcl : `${JSON.stringify(result.json, null, 2)}\n`;
  const fileName = format === "hcl" ? "main.tf" : "main.tf.json";
  return (
    <div className="terraform-panel">
      <p className="hint">
        A starting point, not a deployable configuration: what the model does not hold becomes an
        input variable or a note below.
      </p>
      <div className="toolbar">
        <select
          aria-label="Terraform format"
          value={format}
          onChange={(event) => setFormat(event.target.value as "hcl" | "json")}
        >
          <option value="hcl">HCL (main.tf)</option>
          <option value="json">JSON (main.tf.json)</option>
        </select>
        <span className="spacer" />
        <button
          type="button"
          disabled={result.resources.length === 0}
          onClick={() =>
            download(fileName, text, format === "hcl" ? "text/plain" : "application/json")
          }
        >
          Download
        </button>
      </div>
      {result.resources.length === 0 ? (
        <p className="hint">None of the components has a Terraform mapping in its pack.</p>
      ) : (
        <pre className="terraform-code">{text}</pre>
      )}
      {result.findings.length > 0 && (
        <>
          <h3>Notes</h3>
          <ul className="terraform-notes">
            {result.findings.map((finding, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: notes may repeat
              <li key={`${finding.code}:${index}`} className={`severity-${finding.severity}`}>
                {finding.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
