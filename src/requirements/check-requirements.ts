import type { AnalysisResult, VerdictSummary } from "../analysis/analyze";
import type { AvailabilityFact } from "../analysis/availability";
import {
  type AccessContext,
  checkAuthorization,
  checkConnectivity,
  checkForwarding,
} from "../analysis/checks/access-checks";
import type { ResolvedIntent } from "../analysis/checks/intent-context";
import { samePort } from "../analysis/checks/ports";
import { ParameterResolver } from "../analysis/parameters";
import {
  combineVerdicts,
  createEvidence,
  type Evidence,
  type IntentVerdict,
  type Verdict,
} from "../analysis/verdict";
import type { Meta } from "../core/ids";
import type { SolutionModel } from "../core/model";
import type { Component, Intent } from "../core/solution-schema";
import { isTraitId } from "../core/traits";
import { createFinding, type Finding, sortFindings } from "../messages/finding";
import { compareStrings, sortedUnique } from "../util/compare";
import type {
  NotReachableRequirement,
  ReachableRequirement,
  RedundantRequirement,
  Requirement,
  Selector,
  Task,
  UsesRequirement,
} from "./task-schema";

export interface RequirementResult {
  requirement: string;
  type: Requirement["type"];
  verdict: Verdict;
  evidence: Evidence[];
  /** The requirement's `meta`, unchanged, so consumers can weight requirements. */
  meta: Meta;
}

export interface RequirementsResult {
  task: string;
  /**
   * `fail` if any requirement fails or a provided component is missing or changed; otherwise
   * `undecidable` if any requirement is undecidable; otherwise `pass`.
   */
  verdict: Verdict;
  summary: VerdictSummary;
  /** One result per requirement, in the task's order. */
  requirements: RequirementResult[];
  findings: Finding[];
  /** The task's `meta`, unchanged. */
  meta: Meta;
}

/**
 * Checks a task's requirements against a solution and its analysis result. Intent verdicts come
 * from the result's `access` report; `not-reachable` checks direct access with the same checks
 * and the assumption policy the analysis used. The library does not score: consumers weight the
 * verdicts with the requirements' `meta`.
 *
 * The task must be one that `parseTask` accepted, and the result must come from `analyze` on
 * the same model.
 */
export function checkRequirements(
  model: SolutionModel,
  analysis: AnalysisResult,
  task: Task,
): RequirementsResult {
  const findings: Finding[] = [];
  let providedBroken = false;
  for (const provided of task.provided ?? []) {
    const component = model.getComponent(provided.id);
    if (!component) {
      providedBroken = true;
      findings.push(
        createFinding("TASK_PROVIDED_MISSING", [provided.id], { component: provided.id }),
      );
    } else if (component.type !== provided.type) {
      providedBroken = true;
      findings.push(
        createFinding("TASK_PROVIDED_CHANGED", [provided.id], {
          component: provided.id,
          actual: component.type,
          expected: provided.type,
        }),
      );
    }
  }

  for (const role of task.roles ?? []) {
    if (!model.components.some((component) => component.roles?.includes(role.id))) {
      findings.push(createFinding("TASK_ROLE_UNASSIGNED", [], { role: role.id }));
    }
  }

  const access = analysis.analyses.find((report) => report.id === "access");
  const availabilityReport = analysis.analyses.find((report) => report.id === "availability");
  const context: RequirementContext = {
    model,
    availability:
      availabilityReport?.id === "availability"
        ? new Map(availabilityReport.components.map((fact) => [fact.component, fact]))
        : undefined,
    intentVerdicts: access?.id === "access" ? indexVerdicts(access.intents) : undefined,
    access: {
      model,
      resolver: new ParameterResolver(analysis.options.assumptions),
      level: analysis.options.level,
    },
  };

  const requirements = task.requirements.map((requirement): RequirementResult => {
    const { verdict, evidence } = checkRequirement(context, requirement);
    if (verdict === "fail") {
      findings.push(
        createFinding("REQUIREMENT_FAILED", [requirement.id], { requirement: requirement.id }),
      );
    } else if (verdict === "undecidable") {
      findings.push(
        createFinding("REQUIREMENT_UNDECIDABLE", [requirement.id], {
          requirement: requirement.id,
        }),
      );
    }
    return {
      requirement: requirement.id,
      type: requirement.type,
      verdict,
      evidence,
      meta: requirement.meta ?? {},
    };
  });

  const summary = { pass: 0, fail: 0, undecidable: 0 };
  for (const result of requirements) summary[result.verdict] += 1;
  const verdicts = requirements.map((result) => result.verdict);
  return {
    task: task.id,
    verdict: combineVerdicts(providedBroken ? [...verdicts, "fail"] : verdicts),
    summary,
    requirements,
    findings: sortFindings(findings),
    meta: task.meta ?? {},
  };
}

