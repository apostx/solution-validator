import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MarkerType,
  type NodeChange,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { type DragEvent, useMemo, useRef, useState } from "react";
import type { Intent, Registry, Solution } from "solution-validator";
import type { Evaluation } from "../evaluation";
import {
  addComponent,
  addIntent,
  moveComponent,
  type Position,
  positionOf,
  removeComponents,
  removeIntents,
  type Selection,
} from "../model";
import { ComponentNode, type ComponentNodeType } from "./ComponentNode";
import { DRAG_FORMAT } from "./Palette";

const nodeTypes = { component: ComponentNode };

interface CanvasProps {
  solution: Solution;
  registry: Registry;
  evaluation: Evaluation;
  selection: Selection;
  onSelect(selection: Selection): void;
  onChange(solution: Solution): void;
  /** Extra class names for an intent's arrow, for example by verdict. */
  intentClassName?(intent: Intent): string | undefined;
}

export function Canvas({
  solution,
  registry,
  evaluation,
  selection,
  onSelect,
  onChange,
  intentClassName,
}: CanvasProps) {
  const flow = useReactFlow();
  const [dragging, setDragging] = useState<Record<string, Position>>({});
  // React Flow measures nodes and reports their size; controlled nodes must carry it.
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  // The first component with an id is drawn; duplicates are reported as findings.
  const components = useMemo(() => {
    const seen = new Set<string>();
    return solution.components.filter((component) => {
      if (seen.has(component.id)) return false;
      seen.add(component.id);
      return true;
    });
  }, [solution.components]);

  const nodes = useMemo<ComponentNodeType[]>(
    () =>
      components.map((component, index) => {
        const type = registry.getType(component.type);
        return {
          id: component.id,
          type: "component",
          position: dragging[component.id] ?? positionOf(component, index),
          ...(measured[component.id] ? { measured: measured[component.id] } : {}),
          selected: selection?.kind === "component" && selection.id === component.id,
          data: {
            id: component.id,
            label: component.label ?? component.id,
            typeLabel: type?.label ?? component.type,
            category: type?.category ?? "unknown",
            severity: evaluation.severityBySubject.get(component.id),
          },
        };
      }),
    [components, dragging, measured, registry, selection, evaluation],
  );

  const edges = useMemo<Edge[]>(() => {
    const ids = new Set(components.map((component) => component.id));
    const seen = new Set<string>();
    return (solution.intents ?? [])
      .filter((intent) => {
        const drawable = ids.has(intent.from) && ids.has(intent.to) && !seen.has(intent.id);
        seen.add(intent.id);
        return drawable;
      })
      .map((intent) => {
        const severity = evaluation.severityBySubject.get(intent.id);
        const classes = [severity ? `intent-${severity}` : "", intentClassName?.(intent) ?? ""];
        const purpose = [intent.action, intent.port].filter((part) => part !== undefined);
        return {
          id: intent.id,
          source: intent.from,
          target: intent.to,
          label: purpose.length > 0 ? purpose.join(" · ") : "?",
          markerEnd: { type: MarkerType.ArrowClosed },
          className: classes.join(" ").trim(),
          selected: selection?.kind === "intent" && selection.id === intent.id,
        };
      });
  }, [components, solution.intents, evaluation, selection, intentClassName]);

  function onNodesChange(changes: NodeChange<ComponentNodeType>[]) {
    let next = solution;
    const removed: string[] = [];
    const overrides = { ...draggingRef.current };
    for (const change of changes) {
      if (change.type === "position") {
        if (change.position) overrides[change.id] = change.position;
        if (change.dragging === false) {
          const position = overrides[change.id];
          if (position) next = moveComponent(next, change.id, position);
          delete overrides[change.id];
        }
      } else if (change.type === "dimensions" && change.dimensions) {
        const { width, height } = change.dimensions;
        setMeasured((current) => ({ ...current, [change.id]: { width, height } }));
      } else if (change.type === "select" && change.selected) {
        onSelect({ kind: "component", id: change.id });
      } else if (change.type === "remove") {
        removed.push(change.id);
      }
    }
    setDragging(overrides);
    if (removed.length > 0) next = removeComponents(next, removed);
    if (next !== solution) onChange(next);
  }

  function onEdgesChange(changes: EdgeChange[]) {
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
    const next = addComponent(solution, type, { x: position.x - 80, y: position.y - 30 });
    const created = next.components.at(-1);
    onChange(next);
    if (created) onSelect({ kind: "component", id: created.id });
  }

  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => onSelect(null)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={onDrop}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: false }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
