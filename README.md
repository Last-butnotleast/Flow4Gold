# Flow4Gold

Domain state machines running in n8n: the machine owns the process, tasks perform business work, and AI makes bounded decisions. See [the project brief](PROJECT_BRIEF.md).

**Current checkpoint:** the generic runtime is deployed with fresh tables. Live checks prove refund and Flow4Gold submission cases, including two submission versions, in one event table. [Phase plan and evidence](docs/generic-runtime.md). Visualizer work continues separately.

## Runtime

Definitions are loaded from `machine_definitions`. Each new case explicitly selects a machine and version; every event records that pair. One `case_event_stream` table holds all cases. Replay derives state without repeating work. New transitions can launch a task asynchronously through a `(machine, machineVersion, task)` binding.

```json
{
  "caseId": "submission-demo-001",
  "machine": "flow4gold-submission",
  "machineVersion": 1,
  "eventId": "submission-demo-001-received",
  "type": "SUBMISSION_RECEIVED",
  "payload": {}
}
```

An identical retry is a no-op. An illegal transition or conflicting event identity is rejected. Inspect without writing:

```json
{ "caseId": "submission-demo-001", "operation": "inspect" }
```

The core has no public webhook; trusted n8n adapters call it. Business validation belongs to those adapters/tasks. See [persistence](docs/persistence.md), [task contracts](docs/tasks.md), and [table schemas](data-tables/README.md). Events are submitted sequentially; Data Tables do not provide atomic compare-and-append. There is no automatic task dispatch recovery.

## Demo machines

- [Customer refund](machines/customer-refund.v1.json): real Jev diagnosis, Discord approval/review, simulated refund and verification. The local seed starts fresh at v1; historical compatibility versions are removed.
- [Flow4Gold submission](machines/flow4gold-submission.v1.json): contestant/organizer lifecycle, starting with `SUBMISSION_RECEIVED`. This is the second runtime comparison model. The [private competition gateway](docs/competition-gateway.md) calls the completed competition adapters and persists their events; email and other effects remain previews. A v2 comparison definition demonstrates a different initial transition.

Other JSON files are graph examples. A valid graph does not supply its business adapters automatically. Once a definition has recorded events, save a new version rather than modify it.

## Frontend

```bash
npm ci
npm ci --prefix visualizer
npm run demo
```

Open http://localhost:5173/. The three screens are **Demo workspace**, **Sample orders**, and **Machine explorer**. The explorer imports/edits JSON with live validation and saves immutable definitions to n8n. Saving a definition does not activate tasks or change existing cases. The payment chat remains a refund-specific interface; generic case selection is a later checkpoint.

If Vite is already running, use `npm run demo:api` for the bridge only. Credentials stay in the local environment, never in the browser. See [live demo](docs/live-demo.md), [editor](docs/machine-editor.md), and [frontend guide](visualizer/README.md).

## Build and check

```bash
npm run build
npm test
npm run validate
npm run visualizer:test
npm run visualizer:build
npm run diagram -- machines/customer-refund.v1.json docs/customer-refund.mmd
```

Builds bundle interpreter and task code, not machine JSON. Core and diagnosis read definitions through native Data Table nodes.

The core canvas keeps its aligned positions in `runtime/core-layout.json`. After intentionally changing its layout in n8n, pull the workflow and run `npm run core:layout` before rebuilding. `npm run format:core` formats core sources and every generated Code node; `npm run format:core:check` verifies formatting and generated content. Use `npm run build` after shared-validator edits to refresh dependent task bundles. Review stage-note placement after a new alignment. With the pinned n8n-as-code 2.7 toolchain, use sticky-note sections: workflow-level Canvas Group metadata does not survive its TypeScript roundtrip.

## n8n workspace

Use the pinned CLI with `npm run n8n -- ...`. Folder sync maps `workflows/flow4gold/` and its `tasks/` subfolders to n8n. Read [AGENTS.md](AGENTS.md) before workflow edits. Pull before editing a remote workflow; validate before pushing. On n8n 2.x, pushing an already published workflow may publish it: `--draft` preserves the existing production version.

```bash
npm run n8n -- env status --json
npm run n8n -- pull <workflow-id>
npm run n8n -- push <workflow-file> --verify
```

The environment uses native MCP level 1 for schema sync. The Projects API probe may report `invalid-api-key` when that endpoint is unavailable even though workflow/table operations work. Do not replace credentials solely on that diagnostic.

Secrets, dependency directories, local sync state and build artifacts are excluded from Git. The baseline source snapshot is tagged `baseline-demo`; it does not back up remote tables. Keep one shared branch while parallel task work is underway and stage only owned files.
