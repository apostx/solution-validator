import type { ComponentType } from "../../core/registry";
import type { Component } from "../../core/solution-schema";
import type { Traits } from "../../core/traits";
import { compareStrings } from "../../util/compare";
import {
  type AddressFamily,
  type Cidr,
  cidrContains,
  cidrOverlaps,
  containsPublic,
  EPHEMERAL_PORTS,
  type PortRange,
  parseCidr,
  parsePortRange,
} from "../../util/ip";
import { isObject } from "../../util/json";
import { invalidValue, type MissingProperty } from "../parameters";
import { combineVerdicts, createEvidence, type Evidence, type Verdict } from "../verdict";
import type { AccessContext } from "./access-checks";
import { samePort } from "./ports";

/**
 * Network reachability at the logical level: zones (placement), routers, gateways and traffic
 * filters. A position is the zone a component is placed in, or `undefined` for outside every
 * zone (the internet and provider services).
 */
export type Position = string | undefined;

/** One part of a decision, combined like checks: fail, then undecidable, then pass. */
export interface Step {
  verdict: Verdict;
  evidence: Evidence[];
  missing: MissingProperty[];
  /** A filter limits ports, and the traffic's port is not known. */
  portUnknown?: boolean;
  /** An address range could not be matched with the known addresses. */
  addressUnknown?: boolean;
}

export function step(
  verdict: Verdict,
  evidence: Evidence[],
  missing: MissingProperty[] = [],
): Step {
  return { verdict, evidence, missing };
}

export function combineSteps(steps: readonly Step[]): Step {
  return {
    verdict: combineVerdicts(steps.map((s) => s.verdict)),
    evidence: steps.flatMap((s) => s.evidence),
    missing: steps.flatMap((s) => s.missing),
    ...(steps.some((s) => s.portUnknown) ? { portUnknown: true } : {}),
    ...(steps.some((s) => s.addressUnknown) ? { addressUnknown: true } : {}),
  };
}

/**
 * Alternatives where one is enough, such as the address families traffic may use: `pass` if any
 * passes, `fail` if all fail, otherwise `undecidable`.
 */
export function anySteps(steps: readonly Step[]): Step {
  const passed = steps.find((s) => s.verdict === "pass");
  if (passed) return passed;
  const open = steps.filter((s) => s.verdict === "undecidable");
  return open.length > 0
    ? { ...combineSteps(open), verdict: "undecidable" }
    : { ...combineSteps(steps), verdict: "fail" };
}

/** A side of a connection: a component at a position, or an anonymous party outside. */
export interface Party {
  component?: Component;
  /** Ids filters and rules can name it by: the component and the groups it belongs to. */
  ids: string[];
  position: Position;
}

/** The ports traffic uses: known ports, any port (return traffic), or unknown. */
export type PortSpec =
  | { kind: "ports"; ports: (string | number)[] }
  /** Return traffic at the logical level: some port; only rules without ports match. */
  | { kind: "any" }
  /** Return traffic at the detailed level: the whole ephemeral range must be allowed. */
  | { kind: "range"; range: PortRange }
  | { kind: "unknown" };

export type Resolved<T> =
  | { known: true; value: T; evidence: Evidence[] }
  | { known: false; step: Step };

interface FilterInfo {
  component: Component;
  type: ComponentType;
  params: NonNullable<Traits["traffic-filter"]>;
}

export class Network {
  readonly #context: AccessContext;
  /** The address family of the traffic, at the detailed level. */
  readonly family: AddressFamily;

  constructor(context: AccessContext, family: AddressFamily = 4) {
    this.#context = context;
    this.family = family;
  }

  /** The same network, for traffic of another address family. */
  withFamily(family: AddressFamily): Network {
    return family === this.family ? this : new Network(this.#context, family);
  }

  /**
   * The address families a party can use at the detailed level. Every zone has IPv4; a zone has
   * IPv6 when it or a zone it is placed in has an IPv6 address space. Parties outside every zone
   * (the internet, provider services) have both. At the logical level only IPv4 is checked.
   */
  familiesOf(party: Party): AddressFamily[] {
    if (this.#context.level !== "detailed") return [4];
    if (party.position === undefined) return [4, 6];
    const ipv6 = this.#spaceOf(party.position, 6);
    return ipv6.known && ipv6.value ? [4, 6] : [4];
  }

  // Zones

  #component(id: string): Component | undefined {
    return this.#context.model.getComponent(id);
  }

  #type(component: Component): ComponentType | undefined {
    return this.#context.model.getType(component);
  }

