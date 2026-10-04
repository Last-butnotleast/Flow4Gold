# Generic runtime checkpoints

## Phase 1 — local contract and executable tests

This branch contains the breaking local redesign. It has **not been published to n8n** and the remote tables have **not been reset**. Do not publish individual redesigned workflows against the old catalog and bindings. The existing live deployment is the pre-reset demo.

The baseline source snapshot is Git tag `baseline-demo` (commit `5d2d9fa`). This is a source backup, not a backup of remote executions or Data Table rows. Parallel competition task development shares the current branch; runtime commits must explicitly stage only their owned files.

The local refund seed starts fresh at version 1 with the full approval/review lifecycle. Historical refund definitions, fixed-case runners, and compatibility behavior are removed. The existing Flow4Gold submission definition is the second comparison machine; its task workflows are developed separately and are not modified by this phase.

The supported runtime is deliberately small:

- Flat named states, a passive initial state, and at most one asynchronous task per entered state.
- Explicit events select `on` or `decide` edges; `decide` is metadata for decision-producing tasks, not an AI call by the interpreter.
- A new case supplies `machine` and `machineVersion`. Any legal initial transition can start it. Existing cases retain the recorded pair; an explicit conflicting pair is rejected.
- One event table contains many case streams, machines, and versions. `caseId` identifies one stream; its sequence starts at 1. A case never changes machine or version halfway through.
- `taskResult: true` on an edge requires a callback matching the current state's task invocation. Other supplied invocation metadata is also checked. Business payloads are opaque to the core.
- Bindings resolve `(machine, machineVersion, task)` to one n8n workflow ID.
- Replay, inspection, duplicate delivery and rejected events do not execute tasks.

A task-result link is a consistency check, not producer authentication. Callers of the internal core are trusted adapters. The customer gateway permits only customer input; refund tasks own proposal, review, and receipt validation.

## Phase 2 — coordinated fresh deployment

Before deployment, coordinate with the competition-task work so its unpublished changes are preserved. Stop old intake and pending task callbacks before resetting affected data; old form executions must not append into the fresh catalog. Replace old event history and machine catalog with fresh seeds; recreate or update bindings with the new scoped columns. Retain credentials and unrelated project data. The old source is available in Git; no runtime compatibility migration is intended.

Publish the coherent core, gateways, and task set. Prove fresh refund and Flow4Gold submission cases in the same n8n event table, including explicit version selection, read-only replay, duplicate delivery, and rejected illegal transitions. Do not submit human decisions on behalf of the user. This phase remains pending after the local checkpoint.

## Phase 3 — demo selection and inspection

Add machine-aware case creation and inspection to the frontend while preserving purpose-built customer and contestant interactions. Saving a graph is separate from making its adapters available. Packaging into one creator-portal workflow remains a separate submission step.

## Checks

```bash
npm test
npm run validate
npm run visualizer:test
npm run visualizer:build
```

Core tests execute the Code-node logic with an in-memory event-table stand-in. They prove interpreter behavior; they are not evidence of remote n8n execution, Data Table atomicity, Discord delivery, or Jev output. Continue submitting events sequentially for the PoC. Append and task dispatch remain separate operations without automatic crash recovery.
