import type { Component, Intent, Solution } from "solution-validator";

/** Canvas position, stored in the component's free-form `meta`. */
export interface Position {
  x: number;
  y: number;
}

export type Selection = { kind: "component" | "intent"; id: string } | null;

export function positionOf(component: Component, index: number): Position {
  const position = component.meta?.position as Partial<Position> | undefined;
  if (typeof position?.x === "number" && typeof position.y === "number") {
    return { x: position.x, y: position.y };
  }
  return { x: 40 + (index % 4) * 220, y: 40 + Math.floor(index / 4) * 140 };
}

function uniqueId(solution: Solution, base: string): string {
  const taken = new Set([
    ...solution.components.map((component) => component.id),
    ...(solution.intents ?? []).map((intent) => intent.id),
  ]);
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

export function addComponent(solution: Solution, type: string, position: Position): Solution {
  const base = type.slice(type.indexOf(".") + 1);
  const component: Component = {
    id: uniqueId(solution, base),
    type,
    meta: { position: { x: Math.round(position.x), y: Math.round(position.y) } },
  };
  return { ...solution, components: [...solution.components, component] };
}

export function updateComponent(
  solution: Solution,
  id: string,
  update: (component: Component) => Component,
): Solution {
  return {
    ...solution,
    components: solution.components.map((component) =>
      component.id === id ? update(component) : component,
    ),
  };
}

export function moveComponent(solution: Solution, id: string, position: Position): Solution {
  return updateComponent(solution, id, (component) => ({
    ...component,
    meta: { ...component.meta, position: { x: Math.round(position.x), y: Math.round(position.y) } },
  }));
}

/** Sets a property, or removes it when `value` is undefined. */
export function setProperty(
  solution: Solution,
  id: string,
  name: string,
  value: unknown,
): Solution {
  return updateComponent(solution, id, (component) => {
    const properties = { ...component.properties };
    if (value === undefined) delete properties[name];
    else properties[name] = value;
    const { properties: _old, ...rest } = component;
    return Object.keys(properties).length > 0 ? { ...rest, properties } : rest;
  });
}

export function setLabel(solution: Solution, id: string, label: string): Solution {
  return updateComponent(solution, id, (component) => {
    const { label: _old, ...rest } = component;
    return label === "" ? rest : { ...rest, label };
  });
}

/** Removes components and the intents attached to them. */
export function removeComponents(solution: Solution, ids: readonly string[]): Solution {
  const removed = new Set(ids);
  return {
    ...solution,
    components: solution.components.filter((component) => !removed.has(component.id)),
    intents: (solution.intents ?? []).filter(
      (intent) => !removed.has(intent.from) && !removed.has(intent.to),
    ),
  };
}

export function addIntent(solution: Solution, from: string, to: string): Solution {
  const intent: Intent = { id: uniqueId(solution, "intent"), from, to };
  return { ...solution, intents: [...(solution.intents ?? []), intent] };
}

export function updateIntent(
  solution: Solution,
  id: string,
  field: "action" | "port",
  value: string | undefined,
): Solution {
  return {
    ...solution,
    intents: (solution.intents ?? []).map((intent) => {
      if (intent.id !== id) return intent;
      const { [field]: _old, ...rest } = intent;
      return value === undefined ? rest : { ...rest, [field]: value };
    }),
  };
}

export function removeIntents(solution: Solution, ids: readonly string[]): Solution {
  const removed = new Set(ids);
  return { ...solution, intents: (solution.intents ?? []).filter((i) => !removed.has(i.id)) };
}
