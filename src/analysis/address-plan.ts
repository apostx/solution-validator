import type { SolutionModel } from "../core/model";
import type { Component } from "../core/solution-schema";
import { createFinding, type Finding } from "../messages/finding";
import { compareStrings } from "../util/compare";
import { type Cidr, cidrContains, cidrOverlaps, cidrSize, parseCidr } from "../util/ipv4";
import { isObject } from "../util/json";
import { type AssumptionPolicy, ParameterResolver } from "./parameters";

/** A zone's address space, as the detailed level sees it. */
export interface AddressFact {
  zone: string;
  /** The zone it is placed in, if any. */
  parent?: string;
  /** The address space as written; unset when the zone has none. */
  space?: string;
  /** The number of addresses, when the space is valid. */
  size?: number;
}

/**
 * Checks the address plan at the detailed level: every zone has a valid IPv4 address space that
 * lies within the zone it is placed in; zones in the same zone do not overlap; networks that
 * overlap are flagged; and route destinations are valid and not shadowed by the local route.
 */
export function checkAddressPlan(
  model: SolutionModel,
  policy: AssumptionPolicy,
): { zones: AddressFact[]; findings: Finding[] } {
  const resolver = new ParameterResolver(policy);
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const zones: Component[] = [];
  for (const component of model.components) {
    if (seen.has(component.id)) continue;
    seen.add(component.id);
    if (model.getType(component)?.traits.zone) zones.push(component);
  }
  const zoneIds = new Set(zones.map((zone) => zone.id));
  const parentOf = (zone: Component) => (zone.placement ?? []).find((id) => zoneIds.has(id));

  const spaces = new Map<string, Cidr>();
  const facts: AddressFact[] = [];
  for (const zone of zones) {
    const type = model.getType(zone);
    const parameter = type?.traits.zone?.addressSpace;
    const parent = parentOf(zone);
    const fact: AddressFact = { zone: zone.id, ...(parent ? { parent } : {}) };
    facts.push(fact);
    const value =
      type && parameter !== undefined ? resolver.resolve(zone, type, parameter) : undefined;
    if (!value?.known || typeof value.value !== "string") {
      findings.push(createFinding("ADDRESS_SPACE_MISSING", [zone.id], { zone: zone.id }));
      continue;
    }
    fact.space = value.value;
    const cidr = parseCidr(value.value);
    if (!cidr) {
      findings.push(
        createFinding("ADDRESS_SPACE_INVALID", [zone.id], { zone: zone.id, value: value.value }),
      );
      continue;
    }
    fact.size = cidrSize(cidr);
    spaces.set(zone.id, cidr);
    if (!cidr.network) {
      findings.push(
        createFinding("ADDRESS_SPACE_HOST_BITS", [zone.id], {
          zone: zone.id,
          value: value.value,
          network: `${formatAddress(cidr.start)}/${cidr.prefix}`,
        }),
      );
    }
  }

  for (const zone of zones) {
    const space = spaces.get(zone.id);
    const parent = parentOf(zone);
    const parentSpace = parent === undefined ? undefined : spaces.get(parent);
    if (space && parent && parentSpace && !cidrContains(parentSpace, space)) {
      findings.push(
        createFinding("ADDRESS_SPACE_OUTSIDE_PARENT", [zone.id], {
          zone: zone.id,
          space: space.text,
          parent,
          parentSpace: parentSpace.text,
        }),
      );
    }
  }

  const sorted = [...zones].sort((a, b) => compareStrings(a.id, b.id));
  sorted.forEach((zone, index) => {
    const space = spaces.get(zone.id);
    if (!space) return;
    for (const other of sorted.slice(index + 1)) {
      const otherSpace = spaces.get(other.id);
      if (!otherSpace || !cidrOverlaps(space, otherSpace)) continue;
      const parent = parentOf(zone);
      const params = {
        zone: zone.id,
        space: space.text,
        other: other.id,
        otherSpace: otherSpace.text,
      };
      if (parent !== undefined && parent === parentOf(other)) {
        findings.push(createFinding("ADDRESS_SPACE_OVERLAP", [zone.id, other.id], params));
      } else if (parent === undefined && parentOf(other) === undefined) {
        findings.push(createFinding("NETWORK_OVERLAP", [zone.id, other.id], params));
      }
    }
  });

  findings.push(...checkRoutes(model, resolver, zones, spaces, parentOf));
  facts.sort((a, b) => compareStrings(a.zone, b.zone));
  return { zones: facts, findings };
}

function checkRoutes(
  model: SolutionModel,
  resolver: ParameterResolver,
  zones: readonly Component[],
  spaces: ReadonlyMap<string, Cidr>,
  parentOf: (zone: Component) => string | undefined,
): Finding[] {
  const findings: Finding[] = [];
  const byId = new Map(zones.map((zone) => [zone.id, zone]));
  const networkOf = (id: string): string => {
    let current = id;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      const zone = byId.get(current);
      const parent = zone ? parentOf(zone) : undefined;
      if (parent === undefined) return current;
      current = parent;
    }
    return current;
  };
  const seen = new Set<string>();
  for (const component of model.components) {
    if (seen.has(component.id)) continue;
    seen.add(component.id);
    const type = model.getType(component);
    const router = type?.traits.router;
    if (!type || !router) continue;
    const routes = resolver.resolve(component, type, router.routes);
    if (!routes.known || !Array.isArray(routes.value)) continue;
    const served = router.zones ? resolver.resolve(component, type, router.zones) : undefined;
    const networks = new Set(
      served?.known && Array.isArray(served.value)
        ? served.value
            .filter((id): id is string => typeof id === "string" && byId.has(id))
            .map(networkOf)
        : [],
    );
    routes.value.forEach((route, index) => {
      if (!isObject(route) || typeof route.destination !== "string") return;
      const destination = route.destination;
      // Internet routes and service routes (a component id) carry no address range.
      if (destination === "internet" || model.getComponent(destination) !== undefined) return;
      const cidr = parseCidr(destination);
      if (!cidr) {
        findings.push(
          createFinding("ROUTE_DESTINATION_INVALID", [component.id], {
            router: component.id,
            index,
            destination,
          }),
        );
        return;
      }
      for (const network of [...networks].sort(compareStrings)) {
        const space = spaces.get(network);
        if (space && cidr.prefix > 0 && cidrContains(space, cidr)) {
          findings.push(
            createFinding("ROUTE_SHADOWED", [component.id], {
              router: component.id,
              destination,
              network,
              space: space.text,
            }),
          );
        }
      }
    });
  }
  return findings;
}

function formatAddress(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
}
