import type { SolutionModel } from "../../core/model";
import type { ComponentType } from "../../core/registry";
import type { Component, Intent } from "../../core/solution-schema";
import { createEvidence, type Evidence } from "../verdict";

/** An intent whose ends, types, action and port are all known. */
export interface ResolvedIntent {
  intent: Intent;
  from: Component;
  to: Component;
  fromType: ComponentType;
  toType: ComponentType;
}

/**
 * Resolves an intent's ends and types and checks that its purpose is known. When something is
 * missing, returns the evidence that makes every check on the intent undecidable. The
 * `model-validity` analysis reports the underlying problems as findings.
 */
export function resolveIntent(
  model: SolutionModel,
  intent: Intent,
): { resolved: ResolvedIntent } | { missing: Evidence[] } {
  const missing: Evidence[] = [];
  const from = model.getComponent(intent.from);
  const to = model.getComponent(intent.to);
  for (const [id, component] of [
    [intent.from, from],
    [intent.to, to],
  ] as const) {
    if (!component) {
      missing.push(createEvidence("COMPONENT_MISSING", { component: id }));
    } else if (!model.getType(component)) {
      missing.push(createEvidence("TYPE_MISSING", { component: id, type: component.type }));
    }
  }
  if (intent.action === undefined && intent.port === undefined) {
    missing.push(createEvidence("PURPOSE_MISSING"));
  }
  const usable = (pack: string | undefined) => pack !== undefined && model.packs.includes(pack);
  if (intent.action !== undefined && !usable(model.registry.getAction(intent.action)?.pack)) {
    missing.push(createEvidence("ACTION_UNDEFINED", { action: intent.action }));
  }
  if (typeof intent.port === "string" && !usable(model.registry.getPort(intent.port)?.pack)) {
    missing.push(createEvidence("PORT_UNDEFINED", { port: intent.port }));
  }

  const fromType = from && model.getType(from);
  const toType = to && model.getType(to);
  if (missing.length > 0 || !from || !to || !fromType || !toType) return { missing };
  return { resolved: { intent, from, to, fromType, toType } };
}

/** Describes what an intent asks for, in English: `invoke`, `port https`, or both. */
export function describePurpose(intent: Intent): string {
  const port = intent.port === undefined ? undefined : `port ${intent.port}`;
  if (intent.action !== undefined && port !== undefined) return `${intent.action} on ${port}`;
  return intent.action ?? port ?? "nothing";
}
