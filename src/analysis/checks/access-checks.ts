import type { SolutionModel } from "../../core/model";
import type { ComponentType } from "../../core/registry";
import type { Component } from "../../core/solution-schema";
import { VISIBILITIES } from "../../core/traits";
import {
  invalidValue,
  type MissingProperty,
  type ParameterResolver,
  stringFieldItems,
} from "../parameters";
import { type CheckResult, combineVerdicts, createEvidence, type Evidence } from "../verdict";
import type { ResolvedIntent } from "./intent-context";
import {
  anySteps,
  combineSteps,
  Network,
  type Party,
  type PortSpec,
  type Step,
  step,
} from "./network";
import { samePort } from "./ports";

/** A check's result, with what the access analysis needs to report findings. */
export interface CheckOutcome {
  result: CheckResult;
  /** Unset properties that made the check undecidable. */
  missing: MissingProperty[];
  /** A traffic filter limits ports, and the intent's port is not known. */
  portUnknown?: boolean;
  /** An address range could not be matched with the known addresses. */
  addressUnknown?: boolean;
  /** The check needed an action, and the intent states none. */
  actionMissing?: boolean;
}

export interface AccessContext {
  model: SolutionModel;
  resolver: ParameterResolver;
  /** `detailed` also uses address spaces, address ranges and port ranges. Default: logical. */
  level?: "logical" | "detailed";
}

type Targets = { known: true; targets: string[]; evidence: Evidence[] } | Unknown;
type Unknown = { known: false; evidence: Evidence[]; missing: MissingProperty[] };

function unknown(value: { evidence: Evidence[]; missing?: MissingProperty }): Unknown {
  return { known: false, evidence: value.evidence, missing: value.missing ? [value.missing] : [] };
}

/** The components a forwarder's routes lead to, or why they are unknown. */
export function routeTargets(
  context: AccessContext,
  component: Component,
  type: ComponentType,
): Targets | undefined {
  const forwarder = type.traits.forwarder;
  if (!forwarder) return undefined;
  const routes = context.resolver.resolve(component, type, forwarder.routes);
  if (!routes.known) return unknown(routes);
  const items = stringFieldItems(routes.value, forwarder.targetField ?? "target");
  if (!items) return unknown(invalidValue(component, forwarder.routes));
  return { known: true, targets: items.map((item) => item.field), evidence: routes.evidence };
}

/** Check 2, forwarding: if the source is a forwarder, its routes must lead to the target. */
export function checkForwarding(
  context: AccessContext,
  { from, fromType, to }: ResolvedIntent,
): CheckOutcome | undefined {
  const routes = routeTargets(context, from, fromType);
  if (!routes) return undefined;
  if (!routes.known) {
    return outcome("forwarding", "undecidable", routes.evidence, routes.missing);
  }
  const found = routes.targets.includes(to.id);
  return outcome("forwarding", found ? "pass" : "fail", [
    ...routes.evidence,
    createEvidence(found ? "ROUTE_FOUND" : "ROUTE_MISSING", { from: from.id, to: to.id }),
  ]);
}

/**
 * Check 3, connectivity: the target's endpoint must be reachable from the source.
 *
 * - Outside every zone, a public endpoint is reachable from anywhere and a private one is not.
 * - Inside the same network (zones with the same outermost zone), public and private endpoints
 *   are reachable, subject to the traffic filters on the way.
 * - Between networks, or between a network and the outside, traffic needs a route to the
 *   internet through a gateway (inbound: one that allows both directions), a public endpoint,
 *   and the traffic filters' permission on both sides.
 * - A component without an endpoint is reached only through a forwarder that routes to it.
 *
 * Groups stand for their members, and a component placed in several zones must be reachable in
 * each: every combination must pass. The intent's port must be one the endpoint listens on.
 */
