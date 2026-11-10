import type { ComponentType } from "../core/registry";
import type { Component } from "../core/solution-schema";
import { isBinding } from "../core/traits";
import { compareStrings } from "../util/compare";
import { canonicalJson, isObject } from "../util/json";
import { createEvidence, type Evidence } from "./verdict";

/**
 * - `strict`: anything unspecified makes the affected verdict `undecidable`.
 * - `pack-defaults`: the documented defaults of the packs are applied, and every assumption
 *   used is listed in the result.
 */
export type AssumptionPolicy = "strict" | "pack-defaults";

/** A pack default that the `pack-defaults` policy applied to an unset property. */
export interface Assumption {
  component: string;
  property: string;
  value: unknown;
}

/** A property the `strict` policy could not do without. */
export interface MissingProperty {
  component: string;
  property: string;
}

export type ParameterValue =
  | { known: true; value: unknown; evidence: Evidence[] }
  | { known: false; evidence: Evidence[]; missing?: MissingProperty };

/** Resolves trait parameters for one analysis run and records the assumptions it makes. */
export class ParameterResolver {
  readonly #policy: AssumptionPolicy;
  readonly #assumptions = new Map<string, Assumption>();

  constructor(policy: AssumptionPolicy) {
    this.#policy = policy;
  }

  /**
   * Returns a trait parameter's value: a fixed value from the type, or the bound property's
   * value. An unset property is unknown under `strict`; under `pack-defaults` its documented
   * default is used, if the pack has one.
   */
  resolve(component: Component, type: ComponentType, parameter: unknown): ParameterValue {
    if (!isBinding(parameter)) return { known: true, value: parameter, evidence: [] };
    const property = parameter.property;
    const properties = component.properties ?? {};
    if (Object.hasOwn(properties, property)) {
      return { known: true, value: properties[property], evidence: [] };
    }
    const fallback = type.properties[property]?.default;
    if (this.#policy === "pack-defaults" && fallback !== undefined) {
      const key = `${component.id}\u0000${property}`;
      this.#assumptions.set(key, { component: component.id, property, value: fallback });
      return {
        known: true,
        value: fallback,
        evidence: [
          createEvidence("PROPERTY_ASSUMED", {
            component: component.id,
            property,
            value: canonicalJson(fallback),
          }),
        ],
      };
    }
    return {
      known: false,
      evidence: [createEvidence("PROPERTY_UNSET", { component: component.id, property })],
      missing: { component: component.id, property },
    };
  }

  /** The assumptions made so far, sorted by component and property. */
  assumptions(): Assumption[] {
    return [...this.#assumptions.entries()]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([, assumption]) => assumption);
  }
}

/** Evidence for a parameter value that does not have the shape the check needs. */
export function invalidValue(component: Component, parameter: unknown): ParameterValue {
  const property = isBinding(parameter) ? parameter.property : "a trait parameter";
  return {
    known: false,
    evidence: [createEvidence("PROPERTY_INVALID", { component: component.id, property })],
  };
}

/** Reads an array of objects, keeping the items whose `field` is a string. */
export function stringFieldItems(
  value: unknown,
  field: string,
): { item: Record<string, unknown>; field: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) =>
    isObject(item) && typeof item[field] === "string"
      ? [{ item, field: item[field] as string }]
      : [],
  );
}
