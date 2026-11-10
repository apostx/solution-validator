import {
  type AnalysisResult,
  type Assumption,
  type AssumptionPolicy,
  analyze,
  type ExposureFact,
  type Finding,
  type IntentVerdict,
  listFindings,
  parseSolution,
  type Registry,
  type Severity,
  type SolutionModel,
} from "solution-validator";

/** The library's view of the current document. */
export interface Evaluation {
  /** Set when the document is structurally valid. */
  model?: SolutionModel;
  result?: AnalysisResult;
  /** Parse findings, or the analysis findings when parsing succeeded. */
  findings: Finding[];
  /** The most severe finding per component or intent id. */
  severityBySubject: Map<string, Severity>;
  /** The verdict per intent id, from the most complete intent analysis that ran. */
  intentVerdicts: Map<string, IntentVerdict>;
  /** Whether each component is directly accessible from the internet. */
  exposure: Map<string, ExposureFact>;
  /** Pack defaults the `pack-defaults` policy applied. */
  assumptions: Assumption[];
}

const RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

export function evaluate(
  registry: Registry,
  document: unknown,
  assumptions: AssumptionPolicy,
): Evaluation {
  const parsed = parseSolution(document, registry);
  if (!parsed.ok) {
    return {
      findings: [...parsed.findings],
      severityBySubject: new Map(),
      intentVerdicts: new Map(),
      exposure: new Map(),
      assumptions: [],
    };
  }
  const result = analyze(parsed.model, { assumptions });
  const findings = listFindings(result);
  const severityBySubject = new Map<string, Severity>();
  for (const finding of findings) {
    for (const subject of finding.subjects) {
      const current = severityBySubject.get(subject);
      if (!current || RANK[finding.severity] > RANK[current]) {
        severityBySubject.set(subject, finding.severity);
      }
    }
  }
  const intentVerdicts = new Map<string, IntentVerdict>();
  // Analyses run from the simplest to the most complete, so later reports win.
  for (const report of result.analyses) {
    if (!("intents" in report)) continue;
    const seen = new Set<string>();
    for (const verdict of report.intents) {
      if (seen.has(verdict.intent)) continue;
      seen.add(verdict.intent);
      intentVerdicts.set(verdict.intent, verdict);
    }
  }
  const access = result.analyses.find((report) => report.id === "access");
  const exposure = new Map<string, ExposureFact>();
  for (const fact of access?.id === "access" ? access.exposure : [])
    exposure.set(fact.component, fact);
  return {
    model: parsed.model,
    result,
    findings,
    severityBySubject,
    intentVerdicts,
    exposure,
    assumptions: access?.id === "access" ? [...access.assumptions] : [],
  };
}
