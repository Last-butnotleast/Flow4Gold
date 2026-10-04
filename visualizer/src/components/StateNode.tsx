import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Circle, CircleDot, Clock3, Cog, Diamond, Play } from "lucide-react";
import type { StateFlowNode } from "../graph";

const icons = {
  initial: Play,
  final: CircleDot,
  decision: Diamond,
  task: Cog,
  waiting: Clock3,
  plain: Circle,
};

function displayName(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const StateNode = memo(function StateNode({
  data,
  selected,
}: NodeProps<StateFlowNode>) {
  const Icon = icons[data.kind];
  const taskCount = data.tasks.length;

  return (
    <div
      className={`machine-node kind-${data.kind}${selected ? " is-selected" : ""}`}
      title={data.label}
    >
      <Handle
        id="in"
        type="target"
        position={Position.Top}
        isConnectable={false}
      />
      <span className="node-icon" aria-label={`${data.kind} state`}>
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <div className="node-copy">
        <span className="node-title">{displayName(data.label)}</span>
      </div>
      {taskCount > 0 && (
        <span
          className="node-task-count"
          title={`${taskCount} task${taskCount === 1 ? "" : "s"}`}
          aria-label={`${taskCount} task${taskCount === 1 ? "" : "s"}`}
        >
          <Cog size={12} aria-hidden="true" />
          {taskCount}
        </span>
      )}
      <Handle
        id="out"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
      />
    </div>
  );
});
