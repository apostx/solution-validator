import type { Registry } from "../core/registry";
import { issuesToFindings, validateSchema } from "../core/schema-issues";
import { isTraitId } from "../core/traits";
import { createFinding, type Finding, hasErrors, sortFindings } from "../messages/finding";
import { cloneJson } from "../util/json";
import { type Selector, Task } from "./task-schema";

export type ParseTaskResult =
  | { readonly ok: true; readonly task: Task; readonly findings: readonly Finding[] }
  | { readonly ok: false; readonly findings: readonly Finding[] };

/**
 * Checks a task against the task schema and the registry: packs, unique ids, known types,
 * categories, traits, actions and ports, and id selectors that refer to provided components.
 * It never throws for invalid input. JSON text is accepted as well.
 */
export function parseTask(input: unknown, registry: Registry): ParseTaskResult {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return { ok: false, findings: [createFinding("JSON_INVALID", [], {})] };
    }
  }
  const issues = validateSchema(Task, value);
  if (issues.length > 0) return { ok: false, findings: issuesToFindings(issues, []) };
  const task = cloneJson(value) as Task;
  const findings = sortFindings(checkTask(task, registry));
  return hasErrors(findings) ? { ok: false, findings } : { ok: true, task, findings };
}

function checkTask(task: Task, registry: Registry): Finding[] {
  const findings: Finding[] = [];
  for (const pack of task.packs) {
    if (!registry.getPack(pack)) findings.push(createFinding("TASK_PACK_UNKNOWN", [], { pack }));
  }
  const packs = registry.resolvePacks(task.packs);
  const usable = (pack: string | undefined) => pack !== undefined && packs.includes(pack);
  const unknown = (subject: string, path: string, kind: string, id: string) =>
    findings.push(createFinding("TASK_REFERENCE_UNKNOWN", [subject], { path, kind, id }));

  const provided = task.provided ?? [];
  const counts = new Map<string, number>();
  for (const element of [...provided, ...task.requirements]) {
    counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
  }
  for (const [id, count] of counts) {
    if (count > 1) findings.push(createFinding("TASK_ID_DUPLICATE", [id], { id }));
  }

  provided.forEach((component, index) => {
    if (!usable(registry.getType(component.type)?.pack)) {
      unknown(component.id, `/provided/${index}/type`, "type", component.type);
    }
  });

  const providedIds = new Set(provided.map((component) => component.id));
  const checkSelector = (subject: string, path: string, selector: Selector) => {
    if (selector.id !== undefined && !providedIds.has(selector.id)) {
      findings.push(
        createFinding("TASK_SELECTOR_NOT_PROVIDED", [subject], {
          path: `${path}/id`,
          id: selector.id,
        }),
      );
    }
    if (selector.type !== undefined && !usable(registry.getType(selector.type)?.pack)) {
      unknown(subject, `${path}/type`, "type", selector.type);
    }
    if (selector.category !== undefined && !usable(registry.getCategory(selector.category)?.pack)) {
      unknown(subject, `${path}/category`, "category", selector.category);
    }
    if (selector.trait !== undefined && !isTraitId(selector.trait)) {
      unknown(subject, `${path}/trait`, "trait", selector.trait);
    }
  };

  task.requirements.forEach((requirement, index) => {
    const path = `/requirements/${index}`;
    if (requirement.type === "uses") {
      checkSelector(requirement.id, `${path}/select`, requirement.select);
      return;
    }
    checkSelector(requirement.id, `${path}/from`, requirement.from);
    checkSelector(requirement.id, `${path}/to`, requirement.to);
    if (requirement.action !== undefined && !usable(registry.getAction(requirement.action)?.pack)) {
      unknown(requirement.id, `${path}/action`, "action", requirement.action);
    }
    if (
      requirement.type === "reachable" &&
      typeof requirement.port === "string" &&
      !usable(registry.getPort(requirement.port)?.pack)
    ) {
      unknown(requirement.id, `${path}/port`, "port", requirement.port);
    }
  });
  return findings;
}
