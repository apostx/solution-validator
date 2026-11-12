import type { SolutionModel } from "../core/model";
import type { ComponentType } from "../core/registry";
import type { Component } from "../core/solution-schema";
import { createFinding, type Finding } from "../messages/finding";
import { compareStrings, sortedUnique } from "../util/compare";
import { checkAccess } from "./access";
import type { AccessContext } from "./checks/access-checks";
import { Network, type Party } from "./checks/network";
import { type AssumptionPolicy, ParameterResolver } from "./parameters";
import { createEvidence, type Evidence } from "./verdict";

/** How a component survives the loss of one failure domain. */
export interface AvailabilityFact {
  component: string;
  /**
   * - `managed`: the provider spreads it across failure domains.
   * - `redundant`: it runs in two or more failure domains.
   * - `single`: it runs in one failure domain.
   * - `undecidable`: its failure domains are not known.
   */
  availability: "managed" | "redundant" | "single" | "undecidable";
  /** The failure domains it runs in, sorted. */
  domains: string[];
  evidence: Evidence[];
}

const GATEWAY_EVIDENCE = new Set(["INTERNET_ROUTE", "NAT_ROUTE", "PRIVATE_SERVICE_ROUTE"]);

/**
 * Availability facts at the logical level: the failure domains each runtime component spans,
 * single points of failure that intents with a `pass` verdict depend on, and zones that reach
 * the internet through a gateway in another failure domain.
 */
export function checkAvailability(
  model: SolutionModel,
  policy: AssumptionPolicy,
  level: "logical" | "detailed",
): { components: AvailabilityFact[]; findings: Finding[] } {
  const context: AccessContext = { model, resolver: new ParameterResolver(policy), level };
  const network = new Network(context);
  const findings: Finding[] = [];

  const facts = new Map<string, AvailabilityFact>();
  const seen = new Set<string>();
  for (const component of model.components) {
    if (seen.has(component.id)) continue;
    seen.add(component.id);
    const type = model.getType(component);
    if (!type || !isRuntime(type)) continue;
    facts.set(component.id, factOf(network, component, type));
  }

  // Single points of failure on the paths of intents that pass.
  const access = checkAccess(model, policy, level);
  const dependents = new Map<string, Set<string>>();
  for (const verdict of access.intents) {
    if (verdict.verdict !== "pass") continue;
    const intent = model.getIntent(verdict.intent);
    const from = intent && model.getComponent(intent.from);
    const to = intent && model.getComponent(intent.to);
    if (!intent || !from || !to) continue;
    for (const id of dependencies(network, model, from, to)) {
      const list = dependents.get(id) ?? new Set<string>();
      list.add(intent.id);
      dependents.set(id, list);
    }
  }
  for (const [id, intents] of [...dependents].sort(([a], [b]) => compareStrings(a, b))) {
    const fact = facts.get(id);
    if (fact?.availability !== "single") continue;
    findings.push(
      createFinding("AVAILABILITY_SINGLE_POINT", [id], {
        component: id,
        domain: fact.domains.join(", ") || "one failure domain",
        intents: [...intents].sort(compareStrings).join(", "),
      }),
    );
  }

  findings.push(...crossDomainFindings(network, model));
  return {
    components: [...facts.values()].sort((a, b) => compareStrings(a.component, b.component)),
    findings,
  };
}

/** Components that run: endpoints, gateways and groups; not zones, routers or filters. */
function isRuntime(type: ComponentType): boolean {
  if (type.category === "external") return false;
  const { endpoint, gateway, group } = type.traits;
  return endpoint !== undefined || gateway !== undefined || group !== undefined;
}

