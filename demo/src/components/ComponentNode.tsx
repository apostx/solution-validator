import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import type { AvailabilityFact, Severity } from "solution-validator";
import type { Attachment } from "../attachments";

export type ComponentNodeData = {
  label: string;
  id: string;
  typeLabel: string;
  /** Role tags the solver gave the component. */
  roles: readonly string[];
  category: string;
  severity?: Severity | undefined;
  /** Shown as a badge when the component is or may be accessible from the internet. */
  exposure?: "exposed" | "not-exposed" | "undecidable" | undefined;
  /** The failure domains the component spans, when it runs. */
  availability?: AvailabilityFact | undefined;
  /** Filters, routers and gateways attached to the component. */
  attachments: Attachment[];
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
        <AvailabilityBadge fact={data.availability} />
      </div>
      <div className="node-type">{data.typeLabel}</div>
      {data.roles.length > 0 && (
        <div className="node-roles">{data.roles.map((role) => `#${role}`).join(" ")}</div>
      )}
      {data.label !== data.id && <div className="node-id">{data.id}</div>}
      <AttachmentBadges attachments={data.attachments} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** How many failure domains the component spans, or that the provider manages it. */
function AvailabilityBadge({ fact }: { fact: AvailabilityFact | undefined }) {
  if (!fact) return null;
  const domains = fact.domains.join(", ");
  switch (fact.availability) {
    case "managed":
      return (
        <span
          className="badge badge-managed"
          title="The provider spreads it across failure domains"
        >
          managed
        </span>
      );
    case "redundant":
      return (
        <span className="badge badge-redundant" title={`Runs in ${domains}`}>
          {fact.domains.length} domains
        </span>
      );
    case "single":
      return (
        <span className="badge badge-single" title={`Runs only in ${domains}`}>
          1 domain
        </span>
      );
    default:
      return (
        <span className="badge badge-undecidable" title="Its failure domains are not known">
          domain?
        </span>
      );
  }
}

const ATTACHMENT_TITLES = {
  filter: "Traffic filter",
  router: "Router",
  gateway: "Gateway",
} as const;

/** Badges for the filters, routers and gateways attached to a component or zone. */
export function AttachmentBadges({ attachments }: { attachments: readonly Attachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="attachments">
      {attachments.map((attachment) => (
        <span
          key={`${attachment.kind}:${attachment.id}`}
          className={`badge badge-${attachment.kind}`}
          title={`${ATTACHMENT_TITLES[attachment.kind]} ${attachment.id}`}
        >
          {attachment.label}
        </span>
      ))}
    </div>
  );
}
