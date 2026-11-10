import { compareStrings } from "../util/compare";
import { canonicalJson } from "../util/json";
import { FINDING_CODES, type FindingCode, type Severity } from "./codes";

/** Parameters of a finding, used to render its message. */
export type FindingParams = Record<string, string | number>;

/** A problem or observation reported by the library. */
export interface Finding {
  /** Stable code, for example `TYPE_UNKNOWN`. */
  code: FindingCode;
  severity: Severity;
  /** Ids of the components and intents (or packs and types) the finding is about. */
  subjects: string[];
  params: FindingParams;
  /** Default English text, rendered from the code's template and the parameters. */
  message: string;
}

/**
 * Renders a message template. `{name}` is replaced by the parameter `name`; numbers are written
 * with `String`, so the output does not depend on the locale.
 */
export function renderMessage(template: string, params: FindingParams): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

/** Creates a finding with the severity and message defined for its code. */
export function createFinding(
  code: FindingCode,
  subjects: readonly string[],
  params: FindingParams,
): Finding {
  const definition = FINDING_CODES[code];
  return {
    code,
    severity: definition.severity,
    subjects: [...subjects],
    params: { ...params },
    message: renderMessage(definition.template, params),
  };
}

/** Orders findings by subject, then code, then parameters. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    compareStrings(a.subjects.join("\u0000"), b.subjects.join("\u0000")) ||
    compareStrings(a.code, b.code) ||
    compareStrings(canonicalJson(a.params), canonicalJson(b.params))
  );
}

/** Returns the findings sorted and without exact duplicates. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  const sorted = [...findings].sort(compareFindings);
  return sorted.filter((finding, index) => {
    const previous = sorted[index - 1];
    return previous === undefined || compareFindings(previous, finding) !== 0;
  });
}

/** True when any finding is an error. */
export function hasErrors(findings: readonly Finding[]): boolean {
  return findings.some((finding) => finding.severity === "error");
}
