import { type Node, type NodeProps, NodeResizer } from "@xyflow/react";
import type { Severity } from "solution-validator";
import type { Attachment } from "../attachments";
import { AttachmentBadges } from "./ComponentNode";

export type ZoneNodeData = {
  label: string;
  id: string;
  typeLabel: string;
  severity?: Severity | undefined;
  attachments: Attachment[];
};

export type ZoneNodeType = Node<ZoneNodeData, "zone">;

/** A zone drawn as an area; components dropped inside it are placed in it. */
export function ZoneNode({ data, selected }: NodeProps<ZoneNodeType>) {
  const classes = ["zone-node"];
  if (data.severity) classes.push(`has-${data.severity}`);
  if (selected) classes.push("selected");
  return (
    <div className={classes.join(" ")}>
      <NodeResizer isVisible={selected} minWidth={180} minHeight={120} />
      <div className="zone-title">
        <strong>{data.label}</strong> <span className="node-type">{data.typeLabel}</span>
      </div>
      <AttachmentBadges attachments={data.attachments} />
    </div>
  );
}
