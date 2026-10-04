# Generic runtime checkpoints

## Phase 1 — local contract and executable tests

The generic runtime is now deployed to n8n with fresh application tables. Phase 1 established the local contract; phase 2 completed the coordinated reset and live verification on 4 October 2026. The competition visualizer is now connected through the local API and authenticated competition gateway.

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

Completed on 4 October 2026:

- Stopped the seven old runtime/refund/gateway workflows and five pending approval executions before changing tables.
- Cleared old case events, definitions and bindings while preserving table IDs, credentials and all three sample orders.
- Seeded fresh refund v1, submission v1 and a submission v2 comparison definition. V1 enters REGISTERED; v2 enters WAITING_FOR_PUBLICATION on its first event.
- Added machine/version columns to task bindings and seeded five refund v1 bindings.
- Published core, refund tasks, customer gateway, and the new private competition gateway. Activated the existing registration, contestant and organizer adapters so n8n can call them.
- Fixed the organizer adapter's request-ID causation bug: independent organizer actions omit causation rather than refer to an event that does not exist.
- Removed the obsolete fixed-case test workflows. A temporary authenticated test driver was removed after verification.

The competition gateway calls the existing business adapters and sends their proposed events to the same core sequentially. Its actual persistence result is separate from notification/PIN/effect previews. It is an internal Execute Workflow entry point, not a browser endpoint. See [gateway contract](competition-gateway.md).

Seven live checks passed: registration, identical retry without writes, contestant publication linking, illegal-event rejection without writes, organizer closure, simultaneous pinned versions, and real asynchronous refund diagnosis. The three final fixtures share the same event table; their details are recorded in [the live proof](generic-runtime-proof.json). Refund stopped at WAITING_CUSTOMER after Jev requested information; no human decision was submitted and no payment moved. Abandoned test fixtures were removed.

## Phase 3 — connected competition frontend

The contestant and organizer screens now load entries from n8n, register new entries and submit actions through the same generic runtime. Browser seeds, fake PINs and local state transitions are removed. The live browser check covered registration, publication linking, a question/reply loop, invitation and acceptance, check-in, winner decision and prize acceptance; reload preserved the recorded state. The temporary verification entry was removed afterward. See [frontend contract](competition-frontend.md).

Saving a graph remains separate from making its business adapters available. Packaging into one creator-portal workflow is the next submission step; external email delivery is still not connected.

## Checks

```bash
npm test
npm run validate
npm run visualizer:test
npm run visualizer:build
```

Core tests execute the Code-node logic with an in-memory event-table stand-in. They prove interpreter behavior; they are not evidence of remote n8n execution, Data Table atomicity, Discord delivery, or Jev output. Continue submitting events sequentially for the PoC. Append and task dispatch remain separate operations without automatic crash recovery.
