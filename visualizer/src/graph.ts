import type { Edge, Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import type { Machine, MachineState } from "./machine";

export type StateKind =
  | "initial"
  | "final"
  | "decision"
  | "task"
  | "waiting"
  | "plain";
export type StateNodeData = {
  label: string;
  kind: StateKind;
  tasks: string[];
  initial: boolean;
  final: boolean;
};
export type StateFlowNode = Node<StateNodeData, "state">;
export type Point = { x: number; y: number };
export type EventEdgeData = {
  event: string;
  kind: "on" | "decide";
  description?: string;
  outcome?: string;
  points?: Point[];
  labelPosition?: Point;
  onSelect?: () => void;
  dimmed?: boolean;
};
export type EventFlowEdge = Edge<EventEdgeData, "event">;

export const NODE_WIDTH = 216;
export const NODE_HEIGHT = 80;

export function stateKind(
  id: string,
  state: MachineState,
  initial: string,
): StateKind {
  if (state.final) return "final";
  if (Object.keys(state.decide ?? {}).length) return "decision";
  if (state.tasks?.length) return "task";
  if (id === initial) return "initial";
  if (Object.keys(state.on ?? {}).length) return "waiting";
  return "plain";
}

const elk = new ELK();

export async function layoutMachine(
  machine: Machine,
): Promise<{ nodes: StateFlowNode[]; edges: EventFlowEdge[] }> {
  // Internal IDs keep arbitrary user state names from colliding with ELK port IDs.
  const stateIds = Object.keys(machine.states);
  const elkIds = new Map(stateIds.map((id, index) => [id, `state-${index}`]));
  const edges: EventFlowEdge[] = [];
  for (const [source, state] of Object.entries(machine.states)) {
    for (const kind of ["on", "decide"] as const) {
      for (const [event, transition] of Object.entries(state[kind] ?? {})) {
        edges.push({
          id: `edge-${edges.length}`,
          type: "event",
          source,
          target: transition.target,
          sourceHandle: "out",
          targetHandle: "in",
          ariaLabel: `${source} to ${transition.target}, ${kind === "decide" ? "decision" : "event"} ${event}${transition.outcome ? `, outcome ${transition.outcome}` : ""}`,
          data: {
            event,
            kind,
            description: transition.description,
            outcome: transition.outcome,
          },
        });
      }
    }
  }
  const graph: ElkNode = {
    id: "machine",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "1",
      "elk.padding": "[top=32,left=32,bottom=32,right=32]",
      "elk.spacing.nodeNode": "60",
      "elk.spacing.edgeNode": "24",
      "elk.spacing.edgeEdge": "18",
      "elk.spacing.componentComponent": "80",
      "elk.layered.spacing.nodeNodeBetweenLayers": "18",
      "elk.layered.spacing.edgeNodeBetweenLayers": "12",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "14",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: stateIds.map((id) => {
      const internalId = elkIds.get(id)!;
      return {
        id: internalId,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
        ports: [
          {
            id: `${internalId}-in`,
            x: NODE_WIDTH / 2,
            y: 0,
            width: 0,
            height: 0,
            layoutOptions: { "elk.port.side": "NORTH" },
          },
          {
            id: `${internalId}-out`,
            x: NODE_WIDTH / 2,
            y: NODE_HEIGHT,
            width: 0,
            height: 0,
            layoutOptions: { "elk.port.side": "SOUTH" },
          },
        ],
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [`${elkIds.get(edge.source)}-out`],
      targets: [`${elkIds.get(edge.target)}-in`],
      labels: [
        {
          text: edge.data!.event,
          width: Math.max(56, edge.data!.event.length * 7.5 + 30),
          height: 28,
          layoutOptions: { "elk.edgeLabels.placement": "CENTER" },
        },
      ],
    })),
  };
  const layout = await elk.layout(graph);
  const positions = new Map(layout.children?.map((child) => [child.id, child]));
  const nodes: StateFlowNode[] = stateIds.map((id) => {
    const state = machine.states[id];
    const position = positions.get(elkIds.get(id)!)!;
    return {
      id,
      type: "state",
      position: { x: position.x ?? 0, y: position.y ?? 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      draggable: false,
      ariaLabel: `${id}, ${stateKind(id, state, machine.initial)} state${id === machine.initial ? ", initial" : ""}${state.tasks?.length ? `, tasks ${state.tasks.join(", ")}` : ""}`,
      data: {
        label: id,
        kind: stateKind(id, state, machine.initial),
        tasks: state.tasks ?? [],
        initial: id === machine.initial,
        final: state.final === true,
      },
    };
  });
  const routed = new Map(layout.edges?.map((edge) => [edge.id, edge]));
  for (const edge of edges) {
    const route = routed.get(edge.id);
    const section = route?.sections?.[0];
    if (section)
      edge.data!.points = [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ];
    const label = route?.labels?.[0];
    if (label?.x !== undefined && label.y !== undefined) {
      edge.data!.labelPosition = {
        x: label.x + (label.width ?? 0) / 2,
        y: label.y + (label.height ?? 0) / 2,
      };
    }
  }
  return { nodes, edges };
}
