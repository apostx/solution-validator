import type { SolutionModel } from "../core/model";
import { type Finding, hasErrors, sortFindings } from "../messages/finding";
import { VERSION } from "../version";
import { checkModelValidity } from "./model-validity";

export const LIBRARY_NAME = "solution-validator";

/**
 * - `logical`: decided from logical settings, without addresses.
 * - `detailed`: also uses concrete values such as CIDR ranges and port numbers (not yet
 *   implemented by any analysis except `model-validity`).
 */
export type AnalysisLevel = "logical" | "detailed";

export type AnalysisId = "model-validity";

export interface AnalyzeOptions {
  /** Default: `logical`. */
  readonly level?: AnalysisLevel;
  /** Default: every analysis that supports the level. */
  readonly analyses?: readonly AnalysisId[];
}

export interface ModelValidityReport {
  readonly id: "model-validity";
  /** True when the model has no error findings. */
  readonly valid: boolean;
  readonly findings: readonly Finding[];
}

export type AnalysisReport = ModelValidityReport;

export interface AnalysisResult {
  /** The library that produced the result, so that results can be reproduced. */
  readonly library: { readonly name: string; readonly version: string };
  /** The trait vocabulary version. */
  readonly vocabulary: number;
  /** The packs the solution uses, with their versions; sorted by id. */
  readonly packs: readonly { readonly id: string; readonly version: string }[];
  /** The effective options. */
  readonly options: { readonly level: AnalysisLevel; readonly analyses: readonly AnalysisId[] };
  /** One report per analysis, in the canonical order. */
  readonly analyses: readonly AnalysisReport[];
}

interface AnalysisDefinition {
  readonly id: AnalysisId;
  readonly levels: readonly AnalysisLevel[];
  run(model: SolutionModel): AnalysisReport;
}

/** The available analyses, in the order they run. */
const ANALYSES: readonly AnalysisDefinition[] = [
  {
    id: "model-validity",
    levels: ["logical", "detailed"],
    run: (model) => {
      const findings = sortFindings(checkModelValidity(model));
      return { id: "model-validity", valid: !hasErrors(findings), findings };
    },
  },
];

/** The ids of the available analyses, in the order they run. */
export const ANALYSIS_IDS: readonly AnalysisId[] = ANALYSES.map((analysis) => analysis.id);

/**
 * Runs analyses on a model. The same model and options always give the same result.
 *
 * Throws a `TypeError` for an unknown analysis id, or for an analysis that does not support the
 * requested level: these are programming errors, not problems of the solution.
 */
export function analyze(model: SolutionModel, options: AnalyzeOptions = {}): AnalysisResult {
  const level = options.level ?? "logical";
  if (level !== "logical" && level !== "detailed") {
    throw new TypeError(`Unknown analysis level: ${String(level)}`);
  }
  const requested = options.analyses;
  for (const id of requested ?? []) {
    const analysis = ANALYSES.find((candidate) => candidate.id === id);
    if (!analysis) throw new TypeError(`Unknown analysis: ${String(id)}`);
    if (!analysis.levels.includes(level)) {
      throw new TypeError(`Analysis ${id} does not support the ${level} level`);
    }
  }
  const selected = ANALYSES.filter((analysis) =>
    requested ? requested.includes(analysis.id) : analysis.levels.includes(level),
  );

  return {
    library: { name: LIBRARY_NAME, version: VERSION },
    vocabulary: model.registry.vocabulary,
    packs: model.packs.flatMap((id) => {
      const pack = model.registry.getPack(id);
      return pack ? [{ id: pack.id, version: pack.version }] : [];
    }),
    options: { level, analyses: selected.map((analysis) => analysis.id) },
    analyses: selected.map((analysis) => analysis.run(model)),
  };
}

/** All findings of a result, in analysis order. */
export function listFindings(result: AnalysisResult): Finding[] {
  return result.analyses.flatMap((report) => [...report.findings]);
}
