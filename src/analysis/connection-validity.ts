import type { SolutionModel } from "../core/model";
import { createFinding, type Finding } from "../messages/finding";
import { compareStrings } from "../util/compare";
import { checkCompatibility } from "./checks/compatibility";
import { describePurpose, resolveIntent } from "./checks/intent-context";
import { combineVerdicts, type IntentVerdict } from "./verdict";

/**
 * Decides for every intent whether the target's type accepts it from the source's type
 * (check 1 of the intent verification). Undecidable when an end, a type, the purpose or the
 * accepts rules are missing.
 */
export function checkConnectionValidity(model: SolutionModel): {
  intents: IntentVerdict[];
  findings: Finding[];
} {
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
    const check = checkCompatibility(model, resolved);
    intents.push({ intent: intent.id, verdict: combineVerdicts([check.verdict]), checks: [check] });
    if (check.verdict === "fail") {
      findings.push(
        createFinding("CONNECTION_NOT_ACCEPTED", [intent.id], {
          intent: intent.id,
          fromType: resolved.fromType.id,
          toType: resolved.toType.id,
          purpose: describePurpose(intent),
        }),
      );
    } else if (check.verdict === "undecidable") {
      findings.push(
        createFinding("CONNECTION_RULES_MISSING", [intent.id], {
          intent: intent.id,
          type: resolved.toType.id,
        }),
      );
    }
  }
  // Stable sort: intents that share an id keep their order in the model.
  intents.sort((a, b) => compareStrings(a.intent, b.intent));
  return { intents, findings };
}