export function checkConnectivity(
  context: AccessContext,
  resolved: ResolvedIntent,
): CheckOutcome | undefined {
  const { intent, from, fromType, to, toType } = resolved;
  const endpoint = toType.traits.endpoint;
  if (!endpoint) return undefined;
  const visibility = context.resolver.resolve(to, toType, endpoint.visibility);
  if (!visibility.known) {
    return outcome("connectivity", "undecidable", visibility.evidence, unknown(visibility).missing);
  }
  if (!VISIBILITIES.includes(visibility.value as never)) {
    const invalid = invalidValue(to, endpoint.visibility);
    return outcome("connectivity", "undecidable", [...visibility.evidence, ...invalid.evidence]);
  }
  const evidence = [...visibility.evidence];
  const ids = { from: from.id, to: to.id };

  let reach: Step;
  if (visibility.value === "none") {
    const routes = routeTargets(context, from, fromType);
    if (routes && !routes.known) {
      return outcome(
        "connectivity",
        "undecidable",
        [...evidence, ...routes.evidence],
        routes.missing,
      );
    }
    if (!routes?.targets.includes(to.id)) {
      evidence.push(createEvidence("ENDPOINT_NONE", ids));
      return outcome("connectivity", "fail", evidence);
    }
    reach = step("pass", [...routes.evidence, createEvidence("ENDPOINT_FORWARDED", ids)]);
  } else {
    const network = new Network(context);
    const sources = network.members(from);
    const targets = network.members(to);
    const parts: Step[] = [];
    for (const side of [sources, targets]) if (!side.known) parts.push(side.step);
    if (sources.known && targets.known) {
      const targetParties =
        endpoint.via === "provider"
          ? targets.value.map((party) => ({ ...party, position: undefined }))
          : targets.value;
      const ports = portSpec(intent.port, endpoint.ports);
      for (const source of dedupe(sources.value)) {
        for (const target of dedupe(targetParties)) {
          parts.push(byFamily(network, source, target, visibility.value as string, ports));
        }
      }
      parts.unshift(step("pass", [...sources.evidence, ...targets.evidence]));
    }
    reach = combineSteps(parts);
  }

  const all = [...evidence, ...reach.evidence];
  const port = intent.port;
  if (reach.verdict !== "fail" && port !== undefined && endpoint.ports !== undefined) {
    const open = endpoint.ports.some((id) => samePort(context.model, id, port));
    all.push(
      open
        ? createEvidence("PORT_OPEN", { to: to.id, port })
        : createEvidence("PORT_CLOSED", { to: to.id, port, ports: endpoint.ports.join(", ") }),
    );
    if (!open) return outcome("connectivity", "fail", all);
  }
  return {
    ...outcome("connectivity", reach.verdict, all, reach.missing),
    ...(reach.portUnknown && reach.verdict === "undecidable" ? { portUnknown: true } : {}),
    ...(reach.addressUnknown && reach.verdict === "undecidable" ? { addressUnknown: true } : {}),
  };
}

function portSpec(
  port: string | number | undefined,
  endpointPorts: readonly string[] | undefined,
): PortSpec {
  if (port !== undefined) return { kind: "ports", ports: [port] };
  if (endpointPorts !== undefined) return { kind: "ports", ports: [...endpointPorts] };
  return { kind: "unknown" };
}

