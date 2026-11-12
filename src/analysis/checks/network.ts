import type { ComponentType } from "../../core/registry";
import type { Component } from "../../core/solution-schema";
import type { Traits } from "../../core/traits";
import { compareStrings } from "../../util/compare";
import {
  type Cidr,
  cidrContains,
  cidrOverlaps,
  containsPublic,
  EPHEMERAL_PORTS,
  type PortRange,
  parseCidr,
  parsePortRange,
} from "../../util/ipv4";
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

  constructor(context: AccessContext) {
    this.#context = context;
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

  /** The address space of the innermost zone of a position that has one (detailed level). */
  addressOf(position: string): Resolved<{ zone: string; cidr: Cidr } | undefined> {
    for (const zone of this.chain(position)) {
      const component = this.#component(zone);
      const type = component && this.#type(component);
      const parameter = type?.traits.zone?.addressSpace;
      if (!component || !type || parameter === undefined) continue;
      const value = this.#resolve(component, type, parameter);
      if (!value.known) return value;
      if (typeof value.value !== "string") continue;
      const cidr = parseCidr(value.value);
      if (!cidr) {
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

  /** Whether a rule's peer names the party. `internet` means outside the filter's network. */
  #peerMatches(peer: string, party: Party, network: string | undefined): Resolved<boolean> {
    if (peer === "any") return { known: true, value: true, evidence: [] };
    const cidr = parseCidr(peer);
    if (cidr) return this.#cidrMatches(cidr, party);
    if (peer === "internet") {
      const root = this.root(party.position);
      return { known: true, value: root === undefined || root !== network, evidence: [] };
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
    if (cidr.prefix === 0) return { known: true, value: true, evidence: [] };
    const name = party.component?.id ?? "the internet";
    const unknown = (code: "CIDR_NEEDS_DETAILED" | "PEER_ADDRESS_UNKNOWN") => ({
      known: false as const,
      step: {
        ...step("undecidable", [createEvidence(code, { cidr: cidr.text, party: name })]),
        addressUnknown: true,
      },
    });
    if (this.#context.level !== "detailed") return unknown("CIDR_NEEDS_DETAILED");
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
   * Evaluates a filter for traffic in one direction with a peer. Rules are checked in order and
   * the first match decides; without a match, the filter's default policy applies.
   */
  evaluate(
    filter: FilterInfo,
    direction: "inbound" | "outbound",
    peer: Party,
    ports: PortSpec,
    network: string | undefined,
  ): Step {
    const name = filter.component.id;
    const peerName = peer.component?.id ?? "the internet";
    if (filter.params.rules === undefined) return this.#default(filter, direction, peerName, []);
    const rules = this.#resolve(filter.component, filter.type, filter.params.rules);
    if (!rules.known) return rules.step;
    if (!Array.isArray(rules.value)) {
      return step("undecidable", invalidValue(filter.component, filter.params.rules).evidence);
    }
    for (const [index, rule] of rules.value.entries()) {
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
            ...rules.evidence,
            createEvidence("FILTER_PORT_UNKNOWN", { filter: name, rule: index }),
          ]),
          portUnknown: true,
        };
      }
      const params = { filter: name, direction, peer: peerName, rule: index };
      return rule.effect === "deny"
        ? step("fail", [...rules.evidence, createEvidence("FILTER_DENIES", params)])
        : step("pass", [...rules.evidence, createEvidence("FILTER_ALLOWS", params)]);
    }
    return this.#default(filter, direction, peerName, rules.evidence);
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
   * The route internet traffic takes. `internet` and `0.0.0.0/0` are default routes. At the
   * detailed level, a more specific route whose range contains public addresses may catch the
   * traffic; the destination's address is not known, so a different gateway there makes the
   * choice ambiguous. Ranges without public addresses never carry internet traffic.
   */
  #internetRoute(
    routes: readonly Record<string, unknown>[],
  ): Record<string, unknown> | undefined | "ambiguous" {
    const isDefault = (route: Record<string, unknown>) =>
      route.destination === "internet" ||
      (typeof route.destination === "string" && parseCidr(route.destination)?.prefix === 0);
    const fallback = routes.find(isDefault);
    if (this.#context.level !== "detailed") return fallback;
    const specific = routes.filter((route) => {
      if (isDefault(route) || typeof route.destination !== "string") return false;
      const cidr = parseCidr(route.destination);
      return cidr !== undefined && containsPublic(cidr);
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
   * How traffic between a zone and the internet goes: through the gateway of its `internet`
   * route. `inbound` traffic needs a gateway that allows both directions; `outbound` traffic may
   * also use an outbound-only gateway, which itself needs such a route.
   */
  internet(
    zone: string,
    direction: "inbound" | "outbound",
    peer: Party,
    ports: PortSpec,
    depth = 0,
  ): Step {
    const found = this.#routes(zone);
    if (!found.known) return found.step;
    if (!found.value) {
      return step("fail", [createEvidence("LOCAL_ROUTES_ONLY", { zone })]);
    }
    const router = found.value.router.id;
    const service = peer.component?.id;
    if (direction === "outbound" && service !== undefined && peer.position === undefined) {
      const private_ = found.value.routes.find((route) => route.destination === service);
      if (private_ && typeof private_.gateway === "string") {
        return this.#serviceRoute(zone, private_.gateway, peer, ports, found.evidence);
      }
    }
    const selected = this.#internetRoute(found.value.routes);
    if (selected === "ambiguous") {
      return {
        ...step("undecidable", [
          ...found.evidence,
          createEvidence("ROUTE_AMBIGUOUS", { zone, router }),
        ]),
        addressUnknown: true,
      };
    }
    const route = selected;
    if (!route || typeof route.gateway !== "string") {
      return step("fail", [
        ...found.evidence,
        createEvidence("INTERNET_ROUTE_MISSING", { zone, router }),
      ]);
    }
    const id = route.gateway;
    const gateway = this.#component(id);
    const type = gateway && this.#type(gateway);
    const params = type?.traits.gateway;
    if (!gateway || !type || !params) {
      return step("fail", [...found.evidence, createEvidence("GATEWAY_INVALID", { gateway: id })]);
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
        ...found.evidence,
        createEvidence("GATEWAY_NOT_ATTACHED", { gateway: id, network: network ?? zone }),
      ]);
    }
    const directionValue = this.#resolve(gateway, type, params.direction);
    if (!directionValue.known) return directionValue.step;
    const evidence = [...found.evidence, ...connects.evidence, ...directionValue.evidence];
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
    const home = this.placements(gateway)[0];
    if (home === undefined || depth > 0) {
      return step("fail", [
        ...evidence,
        createEvidence("NAT_WITHOUT_INTERNET", { gateway: id, zone: home ?? zone }),
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
    return combineSteps([
      step("pass", [...evidence, createEvidence("NAT_ROUTE", { zone, gateway: id })]),
      onward,
      throughGateway(),
    ]);
  }
}
