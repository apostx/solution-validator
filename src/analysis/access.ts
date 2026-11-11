import type { SolutionModel } from "../core/model";
import { createFinding, type Finding } from "../messages/finding";
import { compareStrings } from "../util/compare";
import {
  type AccessContext,
  type CheckOutcome,
  checkAuthorization,
  checkConnectivity,
  checkForwarding,
  type ExposureFact,
  exposureOf,
} from "./checks/access-checks";
import { checkCompatibility } from "./checks/compatibility";
import { resolveIntent } from "./checks/intent-context";
import { type Assumption, type AssumptionPolicy, ParameterResolver } from "./parameters";
import { combineVerdicts, type IntentVerdict } from "./verdict";

export interface AccessAnalysis {
  intents: IntentVerdict[];
  exposure: ExposureFact[];
  assumptions: Assumption[];
  findings: Finding[];
}

/**
 * Verifies every intent at the logical level with the four checks (compatibility, forwarding,
 * connectivity, authorization), and decides which components are directly accessible from the
 * internet. Compatibility failures are reported by `connection-validity`.
 */
export function checkAccess(
  model: SolutionModel,
  policy: AssumptionPolicy,
  level: "logical" | "detailed" = "logical",
): AccessAnalysis {
  const context: AccessContext = { model, resolver: new ParameterResolver(policy), level };
  const intents: IntentVerdict[] = [];
  const findings: Finding[] = [];

  for (const intent of model.intents) {
    const resolution = resolveIntent(model, intent);
    if ("missing" in resolution) {
      intents.push({
        intent: intent.id,
        verdict: "undecidable",
        checks: [{ check: "compatibility", verdict: "undecidable", evidence: resolution.missing }],
      });
      continue;
    }
    const { resolved } = resolution;
    const outcomes: CheckOutcome[] = [{ result: checkCompatibility(model, resolved), missing: [] }];
    for (const check of [checkForwarding, checkConnectivity, checkAuthorization]) {
      const result = check(context, resolved);
      if (result) outcomes.push(result);
    }
    const verdict = combineVerdicts(outcomes.map((outcome) => outcome.result.verdict));
    intents.push({ intent: intent.id, verdict, checks: outcomes.map((outcome) => outcome.result) });

    const ids = { intent: intent.id, from: resolved.from.id, to: resolved.to.id };
    if (verdict === "fail") {
      for (const { result } of outcomes) {
        if (result.verdict !== "fail") continue;
        if (result.check === "forwarding") {
          findings.push(createFinding("ACCESS_ROUTE_MISSING", [intent.id], ids));
        } else if (result.check === "connectivity") {
          findings.push(createFinding("ACCESS_NOT_REACHABLE", [intent.id], ids));
        } else if (result.check === "authorization") {
          findings.push(
            createFinding("ACCESS_PERMISSION_MISSING", [intent.id], {
              ...ids,
              action: intent.action ?? "",
            }),
          );
        }
      }
    } else if (verdict === "undecidable") {
      for (const outcome of outcomes) {
        for (const missing of outcome.missing) {
          findings.push(
            createFinding("ACCESS_PROPERTY_UNSET", [intent.id], {
              intent: intent.id,
              component: missing.component,
              property: missing.property,
            }),
          );
        }
        if (outcome.addressUnknown) {
          findings.push(
            createFinding("ACCESS_ADDRESS_UNDECIDABLE", [intent.id], { intent: intent.id }),
          );
        }
        if (outcome.portUnknown) {
          findings.push(createFinding("ACCESS_PORT_UNKNOWN", [intent.id], { intent: intent.id }));
        }
        if (outcome.actionMissing) {
          findings.push(
            createFinding("ACCESS_ACTION_MISSING", [intent.id], { intent: intent.id, to: ids.to }),
          );
        }
      }
    }
  }
  intents.sort((a, b) => compareStrings(a.intent, b.intent));

  const exposure: ExposureFact[] = [];
  const seen = new Set<string>();
  for (const component of model.components) {
    if (seen.has(component.id)) continue;
    seen.add(component.id);
    const type = model.getType(component);
    const fact = type && exposureOf(context, component, type);
    if (!fact) continue;
    exposure.push(fact);
    if (fact.exposure === "exposed") {
      findings.push(
        createFinding("EXPOSED_TO_INTERNET", [component.id], { component: component.id }),
      );
    }
  }
  exposure.sort((a, b) => compareStrings(a.component, b.component));

  return { intents, exposure, assumptions: context.resolver.assumptions(), findings };
}
