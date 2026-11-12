import type { SolutionModel } from "../core/model";
import type { Component } from "../core/solution-schema";
import { createFinding, type Finding } from "../messages/finding";
import { parseCidr, parsePortRange } from "../util/ip";
import { isObject } from "../util/json";
import type { TerraformBlock, TerraformMapping, TerraformValue } from "./terraform-schema";

/** A Terraform expression that refers to something, such as `aws_vpc.main.id` or `var.ami`. */
export interface TerraformReference {
  ref: string;
}

/** A Terraform value: JSON data, or references inside it. */
export type TerraformData =
  | string
  | number
  | boolean
  | null
  | TerraformReference
  | TerraformData[]
  | { [key: string]: TerraformData };

export interface TerraformBlockOutput {
  name: string;
  arguments: Record<string, TerraformData>;
}

export interface TerraformResource {
  /** The resource type, for example `aws_subnet`. */
  type: string;
  /** The resource name, derived from the component id. */
  name: string;
  /** The component the resource comes from. */
  component: string;
  arguments: Record<string, TerraformData>;
  blocks: TerraformBlockOutput[];
}

export interface TerraformExport {
  providers: { name: string; source: string; blocks: string[] }[];
  variables: { name: string; description: string; type: string }[];
  resources: TerraformResource[];
  /** What could not be exported, and what the configuration still needs. */
  findings: Finding[];
  /** The configuration in Terraform's JSON syntax, for a `main.tf.json` file. */
  json: Record<string, unknown>;
  /** The configuration in HCL, for a `main.tf` file. */
  hcl: string;
}

interface Context {
  component: Component;
  /** The current item of a block or of an extra resource's `each`. */
  item?: unknown;
  /** How many blocks of the current block definition came before this one. */
  count?: number;
  argument: string;
}

/**
 * Exports a solution to Terraform, using the mappings of its packs. The result is a starting
 * point, not a deployable configuration: arguments the model does not hold are left to input
 * variables or listed as findings, and nothing is guessed.
 */
