import type { SolutionModel } from "../core/model";
import { findComponentReferences, propertiesValidationSchema } from "../core/property-schema";
import { issuesToFindings, validateSchema } from "../core/schema-issues";
import type { Component } from "../core/solution-schema";
import { createFinding, type Finding } from "../messages/finding";
import { compareStrings } from "../util/compare";
import { isCidr } from "../util/ipv4";

/**
 * Checks what the solution schema alone cannot: packs, unique ids, known types, property values
 * against the types' property schemas, references, placement, and intents' actions and ports.
 */
export function checkModelValidity(model: SolutionModel): Finding[] {
  return [
    ...checkPacks(model),
    ...checkIds(model),
    ...checkComponents(model),
    ...checkNetworkReferences(model),
    ...checkIntents(model),
  ];
}

function checkPacks(model: SolutionModel): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const pack of model.solution.packs) {
    if (seen.has(pack)) {
      findings.push(createFinding("SOLUTION_PACK_DUPLICATE", [], { pack }));
    } else if (!model.registry.getPack(pack)) {
      findings.push(createFinding("SOLUTION_PACK_UNKNOWN", [], { pack }));
    }
    seen.add(pack);
  }
  return findings;
}

function checkIds(model: SolutionModel): Finding[] {
  const counts = new Map<string, number>();
  for (const element of [...model.components, ...model.intents]) {
    counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([id]) => createFinding("ID_DUPLICATE", [id], { id }));
}

function checkComponents(model: SolutionModel): Finding[] {
  const findings: Finding[] = [];
  model.components.forEach((component, index) => {
    const base = `/components/${index}`;
    const type = model.registry.getType(component.type);
    if (!type) {
      findings.push(
        createFinding("TYPE_UNKNOWN", [component.id], {
          component: component.id,
          type: component.type,
        }),
      );
    } else {
      if (!model.packs.includes(type.pack)) {
        findings.push(
          createFinding("TYPE_PACK_NOT_LISTED", [component.id], {
            component: component.id,
            type: type.id,
            pack: type.pack,
          }),
        );
      }
      const values = component.properties ?? {};
      const schema = propertiesValidationSchema(type.properties, type.required);
      for (const issue of validateSchema(schema, values)) {
        if (issue.kind === "unknown-field" && issue.path === "") {
          findings.push(
            createFinding("PROPERTY_UNKNOWN", [component.id], {
              component: component.id,
              property: issue.field,
              type: type.id,
            }),
          );
        } else {
          findings.push(...issuesToFindings([issue], [component.id], `${base}/properties`));
        }
      }
      for (const reference of findComponentReferences(type.properties, values)) {
        if (!model.getComponent(reference.id)) {
          findings.push(
            createFinding("REFERENCE_UNKNOWN", [component.id], {
              path: `${base}/properties${reference.path}`,
              id: reference.id,
            }),
          );
        }
      }
    }

    (component.placement ?? []).forEach((zoneId, position) => {
      const zone = model.getComponent(zoneId);
      if (!zone) {
        findings.push(
          createFinding("REFERENCE_UNKNOWN", [component.id], {
            path: `${base}/placement/${position}`,
            id: zoneId,
          }),
        );
        return;
      }
      const zoneType = model.registry.getType(zone.type);
      if (zoneType && !zoneType.traits.zone) {
        findings.push(
          createFinding("PLACEMENT_NOT_ZONE", [component.id], {
            component: component.id,
            zone: zoneId,
          }),
        );
      }
    });
  });
  findings.push(...checkPlacementCycles(model));
  return findings;
}

function checkPlacementCycles(model: SolutionModel): Finding[] {
  const findings: Finding[] = [];
  const reported = new Set<string>();
  const parents = (component: Component) =>
    (component.placement ?? []).filter((id) => model.getComponent(id) !== undefined);

  for (const start of model.components) {
    // Depth-first search for a path from `start` back to itself.
    const stack: { id: string; path: string[] }[] = [{ id: start.id, path: [start.id] }];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      const component = model.getComponent(current.id);
      if (!component) continue;
      for (const parent of parents(component)) {
        if (parent === start.id) {
          const cycle = [...current.path];
          const key = [...cycle].sort(compareStrings).join("\u0000");
          if (!reported.has(key)) {
            reported.add(key);
            findings.push(
              createFinding("PLACEMENT_CYCLE", [start.id], {
                component: start.id,
                chain: [...cycle, start.id].join(" > "),
              }),
            );
          }
        } else if (!visited.has(parent)) {
          visited.add(parent);
          stack.push({ id: parent, path: [...current.path, parent] });
        }
      }
    }
  }
  return findings;
}

