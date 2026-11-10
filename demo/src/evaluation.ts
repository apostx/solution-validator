import {
  type AnalysisResult,
  analyze,
  type Finding,
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
}

const RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

export function evaluate(registry: Registry, document: unknown): Evaluation {
  const parsed = parseSolution(document, registry);
  if (!parsed.ok) {
    return { findings: [...parsed.findings], severityBySubject: new Map() };
  }
  const result = analyze(parsed.model);
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
  return { model: parsed.model, result, findings, severityBySubject };
}
