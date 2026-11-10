import { createFinding, type Finding, hasErrors, sortFindings } from "../messages/finding";
import { compareStrings } from "../util/compare";
import { cloneJson, isObject } from "../util/json";
import { type Meta, namespaceOf } from "./ids";
import {
  type AcceptRule,
  type ActionDefinition,
  type CategoryDefinition,
  Pack,
  type PortDefinition,
  type TypeDefinition,
} from "./pack-schema";
import type { PropertySchema, PropertySchemas } from "./property-schema";
import { issuesToFindings, validateSchema } from "./schema-issues";
import { satisfies } from "./semver";
import {
  type BindingExpectation,
  bindingSlots,
  describeExpectation,
  isTraitId,
  TRAIT_VOCABULARY_VERSION,
  type Traits,
} from "./traits";

/** A loaded pack. */
export interface PackInfo {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly description?: string;
  readonly vocabulary: number;
  readonly requires: Readonly<Record<string, string>>;
  readonly meta: Meta;
}

/** A component type from a loaded pack. */
export interface ComponentType {
  readonly id: string;
  readonly pack: string;
  readonly label: string;
  readonly description?: string;
  readonly category: string;
  readonly traits: Traits;
  readonly accepts: readonly AcceptRule[];
  readonly properties: PropertySchemas;
  readonly required: readonly string[];
  readonly meta: Meta;
}

export interface CategoryInfo extends CategoryDefinition {
  readonly pack: string;
}
export interface ActionInfo extends ActionDefinition {
  readonly pack: string;
}
export interface PortInfo extends PortDefinition {
  readonly pack: string;
}

/** Validated packs, with their types, categories, actions and ports resolved by id. */
export interface Registry {
  /** The trait vocabulary version this library implements. */
  readonly vocabulary: number;
  /** Loaded packs, sorted by id. */
  readonly packs: readonly PackInfo[];
  /** Component types in load order: packs in the order given, types in definition order. */
  readonly types: readonly ComponentType[];
  readonly categories: readonly CategoryInfo[];
  readonly actions: readonly ActionInfo[];
  readonly ports: readonly PortInfo[];
  getPack(id: string): PackInfo | undefined;
  getType(id: string): ComponentType | undefined;
  getCategory(id: string): CategoryInfo | undefined;
  getAction(id: string): ActionInfo | undefined;
  getPort(id: string): PortInfo | undefined;
  /** The given packs and every pack they require, transitively, that is loaded; sorted. */
  resolvePacks(ids: readonly string[]): string[];
}

/** Thrown by `createRegistry` when a pack is invalid. */
export class RegistryError extends Error {
  readonly findings: readonly Finding[];

  constructor(findings: readonly Finding[]) {
    const first = findings[0];
    super(
      `Invalid packs: ${findings.length} problem(s)${first ? `. First: ${first.message}` : ""}`,
    );
    this.name = "RegistryError";
    this.findings = findings;
  }
}

type DefinitionKind = "type" | "category" | "action" | "port";

/**
 * Loads and validates packs. Throws a `RegistryError` with findings when a pack is invalid:
 * a schema violation, an unsupported vocabulary version, a missing or incompatible required
 * pack, an id outside the pack's namespace, a duplicate definition, an unknown reference, or a
 * trait parameter bound to an unsuitable property.
 */
export function createRegistry(packs: readonly unknown[]): Registry {
  const findings: Finding[] = [];
  const loaded: Pack[] = [];

  packs.forEach((input, index) => {
    const subject = isObject(input) && typeof input.id === "string" ? input.id : `packs[${index}]`;
    const issues = validateSchema(Pack, input);
    if (issues.length > 0) {
      findings.push(...issuesToFindings(issues, [subject]));
      return;
    }
    const pack = cloneJson(input) as Pack;
    if (loaded.some((other) => other.id === pack.id)) {
      findings.push(createFinding("PACK_DUPLICATE", [pack.id], { pack: pack.id }));
      return;
    }
    loaded.push(pack);
  });

  const byId = new Map(loaded.map((pack) => [pack.id, pack]));
  for (const pack of loaded) {
    findings.push(...checkPackHeader(pack, byId));
  }
  findings.push(...checkDefinitions(loaded, byId));

  if (hasErrors(findings)) throw new RegistryError(sortFindings(findings));
  return buildRegistry(loaded);
}