  isZone(id: string): boolean {
    const component = this.#component(id);
    return component !== undefined && this.#type(component)?.traits.zone !== undefined;
  }

  /** The zones a component is placed in; unknown ids and non-zones are skipped. */
  placements(component: Component): string[] {
    return (component.placement ?? []).filter((id) => this.isZone(id));
  }

  /** A zone and the zones it is placed in, innermost first. */
  chain(zone: string): string[] {
    const chain: string[] = [];
    let current: string | undefined = zone;
    while (current !== undefined && !chain.includes(current)) {
      chain.push(current);
      const component = this.#component(current);
      current = component ? this.placements(component)[0] : undefined;
    }
    return chain;
  }

  /** The outermost zone: the network the position belongs to. */
  root(position: Position): string | undefined {
    return position === undefined ? undefined : this.chain(position).at(-1);
  }

  /**
   * Where a component is: its placements, or outside. Unknown when it is placed in something
   * that is not a zone of the solution (model-validity reports why).
   */
  positions(component: Component): Resolved<Position[]> {
    const invalid = (component.placement ?? []).find((id) => !this.isZone(id));
    if (invalid !== undefined) {
      return {
        known: false,
        step: step("undecidable", [
          createEvidence("PLACEMENT_INVALID", { component: component.id, zone: invalid }),
        ]),
      };
    }
    const placements = this.placements(component);
    return { known: true, value: placements.length > 0 ? placements : [undefined], evidence: [] };
  }

  /** The failure domain of the innermost zone of a position that declares one. */
  failureDomainOf(position: string): Resolved<{ zone: string; domain: string } | undefined> {
    for (const zone of this.chain(position)) {
      const component = this.#component(zone);
      const type = component && this.#type(component);
      const parameter = type?.traits.zone?.failureDomain;
      if (!component || !type || parameter === undefined) continue;
      const value = this.#resolve(component, type, parameter);
      if (!value.known) return value;
      if (typeof value.value !== "string") continue;
      return { known: true, value: { zone, domain: value.value }, evidence: value.evidence };
    }
    return { known: true, value: undefined, evidence: [] };
  }

  /** Resolves a component's trait parameter: a value, or a binding to one of its properties. */
  resolveParameter(
    component: Component,
    type: ComponentType,
    parameter: unknown,
  ): Resolved<unknown> {
    return this.#resolve(component, type, parameter);
  }

  /**
   * The address space of the innermost zone of a position that has one, for the traffic's
   * address family (detailed level).
   */
  addressOf(position: string): Resolved<{ zone: string; cidr: Cidr } | undefined> {
    return this.#spaceOf(position, this.family);
  }

