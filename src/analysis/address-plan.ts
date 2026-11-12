import type { SolutionModel } from "../core/model";
import type { Component } from "../core/solution-schema";
import { createFinding, type Finding } from "../messages/finding";
import { compareStrings } from "../util/compare";
import {
  type AddressFamily,
  type Cidr,
  cidrContains,
  cidrOverlaps,
  cidrSize,
  formatAddress,
  parseCidr,
} from "../util/ip";
import { isObject } from "../util/json";
import { type AssumptionPolicy, ParameterResolver } from "./parameters";

/** A zone's address space, as the detailed level sees it. */
export interface AddressFact {
  zone: string;
  /** The zone it is placed in, if any. */
  parent?: string;
  /** The IPv4 address space as written; unset when the zone has none. */
  space?: string;
  /** The number of IPv4 addresses, when the space is valid. */
  size?: number;
  /** The IPv6 address space as written, when the zone has one. */
  ipv6Space?: string;
}

/**
 * Checks the address plan at the detailed level: every zone has a valid IPv4 address space that
 * lies within the zone it is placed in; zones in the same zone do not overlap; networks that
 * overlap are flagged; and route destinations are valid and not shadowed by the local route.
 * IPv6 address spaces are optional and checked the same way, family by family.
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

  const facts = new Map<string, AddressFact>();
  for (const zone of zones) {
    const parent = parentOf(zone);
    facts.set(zone.id, { zone: zone.id, ...(parent ? { parent } : {}) });
  }
  const spaces: Record<AddressFamily, Map<string, Cidr>> = { 4: new Map(), 6: new Map() };
  for (const family of [4, 6] as const) {
    for (const zone of zones) {
      const type = model.getType(zone);
      const fact = facts.get(zone.id) as AddressFact;
      const parameter =
        family === 4 ? type?.traits.zone?.addressSpace : type?.traits.zone?.ipv6AddressSpace;
      const value =
        type && parameter !== undefined ? resolver.resolve(zone, type, parameter) : undefined;
      if (!value?.known || typeof value.value !== "string") {
        // IPv6 is optional: a zone without an IPv6 address space has no IPv6 addresses.
        if (family === 4) {
          findings.push(createFinding("ADDRESS_SPACE_MISSING", [zone.id], { zone: zone.id }));
        }
        continue;
      }
      if (family === 4) fact.space = value.value;
      else fact.ipv6Space = value.value;
      const cidr = parseCidr(value.value);
      if (cidr?.family !== family) {
        const code = family === 4 ? "ADDRESS_SPACE_INVALID" : "IPV6_SPACE_INVALID";
        findings.push(createFinding(code, [zone.id], { zone: zone.id, value: value.value }));
        continue;
      }
      if (family === 4) fact.size = Number(cidrSize(cidr));
      spaces[family].set(zone.id, cidr);
      if (!cidr.network) {
        findings.push(
          createFinding("ADDRESS_SPACE_HOST_BITS", [zone.id], {
            zone: zone.id,
            value: value.value,
            network: `${formatAddress(family, cidr.start)}/${cidr.prefix}`,
          }),
        );
      }
    }

    for (const zone of zones) {
      const space = spaces[family].get(zone.id);
      const parent = parentOf(zone);
      if (!space || parent === undefined) continue;
      const parentSpace = spaces[family].get(parent);
      if (parentSpace && !cidrContains(parentSpace, space)) {
        findings.push(
          createFinding("ADDRESS_SPACE_OUTSIDE_PARENT", [zone.id], {
            zone: zone.id,
            space: space.text,
            parent,
            parentSpace: parentSpace.text,
          }),
        );
      } else if (!parentSpace && family === 6) {
        findings.push(
          createFinding("IPV6_SPACE_WITHOUT_PARENT", [zone.id], {
            zone: zone.id,
            space: space.text,
            parent,
          }),
        );
      }
    }

    const sorted = [...zones].sort((a, b) => compareStrings(a.id, b.id));
    sorted.forEach((zone, index) => {
      const space = spaces[family].get(zone.id);
      if (!space) return;
      for (const other of sorted.slice(index + 1)) {
        const otherSpace = spaces[family].get(other.id);
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
  }

  findings.push(...checkRoutes(model, resolver, zones, spaces, parentOf));
  return {
    zones: [...facts.values()].sort((a, b) => compareStrings(a.zone, b.zone)),
    findings,
  };
}

function checkRoutes(
  model: SolutionModel,
  resolver: ParameterResolver,
  zones: readonly Component[],
  spaces: Record<AddressFamily, ReadonlyMap<string, Cidr>>,
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
        const space = spaces[cidr.family].get(network);
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