function checkPackHeader(pack: Pack, byId: ReadonlyMap<string, Pack>): Finding[] {
  const findings: Finding[] = [];
  if (pack.vocabulary > TRAIT_VOCABULARY_VERSION) {
    findings.push(
      createFinding("PACK_VOCABULARY_UNSUPPORTED", [pack.id], {
        pack: pack.id,
        required: pack.vocabulary,
        provided: TRAIT_VOCABULARY_VERSION,
      }),
    );
  }
  for (const [required, range] of Object.entries(pack.requires ?? {})) {
    const dependency = byId.get(required);
    if (!dependency) {
      findings.push(
        createFinding("PACK_REQUIREMENT_MISSING", [pack.id], { pack: pack.id, required }),
      );
    } else if (!satisfies(dependency.version, range)) {
      findings.push(
        createFinding("PACK_REQUIREMENT_VERSION", [pack.id], {
          pack: pack.id,
          required,
          range,
          version: dependency.version,
        }),
      );
    }
  }
  return findings;
}

interface Definition {
  kind: DefinitionKind;
  id: string;
  pack: string;
}

function definitionsOf(pack: Pack): Definition[] {
  return [
    ...(pack.types ?? []).map((d) => ({ kind: "type" as const, id: d.id, pack: pack.id })),
    ...(pack.categories ?? []).map((d) => ({ kind: "category" as const, id: d.id, pack: pack.id })),
    ...(pack.actions ?? []).map((d) => ({ kind: "action" as const, id: d.id, pack: pack.id })),
    ...(pack.ports ?? []).map((d) => ({ kind: "port" as const, id: d.id, pack: pack.id })),
  ];
}

function checkDefinitions(packs: readonly Pack[], byId: ReadonlyMap<string, Pack>): Finding[] {
  const findings: Finding[] = [];
  const all = packs.flatMap(definitionsOf);

  for (const definition of all) {
    if (namespaceOf(definition.id) !== definition.pack) {
      const prefix = `${definition.pack}.`;
      findings.push(
        createFinding("PACK_NAMESPACE", [definition.pack], {
          kind: definition.kind,
          id: definition.id,
          pack: definition.pack,
          prefix,
        }),
      );
    }
  }

  const seen = new Set<string>();
  for (const definition of all) {
    const key = `${definition.kind}:${definition.id}`;
    if (seen.has(key)) {
      findings.push(
        createFinding("PACK_DEFINITION_DUPLICATE", [definition.pack], {
          kind: definition.kind,
          id: definition.id,
        }),
      );
    }
    seen.add(key);
  }

  for (const pack of packs) {
    // A pack sees its own definitions and those of the packs it requires, transitively.
    const visible = new Set<string>();
    const visit = (id: string) => {
      const current = byId.get(id);
      if (visible.has(id) || !current) return;
      visible.add(id);
      for (const required of Object.keys(current.requires ?? {})) visit(required);
    };
    visit(pack.id);
    const isVisible = (kind: DefinitionKind, id: string) =>
      all.some((d) => d.kind === kind && d.id === id && visible.has(d.pack));
    (pack.types ?? []).forEach((type, index) => {
      findings.push(...checkType(pack.id, type, `/types/${index}`, isVisible));
    });
  }
  return findings;
}

function checkType(
  packId: string,
  type: TypeDefinition,
  base: string,
  isVisible: (kind: DefinitionKind, id: string) => boolean,
): Finding[] {
  const findings: Finding[] = [];
  const unknown = (path: string, kind: string, id: string) =>
    findings.push(
      createFinding("PACK_REFERENCE_UNKNOWN", [packId, type.id], { path, pack: packId, kind, id }),
    );

  if (!isVisible("category", type.category)) unknown(`${base}/category`, "category", type.category);

  const traits = type.traits ?? {};
  traits.endpoint?.ports?.forEach((port, i) => {
    if (!isVisible("port", port)) unknown(`${base}/traits/endpoint/ports/${i}`, "port", port);
  });
  const accessControlled = traits["access-controlled"];
  if (accessControlled) {
    for (const [level, actions] of Object.entries(accessControlled.levels)) {
      actions.forEach((action, i) => {
        if (!isVisible("action", action)) {
          unknown(`${base}/traits/access-controlled/levels/${level}/${i}`, "action", action);
        }
      });
    }
    accessControlled.publicActions?.forEach((action, i) => {
      if (!isVisible("action", action)) {
        unknown(`${base}/traits/access-controlled/publicActions/${i}`, "action", action);
      }
    });
  }

  (type.accepts ?? []).forEach((rule, r) => {
    const path = `${base}/accepts/${r}`;
    if (rule.from?.type && !isVisible("type", rule.from.type)) {
      unknown(`${path}/from/type`, "type", rule.from.type);
    }
    if (rule.from?.category && !isVisible("category", rule.from.category)) {
      unknown(`${path}/from/category`, "category", rule.from.category);
    }
    if (rule.from?.trait && !isTraitId(rule.from.trait)) {
      unknown(`${path}/from/trait`, "trait", rule.from.trait);
    }
    rule.actions?.forEach((action, i) => {
      if (!isVisible("action", action)) unknown(`${path}/actions/${i}`, "action", action);
    });
    rule.ports?.forEach((port, i) => {
      if (!isVisible("port", port)) unknown(`${path}/ports/${i}`, "port", port);
    });
  });

  const properties = type.properties ?? {};
  (type.required ?? []).forEach((name, i) => {
    if (!(name in properties)) unknown(`${base}/required/${i}`, "property", name);
  });

  for (const slot of bindingSlots(traits)) {
    const path = `${base}/traits/${slot.trait}/${slot.parameter}`;
    const property = properties[slot.binding.property];
    if (!property) {
      unknown(path, "property", slot.binding.property);
    } else if (!fits(property, slot.expectation)) {
      findings.push(
        createFinding("PACK_BINDING_MISMATCH", [packId, type.id], {
          path,
          pack: packId,
          trait: slot.trait,
          parameter: slot.parameter,
          property: slot.binding.property,
          expected: describeExpectation(slot.expectation),
        }),
      );
    }
  }

  for (const [name, schema] of Object.entries(properties)) {
    if (schema.default !== undefined) {
      const issues = validateSchema(schema, schema.default);
      if (issues.length > 0) {
        findings.push(
          createFinding("PACK_PROPERTY_DEFAULT_INVALID", [packId, type.id], {
            property: name,
            type: type.id,
          }),
        );
      }
    }
  }
  return findings;
}

