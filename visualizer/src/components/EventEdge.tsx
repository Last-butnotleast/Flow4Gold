import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { ArrowRight, Diamond } from "lucide-react";
import type { EventFlowEdge } from "../graph";

type Point = { x: number; y: number };

function roundedPath(points: Point[]) {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const before = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const after = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (!before || !after) continue;
    const radius = Math.min(12, before / 2, after / 2);
    const entry = {
      x: corner.x + ((previous.x - corner.x) * radius) / before,
      y: corner.y + ((previous.y - corner.y) * radius) / before,
    };
    const exit = {
      x: corner.x + ((next.x - corner.x) * radius) / after,
      y: corner.y + ((next.y - corner.y) * radius) / after,
    };
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

export const EventEdge = memo(function EventEdge(
  props: EdgeProps<EventFlowEdge>,
) {
  const { id, data, markerEnd, style, selected } = props;
  const [fallbackPath, fallbackX, fallbackY] = getSmoothStepPath(props);
  const points = data?.points;
  const path = points && points.length > 1 ? roundedPath(points) : fallbackPath;
  const position = data?.labelPosition ?? { x: fallbackX, y: fallbackY };
  const isDecision = data?.kind === "decide";
  const Icon = isDecision ? Diamond : ArrowRight;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={20}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`event-label nodrag nopan ${isDecision ? "is-decision" : "is-event"}${selected ? " is-selected" : ""}${data?.dimmed ? " is-muted" : ""}`}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px)`,
            pointerEvents: "all",
          }}
          onClick={(event) => {
            event.stopPropagation();
            data?.onSelect?.();
          }}
          title={data?.event}
          aria-label={`Inspect transition ${data?.event ?? ""}`}
        >
          <Icon size={11} aria-hidden="true" />
          <span>{data?.event}</span>
        </button>
      </EdgeLabelRenderer>
    </>
  );
});
