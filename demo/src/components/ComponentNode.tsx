import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import type { Severity } from "solution-validator";

export type ComponentNodeData = {
  label: string;
  id: string;
  typeLabel: string;
  category: string;
  severity?: Severity | undefined;
};

export type ComponentNodeType = Node<ComponentNodeData, "component">;

export function ComponentNode({ data, selected }: NodeProps<ComponentNodeType>) {
  const classes = ["component-node", `category-${data.category}`];
  if (data.severity) classes.push(`has-${data.severity}`);
  if (selected) classes.push("selected");
  return (
    <div className={classes.join(" ")}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">{data.label}</div>
      <div className="node-type">{data.typeLabel}</div>
      {data.label !== data.id && <div className="node-id">{data.id}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