interface RequirementContext {
  model: SolutionModel;
  /** Availability per component, when the result has an availability report. */
  availability: Map<string, AvailabilityFact> | undefined;
  intentVerdicts: Map<string, Verdict> | undefined;
  access: AccessContext;
}

interface Outcome {
  verdict: Verdict;
  evidence: Evidence[];
}

function checkRequirement(context: RequirementContext, requirement: Requirement): Outcome {
  switch (requirement.type) {
    case "reachable":
      return checkReachable(context, requirement);
    case "not-reachable":
      return checkNotReachable(context, requirement);
    case "uses":
      return checkUses(context, requirement);
    case "redundant":
      return checkRedundant(context, requirement);
  }
}

function indexVerdicts(intents: readonly IntentVerdict[]): Map<string, Verdict> {
  const index = new Map<string, Verdict>();
  for (const intent of intents)
    if (!index.has(intent.intent)) index.set(intent.intent, intent.verdict);
  return index;
}

/** The components a selector matches, sorted by id; only the first of duplicate ids. */
export function selectComponents(model: SolutionModel, selector: Selector): Component[] {
  const seen = new Set<string>();
  const matches: Component[] = [];
  for (const component of model.components) {
    if (seen.has(component.id)) continue;
    seen.add(component.id);
    if (selector.id !== undefined && component.id !== selector.id) continue;
    if (selector.type !== undefined && component.type !== selector.type) continue;
    const type = model.getType(component);
    if (selector.category !== undefined && type?.category !== selector.category) continue;
    if (selector.trait !== undefined) {
      if (!isTraitId(selector.trait) || type?.traits[selector.trait] === undefined) continue;
    }
    if (selector.role !== undefined && !component.roles?.includes(selector.role)) continue;
    matches.push(component);
  }
  return matches.sort((a, b) => compareStrings(a.id, b.id));
}

/** Describes a selector in English, for evidence: `type aws.s3`, `category data-store`. */
export function describeSelector(selector: Selector): string {
  const parts = (["id", "type", "category", "trait", "role"] as const).flatMap((key) =>
    selector[key] === undefined ? [] : [`${key} ${selector[key]}`],
  );
  return parts.length > 0 ? parts.join(" and ") : "any component";
}

function describePurpose(action: string | undefined, port?: string | number): string {
  const parts = [action, port === undefined ? undefined : `port ${port}`].filter(
    (part) => part !== undefined,
  );
  return parts.length > 0 ? ` (${parts.join(" on ")})` : "";
}

function samePurposePort(model: SolutionModel, wanted: string | number, actual: string | number) {
  if (typeof wanted === "string") return samePort(model, wanted, actual);
  if (typeof actual === "string") return samePort(model, actual, wanted);
  return wanted === actual;
}

