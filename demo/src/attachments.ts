import type { Registry, Solution } from "solution-validator";

/** A network component attached to another one: a filter, a router or a gateway. */
export interface Attachment {
  kind: "filter" | "router" | "gateway";
  id: string;
  label: string;
}

/**
 * Which filters, routers and gateways are attached to which components and zones, read from the
 * types' trait bindings (`traffic-filter.targets`, `router.zones`, `gateway.connects`).
 */
export function attachmentsOf(solution: Solution, registry: Registry): Map<string, Attachment[]> {
  const result = new Map<string, Attachment[]>();
  for (const component of solution.components) {
    const type = registry.getType(component.type);
    if (!type) continue;
    const bindings = [
      ["filter", type.traits["traffic-filter"]?.targets],
      ["router", type.traits.router?.zones],
      ["gateway", type.traits.gateway?.connects],
    ] as const;
    for (const [kind, binding] of bindings) {
      const value = binding ? component.properties?.[binding.property] : undefined;
      if (!Array.isArray(value)) continue;
      for (const target of value) {
        if (typeof target !== "string") continue;
        const list = result.get(target) ?? [];
        list.push({ kind, id: component.id, label: component.label ?? component.id });
        result.set(target, list);
      }
    }
  }
  return result;
}