function checkIntents(model: SolutionModel): Finding[] {
  const findings: Finding[] = [];
  const usable = (pack: string | undefined) => pack !== undefined && model.packs.includes(pack);

  model.intents.forEach((intent, index) => {
    const base = `/intents/${index}`;
    for (const end of ["from", "to"] as const) {
      if (!model.getComponent(intent[end])) {
        findings.push(
          createFinding("REFERENCE_UNKNOWN", [intent.id], {
            path: `${base}/${end}`,
            id: intent[end],
          }),
        );
      }
    }
    if (intent.from === intent.to) {
      findings.push(
        createFinding("INTENT_SELF", [intent.id], { intent: intent.id, component: intent.from }),
      );
    }
    if (intent.action === undefined && intent.port === undefined) {
      findings.push(createFinding("INTENT_PURPOSE_MISSING", [intent.id], { intent: intent.id }));
    }
    if (intent.action !== undefined && !usable(model.registry.getAction(intent.action)?.pack)) {
      findings.push(
        createFinding("ACTION_UNKNOWN", [intent.id], { intent: intent.id, action: intent.action }),
      );
    }
    if (typeof intent.port === "string" && !usable(model.registry.getPort(intent.port)?.pack)) {
      findings.push(
        createFinding("PORT_UNKNOWN", [intent.id], { intent: intent.id, port: intent.port }),
      );
    }
  });
  return findings;
}

const RULE_PEERS = ["any", "internet"];

/**
 * Checks what network traits refer to: routers serve zones and route to gateways, gateways
 * connect zones, traffic filters attach to the kinds their `attachTo` allows, and rule peers are
 * `any`, `internet` or an existing id. Missing ids are reported by the property schemas.
 */
function checkNetworkReferences(model: SolutionModel): Finding[] {
  const findings: Finding[] = [];
  const isZone = (id: string) => {
    const component = model.getComponent(id);
    return component !== undefined && model.getType(component)?.traits.zone !== undefined;
  };
  const isGateway = (id: string) => {
    const component = model.getComponent(id);
    return component !== undefined && model.getType(component)?.traits.gateway !== undefined;
  };

  model.components.forEach((component, index) => {
    const type = model.getType(component);
    if (!type) return;
    const properties = component.properties ?? {};
    const base = `/components/${index}/properties`;
    const values = (binding: { property: string } | undefined) =>
      binding && Array.isArray(properties[binding.property])
        ? (properties[binding.property] as unknown[])
        : [];
    const invalid = (path: string, expected: string, id: string) =>
      findings.push(
        createFinding("NETWORK_REFERENCE_INVALID", [component.id], { path, expected, id }),
      );
    const check = (
      binding: { property: string } | undefined,
      expected: string,
      valid: (id: string) => boolean,
      field?: string,
    ) => {
      values(binding).forEach((item, position) => {
        const value =
          field === undefined
            ? item
            : typeof item === "object" && item !== null
              ? (item as Record<string, unknown>)[field]
              : undefined;
        if (typeof value !== "string" || model.getComponent(value) === undefined) return;
        if (!valid(value)) {
          const path = `${base}/${binding?.property}/${position}${field ? `/${field}` : ""}`;
          invalid(path, expected, value);
        }
      });
    };

    const { router, gateway } = type.traits;
    const filter = type.traits["traffic-filter"];
    if (router) {
      check(router.zones, "a zone", isZone);
      check(router.routes, "a gateway", isGateway, "gateway");
      values(router.routes).forEach((route, position) => {
        const destination =
          typeof route === "object" && route !== null
            ? (route as Record<string, unknown>).destination
            : undefined;
        // Address ranges, valid or not, are the address plan's concern.
        if (
          typeof destination !== "string" ||
          destination === "internet" ||
          isCidr(destination) ||
          /^[0-9.]+\/[0-9]+$/.test(destination)
        ) {
          return;
        }
        if (model.getComponent(destination) === undefined) {
          findings.push(
            createFinding("REFERENCE_UNKNOWN", [component.id], {
              path: `${base}/${router.routes?.property}/${position}/destination`,
              id: destination,
            }),
          );
        }
      });
    }
    if (gateway) check(gateway.connects, "a zone", isZone);
    if (filter) {
      const zones = filter.attachTo.includes("zone");
      const components = filter.attachTo.includes("component");
      const expected =
        zones && components
          ? "a component or a zone"
          : zones
            ? "a zone"
            : "a component that is not a zone";
      check(filter.targets, expected, (id) => (isZone(id) ? zones : components));
      values(filter.rules).forEach((rule, position) => {
        const peer =
          typeof rule === "object" && rule !== null
            ? (rule as Record<string, unknown>).peer
            : undefined;
        if (typeof peer !== "string" || RULE_PEERS.includes(peer) || isCidr(peer)) return;
        if (model.getComponent(peer) === undefined) {
          findings.push(
            createFinding("REFERENCE_UNKNOWN", [component.id], {
              path: `${base}/${filter.rules?.property}/${position}/peer`,
              id: peer,
            }),
          );
        }
      });
    }
  });
  return findings;
}
