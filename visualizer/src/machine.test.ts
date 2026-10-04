import { describe, expect, it } from "vitest";
import refund from "../../machines/customer-refund.v1.json";
import { parseMachine } from "./machine";
import { layoutMachine, stateKind } from "./graph";

describe("machine parsing", () => {
  it("preserves unknown root, state, and transition metadata for JSON export", () => {
    const source = {
      machine: "extended",
      version: 1,
      initial: "A",
      owner: { team: "support" },
      states: {
        A: {
          color: "blue",
          on: { DONE: { target: "B", audit: { required: true } } },
        },
        B: { final: true, documentation: ["finished"] },
      },
    };
    expect(JSON.parse(JSON.stringify(parseMachine(source)))).toEqual(source);
  });
  it("preserves the example events, decision evidence, and outcomes", () => {
    const machine = parseMachine(refund);
    expect(
      machine.states.INVESTIGATING.decide?.REFUND_RECOMMENDED.description,
    ).toContain("evidence");
    expect(machine.states.VERIFYING.on?.REFUND_CONFIRMED.outcome).toBe(
      "REFUNDED",
    );
    expect(machine.states.EXECUTING.tasks).toEqual(["issue_refund"]);
  });

  it.each([
    [{ ...refund, initial: "MISSING" }, /Initial state/],
    [{ ...refund, version: "1" }, /version/],
    [
      { ...refund, states: { OPEN: { on: { GO: { target: "MISSING" } } } } },
      /unknown state/,
    ],
    [
      { ...refund, states: { OPEN: { on: { GO: "OPEN" } } } },
      /must be an object/,
    ],
    [{ ...refund, states: { OPEN: { final: "true" } } }, /boolean/],
    [{ ...refund, states: { OPEN: { tasks: [42] } } }, /tasks\[0\]/],
    [
      {
        ...refund,
        states: { OPEN: { on: { GO: { target: "OPEN", outcome: 3 } } } },
      },
      /outcome/,
    ],
  ])("rejects malformed definitions with useful errors", (input, message) => {
    expect(() => parseMachine(input)).toThrow(message);
  });

  it("uses declared fields rather than names to classify states", () => {
    expect(stateKind("WAITING_CUSTOMER", { tasks: ["work"] }, "OTHER")).toBe(
      "task",
    );
    expect(
      stateKind("EXECUTING", { on: { GO: { target: "OTHER" } } }, "OTHER"),
    ).toBe("waiting");
    expect(
      stateKind(
        "WORK",
        { tasks: ["work"], decide: { YES: { target: "OTHER" } } },
        "OTHER",
      ),
    ).toBe("decision");
  });
});

describe("graph layout", () => {
  it("keeps every example transition and routes both forward and return paths", async () => {
    const machine = parseMachine(refund);
    const graph = await layoutMachine(machine);
    const transitions = Object.values(machine.states).flatMap((state) => [
      ...Object.keys(state.on ?? {}),
      ...Object.keys(state.decide ?? {}),
    ]);
    expect(graph.nodes).toHaveLength(Object.keys(machine.states).length);
    expect(graph.edges.map((edge) => edge.data!.event).sort()).toEqual(
      transitions.sort(),
    );
    for (const edge of graph.edges) {
      expect(edge.data!.points!.length).toBeGreaterThanOrEqual(2);
      expect(Number.isFinite(edge.data!.labelPosition!.x)).toBe(true);
    }
  });

  it("preserves self-loops, parallel events, and disconnected states deterministically", async () => {
    const machine = parseMachine({
      machine: "cases",
      version: 1,
      initial: "A",
      states: {
        A: {
          on: {
            RETRY: { target: "A" },
            OK: { target: "B" },
            SKIP: { target: "B" },
          },
        },
        B: { final: true },
        ISOLATED: {},
      },
    });
    const first = await layoutMachine(machine);
    const second = await layoutMachine(machine);
    expect(first).toEqual(second);
    expect(first.nodes.map((node) => node.id)).toEqual(["A", "B", "ISOLATED"]);
    expect(first.edges).toHaveLength(3);
    expect(new Set(first.edges.map((edge) => edge.id)).size).toBe(3);
    expect(first.edges[0].data!.points!.length).toBeGreaterThan(2);
    expect(first.edges[1].data!.labelPosition).not.toEqual(
      first.edges[2].data!.labelPosition,
    );
  });
});