function fits(schema: PropertySchema, expectation: BindingExpectation): boolean {
  switch (expectation.kind) {
    case "enum":
      return (
        schema.type === "string" &&
        Array.isArray(schema.enum) &&
        schema.enum.every((value) => expectation.values.includes(value))
      );
    case "boolean":
    case "string":
    case "integer":
      return schema.type === expectation.kind;
    case "references":
      return (
        schema.type === "array" &&
        schema.items.type === "string" &&
        schema.items["x-component-ref"] === true
      );
    case "objects": {
      if (schema.type !== "array" || schema.items.type !== "object") return false;
      const fields = schema.items.properties;
      return expectation.fields.every((field) => {
        const fieldSchema = fields[field.name];
        if (fieldSchema?.type !== "string") return false;
        return !field.reference || fieldSchema["x-component-ref"] === true;
      });
    }
  }
}

function buildRegistry(packs: readonly Pack[]): Registry {
  const packInfos = packs
    .map(
      (pack): PackInfo => ({
        id: pack.id,
        version: pack.version,
        label: pack.label,
        ...(pack.description === undefined ? {} : { description: pack.description }),
        vocabulary: pack.vocabulary,
        requires: { ...(pack.requires ?? {}) },
        meta: pack.meta ?? {},
      }),
    )
    .sort((a, b) => compareStrings(a.id, b.id));

  const types = packs.flatMap((pack) =>
    (pack.types ?? []).map(
      (type): ComponentType => ({
        id: type.id,
        pack: pack.id,
        label: type.label,
        ...(type.description === undefined ? {} : { description: type.description }),
        category: type.category,
        traits: type.traits ?? {},
        accepts: type.accepts ?? [],
        properties: type.properties ?? {},
        required: type.required ?? [],
        meta: type.meta ?? {},
      }),
    ),
  );
  const categories = packs.flatMap((pack) =>
    (pack.categories ?? []).map((category): CategoryInfo => ({ ...category, pack: pack.id })),
  );
  const actions = packs.flatMap((pack) =>
    (pack.actions ?? []).map((action): ActionInfo => ({ ...action, pack: pack.id })),
  );
  const ports = packs.flatMap((pack) =>
    (pack.ports ?? []).map((port): PortInfo => ({ ...port, pack: pack.id })),
  );

  const index = <T extends { id: string }>(items: readonly T[]) =>
    new Map(items.map((item) => [item.id, item]));
  const packIndex = index(packInfos);
  const typeIndex = index(types);
  const categoryIndex = index(categories);
  const actionIndex = index(actions);
  const portIndex = index(ports);

  const registry: Registry = {
    vocabulary: TRAIT_VOCABULARY_VERSION,
    packs: packInfos,
    types,
    categories,
    actions,
    ports,
    getPack: (id) => packIndex.get(id),
    getType: (id) => typeIndex.get(id),
    getCategory: (id) => categoryIndex.get(id),
    getAction: (id) => actionIndex.get(id),
    getPort: (id) => portIndex.get(id),
    resolvePacks: (ids) => {
      const resolved = new Set<string>();
      const visit = (id: string) => {
        const pack = packIndex.get(id);
        if (!pack || resolved.has(id)) return;
        resolved.add(id);
        for (const required of Object.keys(pack.requires)) visit(required);
      };
      for (const id of ids) visit(id);
      return [...resolved].sort(compareStrings);
    },
  };
  return Object.freeze(registry);
}