  #spaceOf(
    position: string,
    family: AddressFamily,
  ): Resolved<{ zone: string; cidr: Cidr } | undefined> {
    for (const zone of this.chain(position)) {
      const component = this.#component(zone);
      const type = component && this.#type(component);
      const parameter =
        family === 4 ? type?.traits.zone?.addressSpace : type?.traits.zone?.ipv6AddressSpace;
      if (!component || !type || parameter === undefined) continue;
      const value = this.#resolve(component, type, parameter);
      // IPv6 is optional: a zone whose type has an IPv6 address space but leaves it unset has no
      // IPv6 addresses, even when the zone it is placed in has some.
      if (family === 6 && (!value.known || typeof value.value !== "string")) {
        return { known: true, value: undefined, evidence: [] };
      }
      if (!value.known) return value;
      if (typeof value.value !== "string") continue;
      const cidr = parseCidr(value.value);
      if (cidr?.family !== family) {
        return {
          known: false,
          step: step("undecidable", invalidValue(component, parameter).evidence),
        };
      }
      return { known: true, value: { zone, cidr }, evidence: value.evidence };
    }
    return { known: true, value: undefined, evidence: [] };
  }

  // Parameters

  #resolve(component: Component, type: ComponentType, parameter: unknown): Resolved<unknown> {
    const value = this.#context.resolver.resolve(component, type, parameter);
    if (value.known) return { known: true, value: value.value, evidence: value.evidence };
    return {
      known: false,
      step: step("undecidable", value.evidence, value.missing ? [value.missing] : []),
    };
  }

  #references(component: Component, type: ComponentType, parameter: unknown): Resolved<string[]> {
    if (parameter === undefined) return { known: true, value: [], evidence: [] };
    const value = this.#resolve(component, type, parameter);
    if (!value.known) return value;
    if (!Array.isArray(value.value)) {
      return {
        known: false,
        step: step("undecidable", invalidValue(component, parameter).evidence),
      };
    }
    return {
      known: true,
      value: value.value.filter((item): item is string => typeof item === "string"),
      evidence: value.evidence,
    };
  }

  // Groups

  /** The members a group stands for, or the component itself. */
  members(component: Component): Resolved<Party[]> {
    const type = this.#type(component);
    const group = type?.traits.group;
    const own = this.positions(component);
    if (!own.known) return own;
    const self: Party[] = own.value.map((position) => ({
      component,
      ids: [component.id],
      position,
    }));
    if (!type || !group?.members) return { known: true, value: self, evidence: [] };
    const members = this.#references(component, type, group.members);
    if (!members.known) return members;
    const parties: Party[] = [];
    for (const id of members.value) {
      const member = this.#component(id);
      if (!member) continue;
      const positions = this.positions(member);
      if (!positions.known) return positions;
      for (const position of positions.value) {
        parties.push({ component: member, ids: [member.id, component.id], position });
      }
    }
    return {
      known: true,
      value: parties.length > 0 ? parties : self,
      evidence: members.evidence,
    };
  }

  // Filters

  #filters(): FilterInfo[] {
    const filters: FilterInfo[] = [];
    const seen = new Set<string>();
    for (const component of this.#context.model.components) {
      if (seen.has(component.id)) continue;
      seen.add(component.id);
      const type = this.#type(component);
      const params = type?.traits["traffic-filter"];
      if (type && params) filters.push({ component, type, params });
    }
    return filters.sort((a, b) => compareStrings(a.component.id, b.component.id));
  }

  /** Filters attached to any of the ids, for the given kind of attachment. */
  #attached(ids: readonly string[], kind: "component" | "zone" | "self"): Resolved<FilterInfo[]> {
    const found: FilterInfo[] = [];
    const evidence: Evidence[] = [];
    const unknown: Step[] = [];
    for (const filter of this.#filters()) {
      if (!filter.params.attachTo.includes(kind)) continue;
      if (kind === "self") {
        if (ids.includes(filter.component.id)) found.push(filter);
        continue;
      }
      const targets = this.#references(filter.component, filter.type, filter.params.targets);
      if (!targets.known) {
        unknown.push(targets.step);
        continue;
      }
      if (targets.value.some((target) => ids.includes(target))) {
        found.push(filter);
        evidence.push(...targets.evidence);
      }
    }
    if (unknown.length > 0) return { known: false, step: combineSteps(unknown) };
    return { known: true, value: found, evidence };
  }

  /** Whether a filter is attached to the party, directly or through one of its zones. */
  #protects(filter: FilterInfo, party: Party): Resolved<boolean> {
    const targets = this.#references(filter.component, filter.type, filter.params.targets);
    if (!targets.known) return targets;
    const zones = party.position === undefined ? [] : this.chain(party.position);
    const hit = targets.value.some((id) => party.ids.includes(id) || zones.includes(id));
    return { known: true, value: hit, evidence: targets.evidence };
  }

  /**
   * Whether a rule's peer names the party. `internet` means outside the filter's network, and
   * `network` inside it.
   */
  #peerMatches(peer: string, party: Party, network: string | undefined): Resolved<boolean> {
    if (peer === "any") return { known: true, value: true, evidence: [] };
    const cidr = parseCidr(peer);
    if (cidr) return this.#cidrMatches(cidr, party);
    if (peer === "internet" || peer === "network") {
      const root = this.root(party.position);
      const inside = root !== undefined && root === network;
      return { known: true, value: peer === "network" ? inside : !inside, evidence: [] };
    }
    if (party.ids.includes(peer)) return { known: true, value: true, evidence: [] };
    if (party.position !== undefined && this.chain(party.position).includes(peer)) {
      return { known: true, value: true, evidence: [] };
    }
    const filter = this.#filters().find((candidate) => candidate.component.id === peer);
    if (filter) return this.#protects(filter, party);
    return { known: true, value: false, evidence: [] };
  }

  /**
   * Whether an address range covers the party. `0.0.0.0/0` covers everyone. Otherwise the
   * detailed level compares it with the address space of the party's zone; outside parties have
   * unknown public addresses, so only ranges without public addresses decide for them.
   */
  #cidrMatches(cidr: Cidr, party: Party): Resolved<boolean> {
    const detailed = this.#context.level === "detailed";
    // A range only matches traffic of its own address family; the logical level checks IPv4.
    if (cidr.family !== this.family) return { known: true, value: false, evidence: [] };
    if (cidr.prefix === 0) return { known: true, value: true, evidence: [] };
    const name = party.component?.id ?? "the internet";
    const unknown = (code: "CIDR_NEEDS_DETAILED" | "PEER_ADDRESS_UNKNOWN") => ({
      known: false as const,
      step: {
        ...step("undecidable", [createEvidence(code, { cidr: cidr.text, party: name })]),
        addressUnknown: true,
      },
    });
    if (!detailed) return unknown("CIDR_NEEDS_DETAILED");
    if (party.position === undefined) {
      return containsPublic(cidr)
        ? unknown("PEER_ADDRESS_UNKNOWN")
        : { known: true, value: false, evidence: [] };
    }
    const address = this.addressOf(party.position);
    if (!address.known) return address;
    if (!address.value) return unknown("PEER_ADDRESS_UNKNOWN");
    const space = address.value.cidr;
    if (cidrContains(cidr, space)) return { known: true, value: true, evidence: address.evidence };
    if (!cidrOverlaps(cidr, space))
      return { known: true, value: false, evidence: address.evidence };
    return {
      known: false,
      step: {
        ...step("undecidable", [
          createEvidence("CIDR_PARTLY_COVERS", {
            cidr: cidr.text,
            zone: address.value.zone,
            space: space.text,
          }),
        ]),
        addressUnknown: true,
      },
    };
  }

  /**
   * Evaluates a filter for traffic in one direction with a peer. The component's rules are
   * checked in order, then the type's base rules; the first match decides. Without a match, the
   * filter's default policy applies.
   */
  evaluate(
    filter: FilterInfo,
    direction: "inbound" | "outbound",
    peer: Party,
    ports: PortSpec,
    network: string | undefined,
  ): Step {
    const peerName = peer.component?.id ?? "the internet";
    let evidence: Evidence[] = [];
    if (filter.params.rules !== undefined) {
      const rules = this.#resolve(filter.component, filter.type, filter.params.rules);
      if (!rules.known) return rules.step;
      if (!Array.isArray(rules.value)) {
        return step("undecidable", invalidValue(filter.component, filter.params.rules).evidence);
      }
      const decided = this.#firstMatch(filter, rules.value, false, direction, peer, ports, network);
      if (decided) return { ...decided, evidence: [...rules.evidence, ...decided.evidence] };
      evidence = rules.evidence;
    }
    const base = filter.params.baseRules ?? [];
    const decided = this.#firstMatch(filter, base, true, direction, peer, ports, network);
    if (decided) return { ...decided, evidence: [...evidence, ...decided.evidence] };
    return this.#default(filter, direction, peerName, evidence);
  }

  /** The step of the first rule that matches the traffic, if any. */
  #firstMatch(
    filter: FilterInfo,
    rules: readonly unknown[],
    base: boolean,
    direction: "inbound" | "outbound",
    peer: Party,
    ports: PortSpec,
    network: string | undefined,
  ): Step | undefined {
    const name = filter.component.id;
    const peerName = peer.component?.id ?? "the internet";
    for (const [index, rule] of rules.entries()) {
      if (!isObject(rule) || rule.direction !== direction || typeof rule.peer !== "string") {
        continue;
      }
      const matches = this.#peerMatches(rule.peer, peer, network);
      if (!matches.known) return matches.step;
      if (!matches.value) continue;
      const portMatch = this.#portsMatch(rule.ports, ports);
      if (portMatch === false) continue;
      if (portMatch === "unknown") {
        return {
          ...step("undecidable", [
            createEvidence(base ? "FILTER_BASE_PORT_UNKNOWN" : "FILTER_PORT_UNKNOWN", {
              filter: name,
              rule: index,
            }),
          ]),
          portUnknown: true,
        };
      }
      const params = { filter: name, direction, peer: peerName, rule: index };
      if (rule.effect === "deny") {
        return step("fail", [
          createEvidence(base ? "FILTER_BASE_DENIES" : "FILTER_DENIES", params),
        ]);
      }
      return step("pass", [createEvidence(base ? "FILTER_BASE_ALLOWS" : "FILTER_ALLOWS", params)]);
    }
    return undefined;
  }

  #default(
    filter: FilterInfo,
    direction: "inbound" | "outbound",
    peer: string,
    evidence: Evidence[],
  ): Step {
    const policy = filter.params.default?.[direction] ?? "deny";
    const params = { filter: filter.component.id, direction, peer };
    return policy === "allow"
      ? step("pass", [...evidence, createEvidence("FILTER_DEFAULT_ALLOWS", params)])
      : step("fail", [...evidence, createEvidence("FILTER_DEFAULT_DENIES", params)]);
  }

  #portsMatch(rulePorts: unknown, ports: PortSpec): boolean | "unknown" {
    if (!Array.isArray(rulePorts)) return true;
    const entries = rulePorts.filter((entry): entry is string => typeof entry === "string");
    if (ports.kind === "any") return false;
    if (ports.kind === "unknown") return "unknown";
    if (ports.kind === "range") {
      const { from, to } = ports.range;
      return entries.some((entry) => {
        const range = parsePortRange(entry);
        return range !== undefined && range.from <= from && to <= range.to;
      });
    }
    return ports.ports.every((port) =>
      entries.some((entry) => {
        const range = parsePortRange(entry);
        if (range) {
          const number =
            typeof port === "number" ? port : this.#context.model.registry.getPort(port)?.port;
          return number !== undefined && range.from <= number && number <= range.to;
        }
        return samePort(this.#context.model, entry, port);
      }),
    );
  }

  /**
   * The filters traffic passes on one side: the party's own filters and the filters of the zones
   * it crosses (the party's zones that do not also contain the other side). Stateless filters
   * also need to allow the return traffic.
   */
  filtersOnSide(
    party: Party,
    other: Party,
    direction: "inbound" | "outbound",
    ports: PortSpec,
  ): Step {
    const steps: Step[] = [];
    const network = this.root(party.position);
    const otherZones = other.position === undefined ? [] : this.chain(other.position);
    const crossed =
      party.position === undefined
        ? []
        : this.chain(party.position).filter((zone) => !otherZones.includes(zone));
    const own = party.component ? this.#attached(party.ids, "component") : undefined;
    const zones = this.#attached(crossed, "zone");
    for (const attached of [own, zones]) {
      if (!attached) continue;
      if (!attached.known) {
        steps.push(attached.step);
        continue;
      }
      for (const filter of attached.value) {
        steps.push(this.evaluate(filter, direction, other, ports, network));
        if (!filter.params.stateful) {
          const reverse = direction === "inbound" ? "outbound" : "inbound";
          const replies: PortSpec =
            this.#context.level === "detailed"
              ? { kind: "range", range: EPHEMERAL_PORTS }
              : { kind: "any" };
          const back = this.evaluate(filter, reverse, other, replies, network);
          steps.push({
            ...back,
            evidence: [
              createEvidence("STATELESS_RETURN", { filter: filter.component.id }),
              ...back.evidence,
            ],
          });
        }
      }
    }
    return combineSteps(steps);
  }

  // Routing

  /** The routes that apply to a zone: its own router's, or the nearest enclosing zone's. */
  #routes(
    zone: string,
  ): Resolved<{ router: Component; routes: Record<string, unknown>[] } | undefined> {
    const routers: { component: Component; type: ComponentType }[] = [];
    const seen = new Set<string>();
    for (const component of this.#context.model.components) {
      if (seen.has(component.id)) continue;
      seen.add(component.id);
      const type = this.#type(component);
      if (type?.traits.router) routers.push({ component, type });
    }
    routers.sort((a, b) => compareStrings(a.component.id, b.component.id));
    for (const current of this.chain(zone)) {
      for (const { component, type } of routers) {
        const router = type.traits.router;
        if (!router) continue;
        const zones = this.#references(component, type, router.zones);
        if (!zones.known) return zones;
        if (!zones.value.includes(current)) continue;
        const routes = this.#resolve(component, type, router.routes);
        if (!routes.known) return routes;
        if (!Array.isArray(routes.value)) {
          return {
            known: false,
            step: step("undecidable", invalidValue(component, router.routes).evidence),
          };
        }
        return {
          known: true,
          value: { router: component, routes: routes.value.filter(isObject) },
          evidence: [...zones.evidence, ...routes.evidence],
        };
      }
    }
    return { known: true, value: undefined, evidence: [] };
  }

  /**
   * The route internet traffic takes. `internet` is a default route for both address families,
   * `0.0.0.0/0` for IPv4 and `::/0` for IPv6 (detailed level). At the
   * detailed level, a more specific route whose range contains public addresses may catch the
   * traffic; the destination's address is not known, so a different gateway there makes the
   * choice ambiguous. Ranges without public addresses never carry internet traffic.
   */
  #internetRoute(
    routes: readonly Record<string, unknown>[],
  ): Record<string, unknown> | undefined | "ambiguous" {
    const family = this.family;
    const rangeOf = (route: Record<string, unknown>) =>
      typeof route.destination === "string" ? parseCidr(route.destination) : undefined;
    const isDefault = (route: Record<string, unknown>) => {
      if (route.destination === "internet") return true;
      const cidr = rangeOf(route);
      return cidr?.prefix === 0 && cidr.family === family;
    };
    const fallback = routes.find(isDefault);
    if (this.#context.level !== "detailed") return fallback;
    const specific = routes.filter((route) => {
      const cidr = rangeOf(route);
      return !isDefault(route) && cidr?.family === family && containsPublic(cidr);
    });
    if (specific.some((route) => route.gateway !== fallback?.gateway)) return "ambiguous";
    return fallback;
  }

  /**
   * Traffic to a provider service through a route that names it: the route's gateway must be
   * attached to the zone's network and list the service among the services it reaches.
   */
  #serviceRoute(
    zone: string,
    id: string,
    peer: Party,
    ports: PortSpec,
    routeEvidence: Evidence[],
  ): Step {
    const service = peer.component?.id ?? "";
    const gateway = this.#component(id);
    const type = gateway && this.#type(gateway);
    const params = type?.traits.gateway;
    if (!gateway || !type || !params) {
      return step("fail", [...routeEvidence, createEvidence("GATEWAY_INVALID", { gateway: id })]);
    }
    const network = this.root(zone);
    const connects = this.#references(gateway, type, params.connects);
    if (!connects.known) return connects.step;
    const networks = [
      ...connects.value.map((target) => this.root(target)),
      ...this.placements(gateway).map((placement) => this.root(placement)),
    ];
    if (!networks.includes(network)) {
      return step("fail", [
        ...routeEvidence,
        createEvidence("GATEWAY_NOT_ATTACHED", { gateway: id, network: network ?? zone }),
      ]);
    }
    const services = this.#references(gateway, type, params.services);
    if (!services.known) return services.step;
    const evidence = [...routeEvidence, ...connects.evidence, ...services.evidence];
    if (!services.value.includes(service)) {
      return step("fail", [
        ...evidence,
        createEvidence("SERVICE_NOT_SERVED", { gateway: id, service }),
      ]);
    }
    const self = this.#attached([id], "self");
    if (!self.known) return self.step;
    return combineSteps([
      step("pass", [
        ...evidence,
        createEvidence("PRIVATE_SERVICE_ROUTE", { zone, gateway: id, service }),
      ]),
      ...self.value.map((filter) => this.evaluate(filter, "outbound", peer, ports, network)),
    ]);
  }

  /**
   * How traffic between a zone and the internet goes. A router's internet route decides first:
   * `inbound` traffic needs a gateway that allows both directions; `outbound` traffic may also
   * use an outbound-only gateway, which itself needs such a route. Without one, an implicit
   * gateway attached to the zone carries the traffic, and in a zone with direct internet access
   * a component with a public endpoint uses its own address. `local` is the component on the
   * zone's side, when there is one.
   */
  internet(
    zone: string,
    direction: "inbound" | "outbound",
    peer: Party,
    ports: PortSpec,
    depth = 0,
    local?: Party,
  ): Step {
    const found = this.#routes(zone);
    if (!found.known) return found.step;
    const service = peer.component?.id;
    if (
      found.value &&
      direction === "outbound" &&
      service !== undefined &&
      peer.position === undefined
    ) {
      const private_ = found.value.routes.find((route) => route.destination === service);
      if (private_ && typeof private_.gateway === "string") {
        return this.#serviceRoute(zone, private_.gateway, peer, ports, found.evidence);
      }
    }
    const direct = this.#directInternet(zone);
    if (!direct.known) return direct.step;
    if (direction === "inbound" && direct.value !== undefined) {
      return this.#direct(zone, local, direct.evidence);
    }
    const selected = found.value ? this.#internetRoute(found.value.routes) : undefined;
    if (selected === "ambiguous") {
      return {
        ...step("undecidable", [
          ...found.evidence,
          createEvidence("ROUTE_AMBIGUOUS", { zone, router: found.value?.router.id ?? zone }),
        ]),
        addressUnknown: true,
      };
    }
    if (selected && typeof selected.gateway === "string") {
      return this.#viaGateway(zone, selected.gateway, direction, peer, ports, depth, {
        evidence: found.evidence,
        implicit: false,
      });
    }
    const implicit = this.#implicitGateway(zone);
    if (!implicit.known) return implicit.step;
    if (implicit.value !== undefined) {
      return this.#viaGateway(zone, implicit.value, direction, peer, ports, depth, {
        evidence: [...found.evidence, ...implicit.evidence],
        implicit: true,
      });
    }
    if (direct.value !== undefined) {
      return this.#direct(zone, local, [...found.evidence, ...direct.evidence]);
    }
    if (!found.value) return step("fail", [createEvidence("LOCAL_ROUTES_ONLY", { zone })]);
    return step("fail", [
      ...found.evidence,
      createEvidence("INTERNET_ROUTE_MISSING", { zone, router: found.value.router.id }),
    ]);
  }

  /** The nearest zone with direct internet access in a zone's chain, if any. */
  #directInternet(zone: string): Resolved<string | undefined> {
    for (const current of this.chain(zone)) {
      const component = this.#component(current);
      const type = component && this.#type(component);
      const parameter = type?.traits.zone?.directInternet;
      if (!component || !type || parameter === undefined) continue;
      const value = this.#resolve(component, type, parameter);
      if (!value.known) return value;
      return { known: true, value: value.value === true ? current : undefined, evidence: [] };
    }
    return { known: true, value: undefined, evidence: [] };
  }

  /** Direct internet access: the local component needs a public endpoint of its own. */
  #direct(zone: string, local: Party | undefined, evidence: Evidence[]): Step {
    const component = local?.component;
    const name = component?.id ?? "the component";
    const type = component && this.#type(component);
    const endpoint = type?.traits.endpoint;
    if (component && type && endpoint && endpoint.via !== "provider") {
      const visibility = this.#resolve(component, type, endpoint.visibility);
      if (!visibility.known) return visibility.step;
      if (visibility.value === "public") {
        return step("pass", [
          ...evidence,
          ...visibility.evidence,
          createEvidence("DIRECT_INTERNET", { component: name, zone }),
        ]);
      }
    }
    return step("fail", [
      ...evidence,
      createEvidence("NO_PUBLIC_ADDRESS", { component: name, zone }),
    ]);
  }

  /** The implicit gateway attached to the nearest zone of a zone's chain, if any. */
  #implicitGateway(zone: string): Resolved<string | undefined> {
    const gateways: { component: Component; type: ComponentType }[] = [];
    const seen = new Set<string>();
    for (const component of this.#context.model.components) {
      if (seen.has(component.id)) continue;
      seen.add(component.id);
      const type = this.#type(component);
      const params = type?.traits.gateway;
      const carries = params?.families?.includes(this.family) ?? true;
      if (type && params?.implicit && carries) gateways.push({ component, type });
    }
    gateways.sort((a, b) => compareStrings(a.component.id, b.component.id));
    for (const current of this.chain(zone)) {
      for (const { component, type } of gateways) {
        const connects = this.#references(component, type, type.traits.gateway?.connects);
        if (!connects.known) return connects;
        if (connects.value.includes(current)) {
          return { known: true, value: component.id, evidence: connects.evidence };
        }
      }
    }
    return { known: true, value: undefined, evidence: [] };
  }

  /** Traffic through a gateway, chosen by a route or attached to the zone implicitly. */
  #viaGateway(
    zone: string,
    id: string,
    direction: "inbound" | "outbound",
    peer: Party,
    ports: PortSpec,
    depth: number,
    how: { evidence: Evidence[]; implicit: boolean },
  ): Step {
    const gateway = this.#component(id);
    const type = gateway && this.#type(gateway);
    const params = type?.traits.gateway;
    if (!gateway || !type || !params) {
      return step("fail", [...how.evidence, createEvidence("GATEWAY_INVALID", { gateway: id })]);
    }
    const network = this.root(zone);
    const connects = this.#references(gateway, type, params.connects);
    if (!connects.known) return connects.step;
    const networks = [
      ...connects.value.map((target) => this.root(target)),
      ...this.placements(gateway).map((placement) => this.root(placement)),
    ];
    if (!networks.includes(network)) {
      return step("fail", [
        ...how.evidence,
        createEvidence("GATEWAY_NOT_ATTACHED", { gateway: id, network: network ?? zone }),
      ]);
    }
    if (params.services !== undefined) {
      return step("fail", [
        ...how.evidence,
        createEvidence("GATEWAY_SERVICES_ONLY", { gateway: id, zone }),
      ]);
    }
    if (params.families && !params.families.includes(this.family)) {
      return step("fail", [
        ...how.evidence,
        createEvidence("GATEWAY_FAMILY_UNSUPPORTED", { gateway: id, family: `IPv${this.family}` }),
      ]);
    }
    const directionValue = this.#resolve(gateway, type, params.direction);
    if (!directionValue.known) return directionValue.step;
    const evidence = [...how.evidence, ...connects.evidence, ...directionValue.evidence];
    const self = this.#attached([id], "self");
    const throughGateway = (): Step => {
      if (!self.known) return self.step;
      const outside: Party = { ids: [], position: undefined };
      return combineSteps(
        self.value.map((filter) =>
          this.evaluate(filter, direction, peer.component ? peer : outside, ports, network),
        ),
      );
    };
    if (directionValue.value === "both") {
      return combineSteps([
        step("pass", [...evidence, createEvidence("INTERNET_ROUTE", { zone, gateway: id })]),
        throughGateway(),
      ]);
    }
    if (directionValue.value !== "outbound-only") {
      return step("undecidable", [
        ...evidence,
        ...invalidValue(gateway, params.direction).evidence,
      ]);
    }
    if (direction === "inbound") {
      return step("fail", [
        ...evidence,
        createEvidence("GATEWAY_OUTBOUND_ONLY", { gateway: id, zone }),
      ]);
    }
    const nat = step("pass", [...evidence, createEvidence("NAT_ROUTE", { zone, gateway: id })]);
    // An outbound-only gateway that is not placed in a zone reaches the internet itself (an
    // implicit NAT gateway, an egress-only internet gateway); one placed in a zone uses that
    // zone's internet route.
    const home = this.placements(gateway)[0];
    if (how.implicit || home === undefined) return combineSteps([nat, throughGateway()]);
    if (depth > 0) {
      return step("fail", [
        ...evidence,
        createEvidence("NAT_WITHOUT_INTERNET", { gateway: id, zone: home }),
      ]);
    }
    const onward = this.internet(home, "outbound", peer, ports, depth + 1);
    if (onward.verdict === "fail") {
      return step("fail", [
        ...evidence,
        ...onward.evidence,
        createEvidence("NAT_WITHOUT_INTERNET", { gateway: id, zone: home }),
      ]);
    }
    return combineSteps([nat, onward, throughGateway()]);
  }
}