function checkReachable(context: RequirementContext, requirement: ReachableRequirement): Outcome {
  const { model, intentVerdicts } = context;
  const sources = selectComponents(model, requirement.from);
  const targets = selectComponents(model, requirement.to);
  const empty = emptySelectors(requirement.from, sources, requirement.to, targets);
  if (empty.length > 0) return { verdict: "fail", evidence: empty };
  if (!intentVerdicts) {
    return {
      verdict: "undecidable",
      evidence: [createEvidence("ANALYSIS_MISSING", { analysis: "access" })],
    };
  }

  const targetIds = new Set(targets.map((target) => target.id));
  const intents = [...model.intents].sort((a, b) => compareStrings(a.id, b.id));
  const lastHop = (intent: Intent) =>
    targetIds.has(intent.to) &&
    (requirement.action === undefined || intent.action === requirement.action) &&
    (requirement.port === undefined ||
      (intent.port !== undefined && samePurposePort(model, requirement.port, intent.port)));

  // Breadth-first search for a chain of intents, first through passing intents only, then also
  // through undecidable ones.
  const search = (allowed: readonly Verdict[]): Intent[] | undefined => {
    const previous = new Map<string, Intent | null>(sources.map((source) => [source.id, null]));
    const queue = sources.map((source) => source.id);
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const intent of intents) {
        if (intent.from !== current) continue;
        const verdict = intentVerdicts.get(intent.id);
        if (!verdict || !allowed.includes(verdict)) continue;
        if (lastHop(intent)) return [...chain(previous, current), intent];
        if (!previous.has(intent.to)) {
          previous.set(intent.to, intent);
          queue.push(intent.to);
        }
      }
    }
    return undefined;
  };

  const passing = search(["pass"]);
  if (passing) {
    return {
      verdict: "pass",
      evidence: [createEvidence("PATH_FOUND", { path: describeChain(passing) })],
    };
  }
  const possible = search(["pass", "undecidable"]);
  if (possible) {
    const undecidable = possible.filter(
      (intent) => intentVerdicts.get(intent.id) === "undecidable",
    );
    return {
      verdict: "undecidable",
      evidence: [
        createEvidence("PATH_UNDECIDABLE", {
          path: describeChain(possible),
          intents: undecidable.map((intent) => intent.id).join(", "),
        }),
      ],
    };
  }
  return {
    verdict: "fail",
    evidence: [
      createEvidence("PATH_MISSING", {
        from: describeSelector(requirement.from),
        to: describeSelector(requirement.to),
        purpose: describePurpose(requirement.action, requirement.port),
      }),
    ],
  };
}

function chain(previous: Map<string, Intent | null>, end: string): Intent[] {
  const intents: Intent[] = [];
  let current = previous.get(end);
  while (current) {
    intents.unshift(current);
    current = previous.get(current.from);
  }
  return intents;
}

function describeChain(intents: readonly Intent[]): string {
  const first = intents[0];
  if (!first) return "";
  return [first.from, ...intents.map((intent) => `${intent.to} (${intent.id})`)].join(" → ");
}

function emptySelectors(
  fromSelector: Selector,
  sources: readonly Component[],
  toSelector: Selector,
  targets: readonly Component[],
): Evidence[] {
  const evidence: Evidence[] = [];
  if (sources.length === 0) {
    evidence.push(createEvidence("SELECTOR_EMPTY", { selector: describeSelector(fromSelector) }));
  }
  if (targets.length === 0) {
    evidence.push(createEvidence("SELECTOR_EMPTY", { selector: describeSelector(toSelector) }));
  }
  return evidence;
}

