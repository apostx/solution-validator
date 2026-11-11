/**
 * SolutionValidator: a deterministic, provider-neutral validator for software and
 * infrastructure solution designs.
 *
 * @packageDocumentation
 */

export type { AddressFact } from "./analysis/address-plan";
export {
  type AccessReport,
  type AddressPlanReport,
  ANALYSIS_IDS,
  type AnalysisId,
  type AnalysisLevel,
  type AnalysisReport,
  type AnalysisResult,
  type AnalyzeOptions,
  analyze,
  type ConnectionValidityReport,
  LIBRARY_NAME,
  listFindings,
  type ModelValidityReport,
  type VerdictSummary,
} from "./analysis/analyze";
export type { ExposureFact } from "./analysis/checks/access-checks";
export type { Assumption, AssumptionPolicy } from "./analysis/parameters";
export type {
  CheckId,
  CheckResult,
  Evidence,
  IntentVerdict,
  Verdict,
} from "./analysis/verdict";
export type { Meta } from "./core/ids";
export { type ParseResult, parseSolution, type SolutionModel } from "./core/model";
export {
  AcceptRule,
  ActionDefinition,
  CategoryDefinition,
  Pack,
  PortDefinition,
  TypeDefinition,
  TypeSelector,
} from "./core/pack-schema";
export { PropertySchema } from "./core/property-schema";
export {
  type ActionInfo,
  type CategoryInfo,
  type ComponentType,
  createRegistry,
  type PackInfo,
  type PortInfo,
  type Registry,
  RegistryError,
} from "./core/registry";
export { Component, Intent, SOLUTION_SCHEMA_VERSION, Solution } from "./core/solution-schema";
export {
  Binding,
  TRAIT_IDS,
  TRAIT_VOCABULARY_VERSION,
  type TraitId,
  TraitParameters,
  Traits,
} from "./core/traits";
export {
  EVIDENCE_CODES,
  type EvidenceCode,
  type EvidenceCodeDefinition,
  FINDING_CODES,
  type FindingCode,
  type FindingCodeDefinition,
  type FindingSource,
  type Severity,
} from "./messages/codes";
export { type Finding, type FindingParams, renderMessage } from "./messages/finding";
export {
  type CollectedComponent,
  type CollectedIntent,
  collect,
  type Facts,
} from "./query/collect";
export {
  checkRequirements,
  type RequirementResult,
  type RequirementsResult,
} from "./requirements/check-requirements";
export { type ParseTaskResult, parseTask } from "./requirements/parse-task";
export {
  NotReachableRequirement,
  ProvidedComponent,
  ReachableRequirement,
  Requirement,
  Selector,
  TASK_SCHEMA_VERSION,
  Task,
  UsesRequirement,
} from "./requirements/task-schema";
export { VERSION } from "./version";
