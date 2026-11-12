import {
  type AnalysisLevel,
  type AnalysisResult,
  type Assumption,
  type AssumptionPolicy,
  type AvailabilityFact,
  analyze,
  checkRequirements,
  collect,
  type ExposureFact,
  type Facts,
  type Finding,
  type IntentVerdict,
  listFindings,
  parseSolution,
  type Registry,
  type RequirementsResult,
  type Severity,
  type SolutionModel,
  type Task,
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
  /** The failure domains each running component spans. */
  availability: Map<string, AvailabilityFact>;
  /** Pack defaults the `pack-defaults` policy applied. */
  assumptions: Assumption[];
  /** Requirement verdicts, when the scenario has a task. */
  requirements?: RequirementsResult;
  /** Metadata and structural facts. */
  facts?: Facts;
}

const RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

export function evaluate(
  registry: Registry,
  document: unknown,
  assumptions: AssumptionPolicy,
  task?: Task,
  level: AnalysisLevel = "logical",
): Evaluation {
  const parsed = parseSolution(document, registry);
  if (!parsed.ok) {
    return {
      findings: [...parsed.findings],
      severityBySubject: new Map(),
      intentVerdicts: new Map(),
      exposure: new Map(),
      availability: new Map(),
      assumptions: [],
    };
  }
  const result = analyze(parsed.model, { assumptions, level });
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
  const resilience = result.analyses.find((report) => report.id === "availability");
  const availability = new Map<string, AvailabilityFact>();
  for (const fact of resilience?.id === "availability" ? resilience.components : [])
    availability.set(fact.component, fact);
  return {
    model: parsed.model,
    result,
    findings,
    severityBySubject,
    intentVerdicts,
    exposure,
    availability,
    assumptions: access?.id === "access" ? [...access.assumptions] : [],
    ...(task ? { requirements: checkRequirements(parsed.model, result, task) } : {}),
    facts: collect(parsed.model, result),
  };
}
