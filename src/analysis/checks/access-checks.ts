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
import { samePort } from "./ports";

/** A check's result, with what the access analysis needs to report findings. */
export interface CheckOutcome {
  result: CheckResult;
  /** Unset properties that made the check undecidable. */
  missing: MissingProperty[];
  /** The check needed zone placement, which is not analyzed yet. */
  zones?: boolean;
  /** The check needed an action, and the intent states none. */
  actionMissing?: boolean;
}

export interface AccessContext {
  model: SolutionModel;
  resolver: ParameterResolver;
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
 * Check 3, connectivity: the target's endpoint must be reachable from the source. At the
 * logical level without zones, a public endpoint is reachable from anywhere, a private one only
 * from inside a private network, and a component without an endpoint only through a forwarder
 * that routes to it. The intent's port must be one the endpoint listens on.
 */
export function checkConnectivity(
  context: AccessContext,
  resolved: ResolvedIntent,
): CheckOutcome | undefined {
  const { intent, from, fromType, to, toType } = resolved;
  const endpoint = toType.traits.endpoint;
  if (!endpoint) return undefined;
  if ((from.placement ?? []).length > 0 || (to.placement ?? []).length > 0) {
    return {
      ...outcome("connectivity", "undecidable", [createEvidence("ZONES_UNSUPPORTED")]),
      zones: true,
    };
  }
  const visibility = context.resolver.resolve(to, toType, endpoint.visibility);
  if (!visibility.known) {
    return outcome("connectivity", "undecidable", visibility.evidence, unknown(visibility).missing);
  }
  const evidence = [...visibility.evidence];
  const ids = { from: from.id, to: to.id };
  switch (visibility.value) {
    case "public":
      evidence.push(createEvidence("ENDPOINT_PUBLIC", ids));
      break;
    case "private":
      evidence.push(createEvidence("ENDPOINT_PRIVATE", ids));
      return outcome("connectivity", "fail", evidence);
    case "none": {
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
      evidence.push(...routes.evidence, createEvidence("ENDPOINT_FORWARDED", ids));
      break;
    }
    default: {
      const invalid = invalidValue(to, endpoint.visibility);
      return outcome("connectivity", "undecidable", [...evidence, ...invalid.evidence]);
    }
  }
  const port = intent.port;
  if (port !== undefined && endpoint.ports !== undefined) {
    const open = endpoint.ports.some((id) => samePort(context.model, id, port));
    evidence.push(
      open
        ? createEvidence("PORT_OPEN", { to: to.id, port })
        : createEvidence("PORT_CLOSED", { to: to.id, port, ports: endpoint.ports.join(", ") }),
    );
    if (!open) return outcome("connectivity", "fail", evidence);
  }
  return outcome("connectivity", "pass", evidence);
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
  evidence: Evidence[];
}

/**
 * Decides whether a component is directly accessible from the internet: its endpoint is public
 * and it either does not control access or allows public access. External components, which
 * stand for the outside parties themselves, are not reported.
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
    actions?: string[],
  ): ExposureFact => ({
    component: component.id,
    exposure,
    ...(actions ? { actions } : {}),
    evidence,
  });
  if ((component.placement ?? []).length > 0) {
    return fact("undecidable", [createEvidence("ZONES_UNSUPPORTED")]);
  }
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
  evidence.push(createEvidence("ENDPOINT_PUBLIC", { to: component.id }));
  const controlled = type.traits["access-controlled"];
  if (!controlled) {
    evidence.push(createEvidence("ANONYMOUS_ALLOWED", { component: component.id }));
    return fact("exposed", evidence);
  }
  const actions = controlled.publicActions ?? [];
  if (controlled.public === undefined || actions.length === 0) {
    evidence.push(createEvidence("PUBLIC_ACCESS_OFF", { component: component.id }));
    return fact("not-exposed", evidence);
  }
  const open = context.resolver.resolve(component, type, controlled.public);
  if (!open.known) return fact("undecidable", [...evidence, ...open.evidence]);
  evidence.push(...open.evidence);
  if (open.value !== true) {
    evidence.push(createEvidence("PUBLIC_ACCESS_OFF", { component: component.id }));
    return fact("not-exposed", evidence);
  }
  evidence.push(
    createEvidence("PUBLIC_ACCESS_ON", { component: component.id, actions: actions.join(", ") }),
  );
  return fact("exposed", evidence, [...actions]);
}
