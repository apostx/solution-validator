import type { SolutionModel } from "../core/model";
import { type Finding, hasErrors, sortFindings } from "../messages/finding";
import { VERSION } from "../version";
import { checkAccess } from "./access";
import { type AddressFact, checkAddressPlan } from "./address-plan";
import type { ExposureFact } from "./checks/access-checks";
import { checkConnectionValidity } from "./connection-validity";
import { checkModelValidity } from "./model-validity";
import type { Assumption, AssumptionPolicy } from "./parameters";
import type { IntentVerdict, Verdict } from "./verdict";

export const LIBRARY_NAME = "solution-validator";

/**
 * - `logical`: decided from logical settings, without addresses.
 * - `detailed`: also uses concrete values: address spaces, address ranges in rules and routes,
 *   and port ranges. Adds the `address-plan` analysis.
 */
export type AnalysisLevel = "logical" | "detailed";

export type AnalysisId = "model-validity" | "connection-validity" | "access" | "address-plan";

export interface AnalyzeOptions {
  /** Default: `logical`. */
  readonly level?: AnalysisLevel;
  /**
   * Default: every analysis that supports the level. Analyses another one needs are added:
   * `access` adds `connection-validity`, which reports compatibility failures.
   */
  readonly analyses?: readonly AnalysisId[];
  /** How unset properties are treated. Default: `strict`. */
  readonly assumptions?: AssumptionPolicy;
}

export interface ModelValidityReport {
  readonly id: "model-validity";
  /** True when the model has no error findings. */
  readonly valid: boolean;
  readonly findings: readonly Finding[];
}

/** How many intents reached each verdict. */
export type VerdictSummary = Readonly<Record<Verdict, number>>;

export interface ConnectionValidityReport {
  readonly id: "connection-validity";
  /** One verdict per intent, sorted by intent id. */
  readonly intents: readonly IntentVerdict[];
  readonly summary: VerdictSummary;
  readonly findings: readonly Finding[];
}

export interface AccessReport {
  readonly id: "access";
  /** One verdict per intent with the checks that apply, sorted by intent id. */
  readonly intents: readonly IntentVerdict[];
  readonly summary: VerdictSummary;
  /** Which components are directly accessible from the internet, sorted by component id. */
  readonly exposure: readonly ExposureFact[];
  /** Pack defaults the `pack-defaults` policy used; always empty under `strict`. */
  readonly assumptions: readonly Assumption[];
  readonly findings: readonly Finding[];
}

export interface AddressPlanReport {
  readonly id: "address-plan";
  /** Every zone with its address space, sorted by zone id. */
  readonly zones: readonly AddressFact[];
  readonly findings: readonly Finding[];
}

export type AnalysisReport =
  | ModelValidityReport
  | ConnectionValidityReport
  | AccessReport
  | AddressPlanReport;

export interface AnalysisResult {
  /** The library that produced the result, so that results can be reproduced. */
  readonly library: { readonly name: string; readonly version: string };
  /** The trait vocabulary version. */
  readonly vocabulary: number;
  /** The packs the solution uses, with their versions; sorted by id. */
  readonly packs: readonly { readonly id: string; readonly version: string }[];
  /** The effective options. */
  readonly options: {
    readonly level: AnalysisLevel;
    readonly analyses: readonly AnalysisId[];
    readonly assumptions: AssumptionPolicy;
  };
  /** One report per analysis, in the canonical order. */
  readonly analyses: readonly AnalysisReport[];
}

interface AnalysisDefinition {
  readonly id: AnalysisId;
  readonly levels: readonly AnalysisLevel[];
  /** Analyses that run whenever this one runs. */
  readonly requires?: readonly AnalysisId[];
  run(model: SolutionModel, policy: AssumptionPolicy, level: AnalysisLevel): AnalysisReport;
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
  {
    id: "connection-validity",
    levels: ["logical", "detailed"],
    run: (model) => {
      const { intents, findings } = checkConnectionValidity(model);
      return {
        id: "connection-validity",
        intents,
        summary: summarize(intents),
        findings: sortFindings(findings),
      };
    },
  },
  {
    id: "access",
    levels: ["logical", "detailed"],
    requires: ["connection-validity"],
    run: (model, policy, level) => {
      const { intents, exposure, assumptions, findings } = checkAccess(model, policy, level);
      return {
        id: "access",
        intents,
        summary: summarize(intents),
        exposure,
        assumptions,
        findings: sortFindings(findings),
      };
    },
  },
  {
    id: "address-plan",
    levels: ["detailed"],
    run: (model, policy) => {
      const { zones, findings } = checkAddressPlan(model, policy);
      return { id: "address-plan", zones, findings: sortFindings(findings) };
    },
  },
];

function summarize(intents: readonly IntentVerdict[]): VerdictSummary {
  const summary = { pass: 0, fail: 0, undecidable: 0 };
  for (const intent of intents) summary[intent.verdict] += 1;
  return summary;
}

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
  const policy = options.assumptions ?? "strict";
  if (policy !== "strict" && policy !== "pack-defaults") {
    throw new TypeError(`Unknown assumption policy: ${String(policy)}`);
  }
  const requested = options.analyses;
  const wanted = new Set<AnalysisId>();
  const add = (id: AnalysisId) => {
    const analysis = ANALYSES.find((candidate) => candidate.id === id);
    if (!analysis) throw new TypeError(`Unknown analysis: ${String(id)}`);
    if (!analysis.levels.includes(level)) {
      throw new TypeError(`Analysis ${id} does not support the ${level} level`);
    }
    wanted.add(id);
    for (const required of analysis.requires ?? []) add(required);
  };
  if (requested) {
    for (const id of requested) add(id);
  } else {
    for (const analysis of ANALYSES) if (analysis.levels.includes(level)) wanted.add(analysis.id);
  }
  const selected = ANALYSES.filter((analysis) => wanted.has(analysis.id));

  return {
    library: { name: LIBRARY_NAME, version: VERSION },
    vocabulary: model.registry.vocabulary,
    packs: model.packs.flatMap((id) => {
      const pack = model.registry.getPack(id);
      return pack ? [{ id: pack.id, version: pack.version }] : [];
    }),
    options: { level, analyses: selected.map((analysis) => analysis.id), assumptions: policy },
    analyses: selected.map((analysis) => analysis.run(model, policy, level)),
  };
}

/** All findings of a result, in analysis order. */
export function listFindings(result: AnalysisResult): Finding[] {
  return result.analyses.flatMap((report) => [...report.findings]);
}
