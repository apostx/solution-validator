import {
  Background,
  type Connection,
  Controls,
  type EdgeChange,
  MarkerType,
  type NodeChange,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { type DragEvent, useMemo, useRef, useState } from "react";
import type { Component, Registry, Solution } from "solution-validator";
import { attachmentsOf } from "../attachments";
import type { Evaluation } from "../evaluation";
import {
  addComponent,
  addIntent,
  moveComponent,
  type Position,
  positionOf,
  removeComponents,
  removeIntents,
  resizeComponent,
  type Selection,
  type Size,
  setPlacement,
  sizeOf,
} from "../model";
import { ComponentNode, type ComponentNodeType } from "./ComponentNode";
import { IntentEdge, type IntentEdgeType } from "./IntentEdge";
import { DRAG_FORMAT } from "./Palette";
import { ZoneNode, type ZoneNodeType } from "./ZoneNode";

const nodeTypes = { component: ComponentNode, zone: ZoneNode };
const edgeTypes = { intent: IntentEdge };
const COMPONENT_SIZE: Size = { width: 170, height: 64 };

type CanvasNode = ComponentNodeType | ZoneNodeType;

/** The zone's address space: a fixed value of its type, or the property it is bound to. */
function addressSpaceOf(registry: Registry, component: Component): string | undefined {
  const parameter = registry.getType(component.type)?.traits.zone?.addressSpace;
  if (typeof parameter === "string") return parameter;
  const value = parameter ? component.properties?.[parameter.property] : undefined;
  return typeof value === "string" ? value : undefined;
}

interface CanvasProps {
  solution: Solution;
  registry: Registry;
  evaluation: Evaluation;
  selection: Selection;
  onSelect(selection: Selection): void;
  onChange(solution: Solution): void;
  /** Components the task provides and locks; they cannot be deleted. */
  lockedIds?: readonly string[];
}

export function Canvas({
  solution,
  registry,
  evaluation,
  selection,
  onSelect,
  onChange,
  lockedIds = [],
}: CanvasProps) {
  const flow = useReactFlow();
  const [dragging, setDragging] = useState<Record<string, Position>>({});
  const [resizing, setResizing] = useState<Record<string, Size>>({});
  // React Flow measures nodes and reports their size; controlled nodes must carry it.
  const [measured, setMeasured] = useState<Record<string, Size>>({});
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const resizingRef = useRef(resizing);
  resizingRef.current = resizing;

  // The first component with an id is drawn; duplicates are reported as findings.
  const components = useMemo(() => {
    const seen = new Set<string>();
    return solution.components.filter((component) => {
      if (seen.has(component.id)) return false;
      seen.add(component.id);
      return true;
    });
  }, [solution.components]);

  const layout = useMemo(() => {
    const byId = new Map(components.map((component) => [component.id, component]));
    const isZone = (component: Component | undefined) =>
      component !== undefined && registry.getType(component.type)?.traits.zone !== undefined;
    const parentOf = (component: Component) =>
      (component.placement ?? []).find((id) => isZone(byId.get(id)));
    // Zones a component is in, innermost first.
    const ancestors = (component: Component): string[] => {
      const chain: string[] = [];
      let parent = parentOf(component);
      while (parent !== undefined && !chain.includes(parent)) {
        chain.push(parent);
        const next = byId.get(parent);
        parent = next ? parentOf(next) : undefined;
      }
      return chain;
    };
    const positions = new Map(
      components.map((component, index) => [component.id, positionOf(component, index)]),
    );
    return { byId, isZone, ancestors, positions };
  }, [components, registry]);

  const attachments = useMemo(() => attachmentsOf(solution, registry), [solution, registry]);

  const nodes = useMemo<CanvasNode[]>(() => {
    const zones = components
      .filter((component) => layout.isZone(component))
      .map((component): ZoneNodeType => {
        const size = resizing[component.id] ?? sizeOf(component);
        const type = registry.getType(component.type);
        return {
          id: component.id,
          type: "zone",
          position: dragging[component.id] ?? (layout.positions.get(component.id) as Position),
          width: size.width,
          height: size.height,
          zIndex: layout.ancestors(component).length,
          selected: selection?.kind === "component" && selection.id === component.id,
          deletable: !lockedIds.includes(component.id),
          data: {
            id: component.id,
            label: component.label ?? component.id,
            typeLabel: type?.label ?? component.type,
            severity: evaluation.severityBySubject.get(component.id),
            attachments: attachments.get(component.id) ?? [],
            addressSpace: addressSpaceOf(registry, component),
          },
        };
      })
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    const others = components
      .filter((component) => !layout.isZone(component))
      .map((component): ComponentNodeType => {
        const type = registry.getType(component.type);
        return {
          id: component.id,
          type: "component",
          position: dragging[component.id] ?? (layout.positions.get(component.id) as Position),
          ...(measured[component.id] ? { measured: measured[component.id] } : {}),
          zIndex: 1000,
          selected: selection?.kind === "component" && selection.id === component.id,
          deletable: !lockedIds.includes(component.id),
          data: {
            id: component.id,
            label: component.label ?? component.id,
            typeLabel: type?.label ?? component.type,
            category: type?.category ?? "unknown",
            severity: evaluation.severityBySubject.get(component.id),
            exposure: evaluation.exposure.get(component.id)?.exposure,
            attachments: attachments.get(component.id) ?? [],
          },
        };
      });
    return [...zones, ...others];
  }, [
    components,
    layout,
    dragging,
    resizing,
    measured,
    registry,
    selection,
    evaluation,
    lockedIds,
    attachments,
  ]);

  const edges = useMemo<IntentEdgeType[]>(() => {
    const ids = new Set(components.map((component) => component.id));
    const seen = new Set<string>();
    return (solution.intents ?? [])
      .filter((intent) => {
        const drawable = ids.has(intent.from) && ids.has(intent.to) && !seen.has(intent.id);
        seen.add(intent.id);
        return drawable;
      })
      .map((intent): IntentEdgeType => {
        const verdict = evaluation.intentVerdicts.get(intent.id)?.verdict;
        const purpose = [intent.action, intent.port].filter((part) => part !== undefined);
        const messages = evaluation.findings
          .filter((finding) => finding.subjects.includes(intent.id))
          .map((finding) => finding.message);
        return {
          id: intent.id,
          type: "intent",
          source: intent.from,
          target: intent.to,
          markerEnd: { type: MarkerType.ArrowClosed },
          className: verdict ? `verdict-${verdict}` : "",
          selected: selection?.kind === "intent" && selection.id === intent.id,
          zIndex: 1001,
          data: { purpose: purpose.length > 0 ? purpose.join(" · ") : "?", verdict, messages },
        };
      });
  }, [components, solution.intents, evaluation, selection]);

  /** Components placed, directly or indirectly, in a zone. */
  function descendants(zone: string): Component[] {
    return components.filter((component) => layout.ancestors(component).includes(zone));
  }

  /** The innermost zone that contains the node's center, after a move. */
  function zoneAt(next: Solution, id: string): string | undefined {
    const find = (key: string) => next.components.find((component) => component.id === key);
    const moved = find(id);
    if (!moved) return undefined;
    const size = layout.isZone(moved) ? sizeOf(moved) : (measured[id] ?? COMPONENT_SIZE);
    const index = next.components.indexOf(moved);
    const position = positionOf(moved, index);
    const center = { x: position.x + size.width / 2, y: position.y + size.height / 2 };
    const inside = new Set(descendants(id).map((component) => component.id));
    let best: { id: string; area: number } | undefined;
    next.components.forEach((zone, zoneIndex) => {
      if (zone.id === id || inside.has(zone.id) || !layout.isZone(zone)) return;
      const origin = positionOf(zone, zoneIndex);
      const box = sizeOf(zone);
      const contains =
        center.x >= origin.x &&
        center.x <= origin.x + box.width &&
        center.y >= origin.y &&
        center.y <= origin.y + box.height;
      const area = box.width * box.height;
      if (contains && (!best || area < best.area)) best = { id: zone.id, area };
    });
    return best?.id;
  }

  function place(next: Solution, id: string): Solution {
    const component = next.components.find((candidate) => candidate.id === id);
    if (!component) return next;
    const zone = zoneAt(next, id);
    const current = component.placement ?? [];
    const rest = current.slice(1).filter((placement) => placement !== zone);
    const placement = zone ? [zone, ...rest] : rest;
    const same =
      placement.length === current.length && placement.every((value, i) => value === current[i]);
    return same ? next : setPlacement(next, id, placement);
  }

  function onNodesChange(changes: NodeChange<CanvasNode>[]) {
    let next = solution;
    const removed: string[] = [];
    const overrides = { ...draggingRef.current };
    const sizes = { ...resizingRef.current };
    for (const change of changes) {
      if (change.type === "position") {
        const component = layout.byId.get(change.id);
        if (change.position && component) {
          overrides[change.id] = change.position;
          // Moving a zone moves what is placed in it.
          if (layout.isZone(component) && change.dragging) {
            const origin = layout.positions.get(change.id) as Position;
            const dx = change.position.x - origin.x;
            const dy = change.position.y - origin.y;
            for (const inner of descendants(change.id)) {
              const base = layout.positions.get(inner.id) as Position;
              overrides[inner.id] = { x: base.x + dx, y: base.y + dy };
            }
          }
        }
        if (change.dragging === false) {
          const moved = [change.id, ...descendants(change.id).map((inner) => inner.id)];
          for (const id of moved) {
            const position = overrides[id];
            if (position) next = moveComponent(next, id, position);
            delete overrides[id];
          }
          next = place(next, change.id);
        }
      } else if (change.type === "dimensions" && change.dimensions) {
        const { width, height } = change.dimensions;
        if (change.resizing !== undefined) {
          sizes[change.id] = { width, height };
          if (change.resizing === false) {
            next = resizeComponent(next, change.id, { width, height }, overrides[change.id]);
            delete sizes[change.id];
            delete overrides[change.id];
          }
        } else {
          setMeasured((current) => ({ ...current, [change.id]: { width, height } }));
        }
      } else if (change.type === "select" && change.selected) {
        onSelect({ kind: "component", id: change.id });
      } else if (change.type === "remove") {
        removed.push(change.id);
      }
    }
    setDragging(overrides);
    setResizing(sizes);
    if (removed.length > 0) next = removeComponents(next, removed);
    if (next !== solution) onChange(next);
  }

  function onEdgesChange(changes: EdgeChange<IntentEdgeType>[]) {
    const removed: string[] = [];
    for (const change of changes) {
      if (change.type === "select" && change.selected) onSelect({ kind: "intent", id: change.id });
      if (change.type === "remove") removed.push(change.id);
    }
    if (removed.length > 0) onChange(removeIntents(solution, removed));
  }

  function onConnect(connection: Connection) {
    const next = addIntent(solution, connection.source, connection.target);
    const created = next.intents?.at(-1);
    onChange(next);
    if (created) onSelect({ kind: "intent", id: created.id });
  }

  function onDrop(event: DragEvent) {
    const type = event.dataTransfer.getData(DRAG_FORMAT);
    if (!type) return;
    event.preventDefault();
    const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    let next = addComponent(solution, type, { x: position.x - 80, y: position.y - 30 });
    const created = next.components.at(-1);
    if (created) next = place(next, created.id);
    onChange(next);
    if (created) onSelect({ kind: "component", id: created.id });
  }

  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => onSelect(null)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={onDrop}
        elevateNodesOnSelect={false}
        elevateEdgesOnSelect={false}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: false }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