function dedupe(parties: readonly Party[]): Party[] {
  const seen = new Set<string>();
  return parties.filter((party) => {
    const key = `${party.component?.id ?? ""}\u0000${party.position ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Traffic may use any address family both parties have (IPv6 only at the detailed level);
 * one family that works is enough, as clients fall back to the other.
 */
function byFamily(
  network: Network,
  source: Party,
  target: Party,
  visibility: string,
  ports: PortSpec,
): Step {
  const theirs = network.familiesOf(target);
  // Between two parties outside every zone, nothing in the model depends on the family.
  const outside = source.position === undefined && target.position === undefined;
  const families = outside
    ? [4 as const]
    : network.familiesOf(source).filter((family) => theirs.includes(family));
  if (families.length <= 1) {
    return path(network.withFamily(families[0] ?? 4), source, target, visibility, ports);
  }
  return anySteps(
    families.map((family) => {
      const result = path(network.withFamily(family), source, target, visibility, ports);
      return {
        ...result,
        evidence: [
          createEvidence("ADDRESS_FAMILY", { family: `IPv${family}` }),
          ...result.evidence,
        ],
      };
    }),
  );
}

/** Whether traffic gets from one party to the other, through routes, gateways and filters. */
function path(
  network: Network,
  source: Party,
  target: Party,
  visibility: string,
  ports: PortSpec,
): Step {
  const from = source.component?.id ?? "the internet";
  const to = target.component?.id ?? "the internet";
  const sourceNetwork = network.root(source.position);
  const targetNetwork = network.root(target.position);
  const steps: Step[] = [];
  if (sourceNetwork !== undefined && sourceNetwork === targetNetwork) {
    steps.push(
      step("pass", [createEvidence("SAME_NETWORK", { from, to, network: sourceNetwork })]),
    );
  } else {
    if (visibility === "private") {
      return step("fail", [createEvidence("ENDPOINT_PRIVATE", { from, to })]);
    }
    if (source.position !== undefined) {
      steps.push(network.internet(source.position, "outbound", target, ports, 0, source));
    }
    if (target.position !== undefined) {
      steps.push(network.internet(target.position, "inbound", source, ports, 0, target));
    } else {
      steps.push(step("pass", [createEvidence("ENDPOINT_PUBLIC", { from, to })]));
    }
  }
  steps.push(network.filtersOnSide(source, target, "outbound", ports));
  steps.push(network.filtersOnSide(target, source, "inbound", ports));
  return combineSteps(steps);
}

/**
 * Check 4, authorization: if the target controls access, the source needs a grant that allows
 * the action, a route that authorizes it, or the target must allow the action publicly.
 */
export function checkAuthorization(
  context: AccessContext,
  { intent, from, fromType, to, toType }: ResolvedIntent,
): CheckOutcome | undefined {
  const controlled = toType.traits["access-controlled"];
  if (!controlled) return undefined;
  const action = intent.action;
  if (action === undefined) {
    return {
      ...outcome("authorization", "undecidable", [
        createEvidence("ACTION_REQUIRED", { to: to.id }),
      ]),
      actionMissing: true,
    };
  }

  // Every way to be allowed is checked: pass if one allows, undecidable if one is unknown.
  const paths: {
    verdict: "pass" | "fail" | "undecidable";
    evidence: Evidence[];
    missing: MissingProperty[];
  }[] = [];

  const routes = fromType.traits.forwarder?.authorizes
    ? routeTargets(context, from, fromType)
    : undefined;
  if (routes && !routes.known) {
    paths.push({ verdict: "undecidable", evidence: routes.evidence, missing: routes.missing });
  } else if (routes?.targets.includes(to.id)) {
    paths.push({
      verdict: "pass",
      evidence: [
        ...routes.evidence,
        createEvidence("FORWARDER_AUTHORIZED", { from: from.id, to: to.id }),
      ],
      missing: [],
    });
  }

  const principal = fromType.traits.principal;
  if (principal) {
    const grants = context.resolver.resolve(from, fromType, principal.grants);
    const items = grants.known
      ? stringFieldItems(grants.value, principal.resourceField ?? "resource")
      : undefined;
    if (!grants.known) {
      paths.push({
        verdict: "undecidable",
        evidence: grants.evidence,
        missing: unknown(grants).missing,
      });
    } else if (!items) {
      paths.push({
        verdict: "undecidable",
        evidence: invalidValue(from, principal.grants).evidence,
        missing: [],
      });
    } else {
      const accessField = principal.accessField ?? "access";
      const grant = items.find(({ item, field }) => {
        const access = item[accessField];
        return (
          field === to.id &&
          typeof access === "string" &&
          (controlled.levels[access] ?? []).includes(action)
        );
      });
      paths.push(
        grant
          ? {
              verdict: "pass",
              evidence: [
                ...grants.evidence,
                createEvidence("GRANT_FOUND", {
                  from: from.id,
                  to: to.id,
                  access: String(grant.item[accessField]),
                  action,
                }),
              ],
              missing: [],
            }
          : {
              verdict: "fail",
              evidence: [
                ...grants.evidence,
                createEvidence("GRANT_MISSING", { from: from.id, to: to.id, action }),
              ],
              missing: [],
            },
      );
    }
  } else {
    paths.push({
      verdict: "fail",
      evidence: [createEvidence("NOT_PRINCIPAL", { from: from.id })],
      missing: [],
    });
  }

  if (controlled.public !== undefined) {
    const open = context.resolver.resolve(to, toType, controlled.public);
    if (!open.known) {
      paths.push({
        verdict: "undecidable",
        evidence: open.evidence,
        missing: unknown(open).missing,
      });
    } else {
      const allowed = open.value === true && (controlled.publicActions ?? []).includes(action);
      paths.push({
        verdict: allowed ? "pass" : "fail",
        evidence: [
          ...open.evidence,
          createEvidence(allowed ? "PUBLIC_ALLOWED" : "PUBLIC_DENIED", { to: to.id, action }),
        ],
        missing: [],
      });
    }
  }

  const passing = paths.find((path) => path.verdict === "pass");
  if (passing) return outcome("authorization", "pass", passing.evidence);
  const evidence = paths.flatMap((path) => path.evidence);
  const missing = paths.flatMap((path) => path.missing);
  const verdict = paths.some((path) => path.verdict === "undecidable") ? "undecidable" : "fail";
  return outcome("authorization", verdict, evidence, missing);
}

function outcome(
  check: CheckResult["check"],
  verdict: CheckResult["verdict"],
  evidence: Evidence[],
  missing: MissingProperty[] = [],
): CheckOutcome {
  return { result: { check, verdict: combineVerdicts([verdict]), evidence }, missing };
}

/** Whether an anonymous caller from outside the solution can reach and use a component. */
export interface ExposureFact {
  component: string;
  exposure: "exposed" | "not-exposed" | "undecidable";
  /** Actions anonymous callers may perform, when access control limits them. */
  actions?: string[];
  /** Ports open to anonymous callers, when the component is inside a network. */
  ports?: string[];
  evidence: Evidence[];
}

/**
 * Decides whether a component is directly accessible from the internet: its endpoint is public
 * and reachable from outside (through a gateway and the traffic filters, when it is inside a
 * network), and it either does not control access or allows public access. External
 * components, which stand for the outside parties themselves, are not reported.
 */
export function exposureOf(
  context: AccessContext,
  component: Component,
  type: ComponentType,
): ExposureFact | undefined {
  const endpoint = type.traits.endpoint;
  if (!endpoint || type.category === "external") return undefined;
  const fact = (
    exposure: ExposureFact["exposure"],
    evidence: Evidence[],
    extra: { actions?: string[]; ports?: string[] } = {},
  ): ExposureFact => ({ component: component.id, exposure, ...extra, evidence });
  const visibility = context.resolver.resolve(component, type, endpoint.visibility);
  if (!visibility.known) return fact("undecidable", visibility.evidence);
  if (!VISIBILITIES.includes(visibility.value as never)) {
    return fact("undecidable", [
      ...visibility.evidence,
      ...invalidValue(component, endpoint.visibility).evidence,
    ]);
  }
  const evidence = [...visibility.evidence];
  if (visibility.value !== "public") {
    evidence.push(createEvidence("ENDPOINT_NOT_PUBLIC", { component: component.id }));
    return fact("not-exposed", evidence);
  }
  evidence.push(createEvidence("ENDPOINT_PUBLIC", { from: "the internet", to: component.id }));

  // Inside a network, the outside must get in on at least one port, in every placement.
  const network = new Network(context);
  const placed = network.positions(component);
  if (endpoint.via !== "provider" && !placed.known) {
    return fact("undecidable", [...evidence, ...placed.step.evidence]);
  }
  const positions = endpoint.via === "provider" || !placed.known ? [undefined] : placed.value;
  const extra: { ports?: string[] } = {};
  if (positions.some((position) => position !== undefined)) {
    const outsider: Party = { ids: [], position: undefined };
    const candidates =
      endpoint.ports ??
      context.model.packs.flatMap((pack) =>
        context.model.registry.ports.filter((port) => port.pack === pack).map((port) => port.id),
      );
    const open: string[] = [];
    let undecidable: Step | undefined;
    let closed: Step | undefined;
    for (const port of candidates) {
      const ports: PortSpec = { kind: "ports", ports: [port] };
      const steps = positions.map((position) => {
        const party: Party = { component, ids: [component.id], position };
        if (position === undefined) return step("pass", []);
        return anySteps(
          network.familiesOf(party).map((family) => {
            const view = network.withFamily(family);
            return combineSteps([
              view.internet(position, "inbound", outsider, ports, 0, party),
              view.filtersOnSide(party, outsider, "inbound", ports),
            ]);
          }),
        );
      });
      const result = combineSteps(steps);
      if (result.verdict === "pass") {
        open.push(port);
        evidence.push(...result.evidence);
      } else if (result.verdict === "undecidable") {
        undecidable ??= result;
      } else {
        closed ??= result;
      }
    }
    if (open.length === 0) {
      if (undecidable) return fact("undecidable", [...evidence, ...undecidable.evidence]);
      evidence.push(...(closed?.evidence ?? []));
      evidence.push(createEvidence("NOT_REACHABLE_FROM_INTERNET", { component: component.id }));
      return fact("not-exposed", evidence);
    }
    extra.ports = open;
  }

  const controlled = type.traits["access-controlled"];
  if (!controlled) {
    evidence.push(createEvidence("ANONYMOUS_ALLOWED", { component: component.id }));
    return fact("exposed", evidence, extra);
  }
  const actions = controlled.publicActions ?? [];
  if (controlled.public === undefined || actions.length === 0) {
    evidence.push(createEvidence("PUBLIC_ACCESS_OFF", { component: component.id }));
    return fact("not-exposed", evidence);
  }
  const allowed = context.resolver.resolve(component, type, controlled.public);
  if (!allowed.known) return fact("undecidable", [...evidence, ...allowed.evidence]);
  evidence.push(...allowed.evidence);
  if (allowed.value !== true) {
    evidence.push(createEvidence("PUBLIC_ACCESS_OFF", { component: component.id }));
    return fact("not-exposed", evidence);
  }
  evidence.push(
    createEvidence("PUBLIC_ACCESS_ON", { component: component.id, actions: actions.join(", ") }),
  );
  return fact("exposed", evidence, { ...extra, actions: [...actions] });
}
