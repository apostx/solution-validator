/**
 * SolutionValidator: a deterministic, provider-neutral validator for software and
 * infrastructure solution designs.
 *
 * @packageDocumentation
 */

export {
  ANALYSIS_IDS,
  type AnalysisId,
  type AnalysisLevel,
  type AnalysisReport,
  type AnalysisResult,
  type AnalyzeOptions,
  analyze,
  LIBRARY_NAME,
  listFindings,
  type ModelValidityReport,
} from "./analysis/analyze";
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
  FINDING_CODES,
  type FindingCode,
  type FindingCodeDefinition,
  type FindingSource,
  type Severity,
} from "./messages/codes";
export { type Finding, type FindingParams, renderMessage } from "./messages/finding";
export { VERSION } from "./version";
