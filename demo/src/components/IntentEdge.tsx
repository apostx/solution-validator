import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import type { Verdict } from "solution-validator";

export type IntentEdgeData = {
  purpose: string;
  verdict?: Verdict | undefined;
  /** Finding messages about the intent, shown on the arrow. */
  messages: string[];
};

export type IntentEdgeType = Edge<IntentEdgeData, "intent">;

const MARK: Record<Verdict, string> = { pass: "✓", fail: "✕", undecidable: "?" };

/** An intent arrow, colored by verdict, with its findings on the label. */
export function IntentEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps<IntentEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const verdict = data?.verdict;
  const messages = data?.messages ?? [];
  const classes = ["intent-label"];
  if (verdict) classes.push(`verdict-${verdict}`);
  if (selected) classes.push("selected");
  return (
    <>
      <BaseEdge id={id} path={path} {...(markerEnd ? { markerEnd } : {})} />
      <EdgeLabelRenderer>
        <div
          className={classes.join(" ")}
          title={messages.join("\n") || undefined}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <span>
            {data?.purpose ?? "?"}
            {verdict && <span className="mark"> {MARK[verdict]}</span>}
          </span>
          {messages.length > 0 && (selected || verdict === "fail") && (
            <span className="intent-message">{messages[0]}</span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