export function exportTerraform(model: SolutionModel): TerraformExport {
  const findings: Finding[] = [];
  const names = resourceNames(model);
  const usedVariables = new Set<string>();
  const usedPacks = new Set<string>();
  const resources: TerraformResource[] = [];

  const mappingOf = (component: Component): TerraformMapping | undefined =>
    model.getType(component)?.terraform;
  const resourceOf = (id: string): { type: string; name: string } | undefined => {
    const component = model.getComponent(id);
    const mapping = component && mappingOf(component);
    const name = names.get(id);
    return mapping && name ? { type: mapping.resource, name } : undefined;
  };

  const evaluate = (spec: TerraformValue, context: Context): TerraformData | undefined => {
    const { component } = context;
    const source = (): Record<string, unknown> =>
      context.item !== undefined && isObject(context.item)
        ? context.item
        : (component.properties ?? {});
    if ("value" in spec) return clone(spec.value);
    if ("id" in spec) return component.id;
    if ("variable" in spec) {
      usedVariables.add(spec.variable);
      return { ref: `var.${spec.variable}` };
    }
    if ("self" in spec) {
      const own = resourceOf(component.id);
      return own ? { ref: `${own.type}.${own.name}.${spec.self}` } : undefined;
    }
    if ("index" in spec) {
      const number = spec.index.start + (context.count ?? 0) * spec.index.step;
      return spec.prefix === undefined ? number : `${spec.prefix}${number}`;
    }
    if ("port" in spec) {
      const port = portValue(model, spec.port, source()[spec.property], context, findings);
      return port === undefined ? undefined : (mapValue(port, spec.map) as TerraformData);
    }
    if ("referencedBy" in spec) {
      const refs: TerraformData[] = [];
      for (const other of model.components) {
        if (other.type !== spec.referencedBy.type) continue;
        const value = other.properties?.[spec.referencedBy.property];
        const ids = Array.isArray(value) ? value : [value];
        const target = resourceOf(other.id);
        if (target && ids.includes(component.id)) {
          refs.push({ ref: `${target.type}.${target.name}.${spec.attribute}` });
        }
      }
      return refs.length > 0 ? refs : undefined;
    }
    if ("reference" in spec) {
      const raw =
        spec.reference === "placement"
          ? component.placement
          : spec.reference === "item"
            ? context.item
            : source()[spec.reference];
      const ids = (Array.isArray(raw) ? raw : [raw]).filter(
        (id): id is string => typeof id === "string" && model.getComponent(id) !== undefined,
      );
      const refs: TerraformData[] = [];
      const seen = new Set<string>();
      for (const id of ids) {
        const target = spec.network ? networkOf(model, id) : id;
        if (seen.has(target)) continue;
        seen.add(target);
        const type = model.getComponent(target)?.type;
        if (spec.types && (type === undefined || !spec.types.includes(type))) continue;
        const resource = resourceOf(target);
        if (!resource) {
          findings.push(
            createFinding("TERRAFORM_REFERENCE_UNMAPPED", [component.id, target], {
              component: component.id,
              target,
              argument: context.argument,
            }),
          );
          continue;
        }
        refs.push({ ref: `${resource.type}.${resource.name}.${spec.attribute}` });
      }
      if (refs.length === 0) return undefined;
      return spec.list ? refs : refs[0];
    }
    const raw = source()[spec.property] ?? spec.default;
    if (raw === undefined) return undefined;
    const entries = Array.isArray(raw) ? raw : [raw];
    let values = entries.map((entry) => mapValue(entry, spec.map));
    if (spec.ranges) {
      values = values.filter(
        (entry, index) =>
          entry !== entries[index] || (typeof entry === "string" && parseCidr(entry) !== undefined),
      );
    }
    if (spec.family !== undefined) {
      values = values.filter(
        (entry) => typeof entry === "string" && parseCidr(entry)?.family === spec.family,
      );
    }
    if (values.length === 0 && (spec.ranges || spec.family !== undefined || spec.first)) {
      return undefined;
    }
    if (spec.first) return clone(values[0]);
    if (spec.list || Array.isArray(raw)) return clone(values);
    return clone(values[0]);
  };

  const attributes = (
    specs: Record<string, TerraformValue> | undefined,
    context: Omit<Context, "argument">,
  ): Record<string, TerraformData> => {
    const result: Record<string, TerraformData> = {};
    for (const [argument, spec] of Object.entries(specs ?? {})) {
      const value = evaluate(spec, { ...context, argument });
      if (value !== undefined) result[argument] = value;
    }
    return result;
  };

  const blocks = (
    specs: readonly TerraformBlock[] | undefined,
    component: Component,
  ): TerraformBlockOutput[] => {
    const result: TerraformBlockOutput[] = [];
    for (const spec of specs ?? []) {
      let count = 0;
      if (spec.each === undefined) {
        const values = attributes(spec.attributes, { component });
        if (!spec.requireAny || spec.requireAny.some((name) => name in values)) {
          result.push({ name: spec.name, arguments: values });
        }
        continue;
      }
      const items = component.properties?.[spec.each];
      if (!Array.isArray(items)) continue;
      items.forEach((item, index) => {
        if (!isObject(item)) return;
        const where = Object.entries(spec.where ?? {});
        if (where.some(([field, value]) => item[field] !== value)) return;
        const expanded = spec.expand ? expand(item, spec.expand) : [item];
        for (const entry of expanded) {
          const values = attributes(spec.attributes, { component, item: entry, count });
          if (spec.requireAny && !spec.requireAny.some((name) => name in values)) {
            findings.push(
              createFinding("TERRAFORM_ITEM_SKIPPED", [component.id], {
                component: component.id,
                property: spec.each as string,
                index,
                target: `${spec.name} blocks`,
              }),
            );
            continue;
          }
          count += 1;
          result.push({ name: spec.name, arguments: values });
        }
      });
    }
    return result;
  };

  const seen = new Set<string>();
  for (const component of model.components) {
    if (seen.has(component.id)) continue;
    seen.add(component.id);
    const type = model.getType(component);
    if (!type) continue;
    const mapping = type.terraform;
    if (!mapping) {
      if (type.category !== "external") {
        findings.push(
          createFinding("TERRAFORM_NOT_MAPPED", [component.id], {
            component: component.id,
            type: type.id,
          }),
        );
      }
      continue;
    }
    usedPacks.add(type.pack);
    const name = names.get(component.id) as string;
    resources.push({
      type: mapping.resource,
      name,
      component: component.id,
      arguments: attributes(mapping.attributes, { component }),
      blocks: blocks(mapping.blocks, component),
    });
    noteAll(findings, component, mapping.resource, mapping.notes);
    for (const extra of mapping.extra ?? []) {
      const suffix = extra.suffix ?? extra.resource;
      const items =
        extra.each === undefined ? [undefined] : asIds(component.properties?.[extra.each]);
      items.forEach((item, index) => {
        const itemName = item === undefined ? suffix : `${suffix}_${terraformName(item)}`;
        const values = attributes(extra.attributes, { component, item });
        if (extra.requireAny && !extra.requireAny.some((argument) => argument in values)) {
          if (item !== undefined) {
            findings.push(
              createFinding("TERRAFORM_ITEM_SKIPPED", [component.id], {
                component: component.id,
                property: extra.each as string,
                index,
                target: extra.resource,
              }),
            );
          }
          return;
        }
        resources.push({
          type: extra.resource,
          name: `${name}_${itemName}`,
          component: component.id,
          arguments: values,
          blocks: blocks(extra.blocks, component),
        });
      });
      noteAll(findings, component, extra.resource, extra.notes);
    }
  }

  const providers: TerraformExport["providers"] = [];
  const variables: TerraformExport["variables"] = [];
  for (const pack of model.registry.packs) {
    if (!usedPacks.has(pack.id) || !pack.terraform) continue;
    for (const [providerName, provider] of Object.entries(pack.terraform.providers)) {
      if (providers.some((existing) => existing.name === providerName)) continue;
      providers.push({
        name: providerName,
        source: provider.source,
        blocks: provider.blocks ?? [],
      });
    }
  }
  for (const pack of model.registry.packs) {
    for (const [variableName, variable] of Object.entries(pack.terraform?.variables ?? {})) {
      if (!usedVariables.has(variableName)) continue;
      if (variables.some((existing) => existing.name === variableName)) continue;
      variables.push({ name: variableName, ...variable });
    }
  }

  const exported = { providers, variables, resources };
  return { ...exported, findings, json: toJson(exported), hcl: toHcl(exported) };
}

