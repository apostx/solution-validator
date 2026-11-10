import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import type { Severity } from "solution-validator";

export type ComponentNodeData = {
  label: string;
  id: string;
  typeLabel: string;
  category: string;
  severity?: Severity | undefined;
  /** Shown as a badge when the component is or may be accessible from the internet. */
  exposure?: "exposed" | "not-exposed" | "undecidable" | undefined;
};

export type ComponentNodeType = Node<ComponentNodeData, "component">;

export function ComponentNode({ data, selected }: NodeProps<ComponentNodeType>) {
  const classes = ["component-node", `category-${data.category}`];
  if (data.severity) classes.push(`has-${data.severity}`);
  if (selected) classes.push("selected");
  return (
    <div className={classes.join(" ")}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">
        {data.label}
        {data.exposure === "exposed" && (
          <span className="badge badge-exposed" title="Directly accessible from the internet">
            internet
          </span>
        )}
        {data.exposure === "undecidable" && (
          <span className="badge badge-undecidable" title="Exposure to the internet is undecidable">
            internet?
          </span>
        )}
      </div>
      <div className="node-type">{data.typeLabel}</div>
      {data.label !== data.id && <div className="node-id">{data.id}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
