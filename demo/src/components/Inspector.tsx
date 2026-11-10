import type { Finding, IntentVerdict, Registry, Solution } from "solution-validator";
import { type Selection, setLabel, setProperty, updateIntent } from "../model";
import { PropertyField } from "./PropertyField";

interface InspectorProps {
  solution: Solution;
  registry: Registry;
  findings: readonly Finding[];
  intentVerdicts: ReadonlyMap<string, IntentVerdict>;
  selection: Selection;
  onChange(solution: Solution): void;
}

/** Edits the selected component's properties or the selected intent. */
export function Inspector({
  solution,
  registry,
  findings,
  intentVerdicts,
  selection,
  onChange,
}: InspectorProps) {
  if (!selection) {
    return (
      <p className="hint">
        Select a component or an arrow to edit it. Draw an arrow from a component's right handle to
        another component to add an intent.
      </p>
    );
  }
  const related = findings.filter((finding) => finding.subjects.includes(selection.id));
  if (selection.kind === "intent") {
    const intent = solution.intents?.find((candidate) => candidate.id === selection.id);
    if (!intent) return null;
    return (
      <div className="inspector">
        <h2>Intent {intent.id}</h2>
        <p className="intent-route">
          <code>{intent.from}</code> → <code>{intent.to}</code>
        </p>
        <label>
          <span>Action</span>
          <select
            value={intent.action ?? ""}
            onChange={(event) =>
              onChange(updateIntent(solution, intent.id, "action", event.target.value || undefined))
            }
          >
            <option value="">None</option>
            {registry.actions.map((action) => (
              <option key={action.id} value={action.id}>
                {action.label} ({action.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Port</span>
          <select
            value={typeof intent.port === "string" ? intent.port : ""}
            onChange={(event) =>
              onChange(updateIntent(solution, intent.id, "port", event.target.value || undefined))
            }
          >
            <option value="">None</option>
            {registry.ports.map((port) => (
              <option key={port.id} value={port.id}>
                {port.label} ({port.protocol}/{port.port})
              </option>
            ))}
          </select>
        </label>
        <VerdictDetails verdict={intentVerdicts.get(intent.id)} />
        <RelatedFindings findings={related} />
      </div>
    );
  }

  const component = solution.components.find((candidate) => candidate.id === selection.id);
  if (!component) return null;
  const type = registry.getType(component.type);
  const componentIds = solution.components.map((candidate) => candidate.id);
  const properties = component.properties ?? {};
  return (
    <div className="inspector">
      <h2>{component.label ?? component.id}</h2>
      <p className="type-line">
        {type ? type.label : "Unknown type"} · <code>{component.type}</code>
      </p>
      {type?.description && <p className="hint">{type.description}</p>}
      <label>
        <span>Id</span>
        <input type="text" value={component.id} readOnly />
      </label>
      <label>
        <span>Label</span>
        <input
          type="text"
          value={component.label ?? ""}
          placeholder={component.id}
          onChange={(event) => onChange(setLabel(solution, component.id, event.target.value))}
        />
      </label>
      {type && Object.keys(type.properties).length > 0 && (
        <fieldset>
          <legend>Properties</legend>
          {Object.entries(type.properties).map(([name, schema]) => (
            <div className="property" key={name}>
              <span className="property-name">
                {schema.title ?? name}
                {type.required.includes(name) && <abbr title="required">*</abbr>}
              </span>
              {schema.description && <span className="hint">{schema.description}</span>}
              <PropertyField
                schema={schema}
                value={properties[name]}
                optional
                label={schema.title ?? name}
                componentIds={componentIds}
                onChange={(value) => onChange(setProperty(solution, component.id, name, value))}
              />
            </div>
          ))}
        </fieldset>
      )}
      <RelatedFindings findings={related} />
    </div>
  );
}

function VerdictDetails({ verdict }: { verdict: IntentVerdict | undefined }) {
  if (!verdict) return null;
  return (
    <div className="verdict-details">
      <p>
        Verdict: <span className={`verdict verdict-${verdict.verdict}`}>{verdict.verdict}</span>
      </p>
      <ul>
        {verdict.checks.map((check) => (
          <li key={check.check}>
            <span className={`verdict verdict-${check.verdict}`}>{check.verdict}</span>{" "}
            <strong>{check.check}</strong>
            <ul>
              {check.evidence.map((evidence) => (
                <li key={`${evidence.code}:${evidence.message}`}>{evidence.message}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RelatedFindings({ findings }: { findings: readonly Finding[] }) {
  if (findings.length === 0) return null;
  return (
    <ul className="related-findings">
      {findings.map((finding) => (
        <li key={`${finding.code}:${finding.message}`} className={`severity-${finding.severity}`}>
          {finding.message}
        </li>
      ))}
    </ul>
  );
}
