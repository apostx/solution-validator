import type { SolutionModel } from "../core/model";
import { findComponentReferences, propertiesValidationSchema } from "../core/property-schema";
import { issuesToFindings, validateSchema } from "../core/schema-issues";
import type { Component } from "../core/solution-schema";
import { createFinding, type Finding } from "../messages/finding";
import { compareStrings } from "../util/compare";

/**
 * Checks what the solution schema alone cannot: packs, unique ids, known types, property values
 * against the types' property schemas, references, placement, and intents' actions and ports.
 */
export function checkModelValidity(model: SolutionModel): Finding[] {
  return [
    ...checkPacks(model),
    ...checkIds(model),
    ...checkComponents(model),
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