function checkNotReachable(
  context: RequirementContext,
  requirement: NotReachableRequirement,
): Outcome {
  const { model } = context;
  const sources = selectComponents(model, requirement.from);
  const targets = selectComponents(model, requirement.to);
  if (sources.length === 0) {
    // Without the source there is nothing to check; a missing provided source is reported too.
    return {
      verdict: "undecidable",
      evidence: [
        createEvidence("SELECTOR_EMPTY", { selector: describeSelector(requirement.from) }),
      ],
    };
  }
  if (targets.length === 0) {
    // No component of a type or category means there is nothing to reach. A role that no
    // component carries only means the solver has not tagged it yet.
    const role = requirement.to.role;
    return {
      verdict: role === undefined ? "pass" : "undecidable",
      evidence: [
        createEvidence("SELECTOR_EMPTY", { selector: describeSelector(requirement.to) }),
        ...(role === undefined ? [] : [createEvidence("ROLE_UNASSIGNED", { role })]),
      ],
    };
  }

  const accessible: Evidence[] = [];
  const unknown: Evidence[] = [];
  let pairs = 0;
  for (const source of sources) {
    const fromType = model.getType(source);
    for (const target of targets) {
      if (target.id === source.id) continue;
      const toType = model.getType(target);
      if (!fromType || !toType) {
        unknown.push(
          createEvidence("TYPE_MISSING", {
            component: fromType ? target.id : source.id,
            type: fromType ? target.type : source.type,
          }),
        );
        continue;
      }
      const controlled = toType.traits["access-controlled"];
      if (!toType.traits.endpoint && !controlled) {
        unknown.push(createEvidence("ACCESS_UNMODELED", { to: target.id }));
        continue;
      }
      const actions: (string | undefined)[] =
        requirement.action !== undefined
          ? [requirement.action]
          : controlled
            ? sortedUnique([
                ...Object.values(controlled.levels).flat(),
                ...(controlled.publicActions ?? []),
              ])
            : [undefined];
      for (const action of actions) {
        pairs += 1;
        const intent: Intent = {
          id: `${source.id}->${target.id}`,
          from: source.id,
          to: target.id,
          ...(action === undefined ? {} : { action }),
        };
        const resolved: ResolvedIntent = { intent, from: source, to: target, fromType, toType };
        const outcomes = [checkForwarding, checkConnectivity, checkAuthorization].flatMap(
          (check) => {
            const outcome = check(context.access, resolved);
            return outcome ? [outcome.result] : [];
          },
        );
        const verdict = combineVerdicts(outcomes.map((outcome) => outcome.verdict));
        const params = { from: source.id, to: target.id, purpose: describePurpose(action) };
        if (verdict === "pass") {
          accessible.push(createEvidence("ACCESSIBLE", params));
        } else if (verdict === "undecidable") {
          unknown.push(
            createEvidence("MAYBE_ACCESSIBLE", params),
            ...outcomes
              .filter((outcome) => outcome.verdict === "undecidable")
              .flatMap((outcome) => outcome.evidence),
          );
        }
      }
    }
  }
  if (accessible.length > 0) return { verdict: "fail", evidence: accessible };
  if (unknown.length > 0) return { verdict: "undecidable", evidence: unknown };
  return { verdict: "pass", evidence: [createEvidence("NOT_ACCESSIBLE", { pairs })] };
}

function checkUses(context: RequirementContext, requirement: UsesRequirement): Outcome {
  const matches = selectComponents(context.model, requirement.select);
  const min = requirement.min ?? 1;
  return {
    verdict: matches.length >= min ? "pass" : "fail",
    evidence: [
      createEvidence("USES_COUNT", {
        count: matches.length,
        selector: describeSelector(requirement.select),
        min,
      }),
    ],
  };
}

function checkRedundant(context: RequirementContext, requirement: RedundantRequirement): Outcome {
  const matches = selectComponents(context.model, requirement.select);
  if (matches.length === 0) {
    return {
      verdict: "fail",
      evidence: [
        createEvidence("SELECTOR_EMPTY", { selector: describeSelector(requirement.select) }),
      ],
    };
  }
  if (!context.availability) {
    return {
      verdict: "undecidable",
      evidence: [createEvidence("ANALYSIS_MISSING", { analysis: "availability" })],
    };
  }
  const evidence: Evidence[] = [];
  const verdicts: Verdict[] = [];
  for (const component of matches) {
    const fact = context.availability.get(component.id);
    if (fact?.availability === "managed" || fact?.availability === "redundant") {
      verdicts.push("pass");
      evidence.push(
        createEvidence("REDUNDANT", { component: component.id, availability: fact.availability }),
      );
    } else if (fact?.availability === "single") {
      verdicts.push("fail");
      evidence.push(createEvidence("NOT_REDUNDANT", { component: component.id }));
    } else {
      verdicts.push("undecidable");
      evidence.push(createEvidence("REDUNDANCY_UNKNOWN", { component: component.id }));
    }
  }
  return { verdict: combineVerdicts(verdicts), evidence };
}
