import type { SolutionModel } from "../../core/model";
import type { AcceptRule } from "../../core/pack-schema";
import type { ComponentType } from "../../core/registry";
import type { Intent } from "../../core/solution-schema";
import { isTraitId } from "../../core/traits";
import { type CheckResult, createEvidence } from "../verdict";
import { describePurpose, type ResolvedIntent } from "./intent-context";

/**
 * Check 1, compatibility: the target's type accepts the intent's action and port from the
 * source's type, according to its pack's `accepts` rules.
 */
export function checkCompatibility(model: SolutionModel, resolved: ResolvedIntent): CheckResult {
  const { intent, fromType, toType } = resolved;
  const params = {
    fromType: fromType.id,
    toType: toType.id,
    purpose: describePurpose(intent),
  };
  if (toType.accepts === undefined) {
    return {
      check: "compatibility",
      verdict: "undecidable",
      evidence: [createEvidence("ACCEPTS_UNDECLARED", { type: toType.id })],
    };
  }
  const index = toType.accepts.findIndex((rule) => matches(model, rule, fromType, intent));
  if (index === -1) {
    return {
      check: "compatibility",
      verdict: "fail",
      evidence: [createEvidence("NOT_ACCEPTED", params)],
    };
  }
  return {
    check: "compatibility",
    verdict: "pass",
    evidence: [createEvidence("ACCEPTED", { ...params, rule: index })],
  };
}

function matches(
  model: SolutionModel,
  rule: AcceptRule,
  fromType: ComponentType,
  intent: Intent,
): boolean {
  const from = rule.from;
  if (from?.type !== undefined && from.type !== fromType.id) return false;
  if (from?.category !== undefined && from.category !== fromType.category) return false;
  if (from?.trait !== undefined) {
    if (!isTraitId(from.trait) || fromType.traits[from.trait] === undefined) return false;
  }
  if (intent.action !== undefined && !(rule.actions ?? []).includes(intent.action)) return false;
  // A rule without ports does not restrict the port; the endpoint's ports decide that.
  const port = intent.port;
  if (port !== undefined && rule.ports !== undefined) {
    return rule.ports.some((id) => samePort(model, id, port));
  }
  return true;
}

/** A rule's port id matches the intent's port by id, or by port number and protocol. */
function samePort(model: SolutionModel, ruleId: string, port: string | number): boolean {
  const rulePort = model.registry.getPort(ruleId);
  if (typeof port === "number") return rulePort?.port === port;
  if (ruleId === port) return true;
  const intentPort = model.registry.getPort(port);
  return (
    rulePort !== undefined &&
    intentPort !== undefined &&
    rulePort.port === intentPort.port &&
    rulePort.protocol === intentPort.protocol
  );
}