/** Resource names from component ids: letters, digits, `_` and `-`, starting with a letter or `_`. */
function resourceNames(model: SolutionModel): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const component of model.components) {
    if (names.has(component.id)) continue;
    let name = terraformName(component.id);
    for (let n = 2; used.has(name); n++) name = `${terraformName(component.id)}_${n}`;
    used.add(name);
    names.set(component.id, name);
  }
  return names;
}

export function terraformName(id: string): string {
  const name = id.replace(/[^A-Za-z0-9_-]/g, "_");
  return /^[A-Za-z_]/.test(name) ? name : `_${name}`;
}

/** The outermost zone a component is placed in, following first placements; itself if none. */
function networkOf(model: SolutionModel, id: string): string {
  let current = id;
  const visited = new Set<string>();
  while (!visited.has(current)) {
    visited.add(current);
    const component = model.getComponent(current);
    const parent = component?.placement?.find((zone) => {
      const candidate = model.getComponent(zone);
      return candidate !== undefined && model.getType(candidate)?.traits.zone !== undefined;
    });
    if (parent === undefined) return current;
    current = parent;
  }
  return current;
}

function mapValue(value: unknown, map: Record<string, unknown> | undefined): unknown {
  const key = typeof value === "boolean" ? String(value) : value;
  return map && typeof key === "string" && Object.hasOwn(map, key) ? map[key] : value;
}

function expand(item: Record<string, unknown>, field: string): Record<string, unknown>[] {
  const entries = item[field];
  if (!Array.isArray(entries) || entries.length <= 1) return [item];
  return entries.map((entry) => ({ ...item, [field]: [entry] }));
}

function asIds(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).filter(
    (entry): entry is string => typeof entry === "string",
  );
}

function clone(value: unknown): TerraformData {
  return JSON.parse(JSON.stringify(value ?? null)) as TerraformData;
}

function noteAll(
  findings: Finding[],
  component: Component,
  resource: string,
  notes: readonly string[] | undefined,
): void {
  for (const note of notes ?? []) {
    findings.push(
      createFinding("TERRAFORM_NOTE", [component.id], { component: component.id, resource, note }),
    );
  }
}

/** A port of a rule: `from`, `to` (0 for all), `range` (`*` for all) or `protocol` (`-1`). */
function portValue(
  model: SolutionModel,
  part: "from" | "to" | "range" | "protocol",
  ports: unknown,
  context: Context,
  findings: Finding[],
): TerraformData | undefined {
  const entries = Array.isArray(ports) ? ports : [];
  const entry = entries[0];
  if (typeof entry !== "string") return part === "protocol" ? "-1" : part === "range" ? "*" : 0;
  const known = model.registry.getPort(entry);
  const range = known
    ? { from: known.port, to: known.port, protocol: known.protocol }
    : (() => {
        const parsed = parsePortRange(entry);
        return parsed ? { ...parsed, protocol: "tcp" } : undefined;
      })();
  if (!range) {
    findings.push(
      createFinding("TERRAFORM_PORT_UNKNOWN", [context.component.id], {
        component: context.component.id,
        port: entry,
        argument: context.argument,
      }),
    );
    return undefined;
  }
  if (part === "range") {
    return range.from === range.to ? String(range.from) : `${range.from}-${range.to}`;
  }
  return part === "protocol" ? range.protocol : range[part];
}

