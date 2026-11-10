import { createFinding, type Finding } from "../messages/finding";
import { cloneJson } from "../util/json";
import type { ComponentType, Registry } from "./registry";
import { issuesToFindings, validateSchema } from "./schema-issues";
import { type Component, type Intent, Solution } from "./solution-schema";

/** A structurally valid solution, bound to the registry it was parsed with. */
export interface SolutionModel {
  readonly registry: Registry;
  /** A copy of the parsed input. */
  readonly solution: Solution;
  /** The listed packs and the packs they require, that are loaded; sorted. */
  readonly packs: readonly string[];
  readonly components: readonly Component[];
  readonly intents: readonly Intent[];
  /** The first component with the id. */
  getComponent(id: string): Component | undefined;
  /** The first intent with the id. */
  getIntent(id: string): Intent | undefined;
  /** The component's type, when it is defined by a pack the solution uses. */
  getType(component: Component): ComponentType | undefined;
}

export type ParseResult =
  | { readonly ok: true; readonly model: SolutionModel; readonly findings: readonly Finding[] }
  | { readonly ok: false; readonly findings: readonly Finding[] };

/**
 * Checks a solution's structure against the solution schema and returns a model, or the
 * schema findings. It never throws for invalid input. JSON text is accepted as well.
 *
 * Semantic checks (unknown types, references, property values) are the `model-validity`
 * analysis.
 */
export function parseSolution(input: unknown, registry: Registry): ParseResult {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return { ok: false, findings: [createFinding("JSON_INVALID", [], {})] };
    }
  }
  const issues = validateSchema(Solution, value);
  if (issues.length > 0) {
    return { ok: false, findings: issuesToFindings(issues, []) };
  }
  return { ok: true, model: createModel(cloneJson(value) as Solution, registry), findings: [] };
}

function createModel(solution: Solution, registry: Registry): SolutionModel {
  const components = solution.components;
  const intents = solution.intents ?? [];
  const componentIndex = new Map<string, Component>();
  for (const component of components) {
    if (!componentIndex.has(component.id)) componentIndex.set(component.id, component);
  }
  const intentIndex = new Map<string, Intent>();
  for (const intent of intents) {
    if (!intentIndex.has(intent.id)) intentIndex.set(intent.id, intent);
  }
  const packs = registry.resolvePacks(solution.packs);
  return Object.freeze({
    registry,
    solution,
    packs,
    components,
    intents,
    getComponent: (id: string) => componentIndex.get(id),
    getIntent: (id: string) => intentIndex.get(id),
    getType: (component: Component) => {
      const type = registry.getType(component.type);
      return type && packs.includes(type.pack) ? type : undefined;
    },
  });
}