function factOf(network: Network, component: Component, type: ComponentType): AvailabilityFact {
  const fact = (
    availability: AvailabilityFact["availability"],
    domains: string[],
    evidence: Evidence[],
  ): AvailabilityFact => ({ component: component.id, availability, domains, evidence });
  const redundancy = type.traits.redundancy;
  if (redundancy?.managed) {
    return fact("managed", [], [createEvidence("MANAGED_SERVICE", { component: component.id })]);
  }
  const members = network.members(component);
  if (!members.known) return fact("undecidable", [], members.step.evidence);
  const placed = members.value.filter((party) => party.position !== undefined);
  if (placed.length === 0) {
    return fact("undecidable", [], [createEvidence("NOT_PLACED", { component: component.id })]);
  }
  let spread = true;
  const evidence: Evidence[] = [...members.evidence];
  if (redundancy?.spread !== undefined) {
    const value = network.resolveParameter(component, type, redundancy.spread);
    if (!value.known) return fact("undecidable", [], value.step.evidence);
    evidence.push(...value.evidence);
    spread = value.value !== false;
  }
  const parties = spread ? placed : placed.slice(0, 1);
  const domains: string[] = [];
  for (const party of parties) {
    const domain = network.failureDomainOf(party.position as string);
    if (!domain.known) return fact("undecidable", [], [...evidence, ...domain.step.evidence]);
    if (!domain.value) {
      return fact(
        "undecidable",
        [],
        [
          ...evidence,
          createEvidence("FAILURE_DOMAIN_UNKNOWN", {
            component: component.id,
            zone: party.position as string,
          }),
        ],
      );
    }
    evidence.push(...domain.evidence);
    domains.push(domain.value.domain);
  }
  const unique = sortedUnique(domains);
  if (!spread) evidence.push(createEvidence("SINGLE_INSTANCE", { component: component.id }));
  evidence.push(
    createEvidence("FAILURE_DOMAINS", { component: component.id, domains: unique.join(", ") }),
  );
  return fact(unique.length >= 2 ? "redundant" : "single", unique, evidence);
}

/** The components an intent's traffic depends on: its ends and the gateways it passes. */
function dependencies(
  network: Network,
  model: SolutionModel,
  from: Component,
  to: Component,
): string[] {
  const ids = new Set([from.id, to.id]);
  const toType = model.getType(to);
  const sources = network.members(from);
  const targets = network.members(to);
  if (!sources.known || !targets.known) return [...ids];
  const provider = toType?.traits.endpoint?.via === "provider";
  const targetParties = provider
    ? targets.value.map((party) => ({ ...party, position: undefined }))
    : targets.value;
  for (const source of sources.value) {
    for (const target of targetParties) {
      const same =
        source.position !== undefined &&
        network.root(source.position) === network.root(target.position);
      if (same) continue;
      if (source.position !== undefined) {
        gatewaysOf(
          network.internet(source.position, "outbound", target, { kind: "unknown" }).evidence,
          ids,
        );
      }
      if (target.position !== undefined) {
        gatewaysOf(
          network.internet(target.position, "inbound", source, { kind: "unknown" }).evidence,
          ids,
        );
      }
    }
  }
  return [...ids];
}

function gatewaysOf(evidence: readonly Evidence[], into: Set<string>): void {
  for (const item of evidence) {
    if (GATEWAY_EVIDENCE.has(item.code) && typeof item.params.gateway === "string") {
      into.add(item.params.gateway);
    }
  }
}

/** Zones whose internet traffic leaves through an outbound-only gateway in another domain. */
function crossDomainFindings(network: Network, model: SolutionModel): Finding[] {
  const findings: Finding[] = [];
  const outside: Party = { ids: [], position: undefined };
  const seen = new Set<string>();
  for (const zone of model.components) {
    if (seen.has(zone.id) || !network.isZone(zone.id)) continue;
    seen.add(zone.id);
    const own = network.failureDomainOf(zone.id);
    if (!own.known || !own.value) continue;
    const route = network.internet(zone.id, "outbound", outside, { kind: "unknown" });
    for (const item of route.evidence) {
      if (item.code !== "NAT_ROUTE" || typeof item.params.gateway !== "string") continue;
      const gateway = model.getComponent(item.params.gateway);
      const home = gateway ? network.placements(gateway)[0] : undefined;
      const theirs = home === undefined ? undefined : network.failureDomainOf(home);
      if (!theirs?.known || !theirs.value || theirs.value.domain === own.value.domain) continue;
      findings.push(
        createFinding("AVAILABILITY_CROSS_DOMAIN", [zone.id], {
          zone: zone.id,
          domain: own.value.domain,
          gateway: item.params.gateway,
          gatewayDomain: theirs.value.domain,
        }),
      );
    }
  }
  return findings;
}