type Exported = Pick<TerraformExport, "providers" | "variables" | "resources">;

function jsonValue(value: TerraformData): unknown {
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value !== null && typeof value === "object") {
    if (isReference(value)) return `\${${value.ref}}`;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonValue(entry)]));
  }
  return value;
}

function isReference(value: TerraformData): value is TerraformReference {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { ref?: unknown }).ref === "string"
  );
}

function toJson({ providers, variables, resources }: Exported): Record<string, unknown> {
  const document: Record<string, unknown> = {};
  if (providers.length > 0) {
    document.terraform = {
      required_providers: Object.fromEntries(
        providers.map((provider) => [provider.name, { source: provider.source }]),
      ),
    };
    document.provider = Object.fromEntries(
      providers.map((provider) => [
        provider.name,
        Object.fromEntries(provider.blocks.map((block) => [block, {}])),
      ]),
    );
  }
  if (variables.length > 0) {
    document.variable = Object.fromEntries(
      variables.map((variable) => [
        variable.name,
        { type: variable.type, description: variable.description },
      ]),
    );
  }
  const byType: Record<string, Record<string, unknown>> = {};
  for (const resource of resources) {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(resource.arguments)) body[key] = jsonValue(value);
    for (const block of resource.blocks) {
      const list = (body[block.name] as unknown[] | undefined) ?? [];
      list.push(jsonValue(block.arguments));
      body[block.name] = list;
    }
    const group = byType[resource.type] ?? {};
    group[resource.name] = body;
    byType[resource.type] = group;
  }
  if (resources.length > 0) document.resource = byType;
  return document;
}

function hclString(text: string): string {
  // Template sequences would be interpolated in HCL strings. A replacer function is needed,
  // because `$$` in a replacement string stands for a single `$`.
  return JSON.stringify(text)
    .replaceAll("${", () => "$${")
    .replaceAll("%{", () => "%%{");
}

function hclValue(value: TerraformData, indent: string): string {
  if (value === null) return "null";
  if (typeof value === "string") return hclString(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((entry) => hclValue(entry, indent)).join(", ")}]`;
  if (isReference(value)) return value.ref;
  const entries = Object.entries(value);
  if (entries.length === 0) return "{}";
  const inner = `${indent}  `;
  return `{\n${hclArguments(entries, inner)}\n${indent}}`;
}

function hclArguments(entries: [string, TerraformData][], indent: string): string {
  const width = Math.max(...entries.map(([key]) => key.length));
  return entries
    .map(([key, value]) => `${indent}${key.padEnd(width)} = ${hclValue(value, indent)}`)
    .join("\n");
}

function hclBody(
  arguments_: Record<string, TerraformData>,
  blocks: TerraformBlockOutput[],
): string {
  const parts: string[] = [];
  const entries = Object.entries(arguments_);
  if (entries.length > 0) parts.push(hclArguments(entries, "  "));
  for (const block of blocks) {
    const inner = Object.entries(block.arguments);
    parts.push(
      inner.length === 0
        ? `  ${block.name} {}`
        : `  ${block.name} {\n${hclArguments(inner, "    ")}\n  }`,
    );
  }
  return parts.join("\n\n");
}

function toHcl({ providers, variables, resources }: Exported): string {
  const sections: string[] = [];
  if (providers.length > 0) {
    const required = providers
      .map(
        (provider) =>
          `    ${provider.name} = {\n      source = ${hclString(provider.source)}\n    }`,
      )
      .join("\n");
    sections.push(`terraform {\n  required_providers {\n${required}\n  }\n}`);
    for (const provider of providers) {
      const blocks = provider.blocks.map((block) => `  ${block} {}`).join("\n");
      sections.push(
        blocks ? `provider "${provider.name}" {\n${blocks}\n}` : `provider "${provider.name}" {}`,
      );
    }
  }
  for (const variable of variables) {
    sections.push(
      `variable "${variable.name}" {\n  type        = ${variable.type}\n  description = ${hclString(variable.description)}\n}`,
    );
  }
  for (const resource of resources) {
    const body = hclBody(resource.arguments, resource.blocks);
    sections.push(
      body
        ? `resource "${resource.type}" "${resource.name}" {\n${body}\n}`
        : `resource "${resource.type}" "${resource.name}" {}`,
    );
  }
  return sections.length > 0 ? `${sections.join("\n\n")}\n` : "";
}
