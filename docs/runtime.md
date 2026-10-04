# Runtime contract

The core interprets definitions from `machine_definitions`; local JSON files are seed/reference examples. A case is one event stream, identified globally by `caseId`, with a fixed machine/version pair.

## Definitions and events

Supported definitions have flat named states, a passive initial state, `on` and `decide` transitions, optional outcomes, final states, and at most one task per state. `decide` describes choices for decision-producing tasks; the interpreter does not call AI. Guards, executable actions, and nested states are unsupported. Shared validation lives in `shared/machine-validation.mjs`.

A trusted n8n caller starts a case with any legal initial event:

```json
{
  "caseId": "entry-001",
  "machine": "flow4gold-submission",
  "machineVersion": 1,
  "eventId": "entry-001-submitted",
  "type": "SUBMISSION_RECEIVED",
  "payload": {}
}
```

Later events can omit the machine pair; any supplied pair must match. The core derives state and sequence itself. It replays accepted history, validates the transition, then appends the event. Business payload validation belongs to adapters and tasks.

- An identical `eventId` retry is a no-op, including after later transitions. Different content or lineage at the same ID is rejected; JSON object key order is irrelevant.
- `causationId`, when supplied, references an existing event, possibly in another case. It cannot reference itself.
- `correlationId` groups related work and defaults to the case's correlation, then the cause's correlation, then `caseId`. Explicit values must agree with recorded lineage.

Inspection uses `{ "caseId": "entry-001", "operation": "inspect" }`. It returns derived state/outcome without writes or task execution; a missing case returns `not_found`. Replay checks sequence continuity, identities, legal transitions, and task-result linkage.

## Task contract

Task names must be nonempty, have no surrounding whitespace, and contain no `:`. The colon separates the triggering event ID from the task name in invocation IDs; reserving it prevents ambiguous combinations. Event IDs can still contain colons.

`task_bindings` maps `(machine, machineVersion, task)` to one n8n workflow ID. Surrounding whitespace is trimmed from the workflow ID before dispatch. A newly accepted transition can launch that task asynchronously:

```json
{
  "caseId": "case-001",
  "machine": "customer-refund",
  "machineVersion": 1,
  "state": "INVESTIGATING",
  "task": "diagnose",
  "taskInvocationId": "event-001:diagnose",
  "triggerEventId": "event-001",
  "correlationId": "case-001",
  "input": { "message": "Please check my payment" }
}
```

Only the invocation fields shown above reach the task; workflow selection and other dispatcher metadata remain inside the core.

`input` is the entering event's payload. Tasks may read history or domain tables for additional context. A callback to the core uses:

```json
{
  "caseId": "case-001",
  "eventId": "event-001:diagnose:result",
  "taskInvocationId": "event-001:diagnose",
  "causationId": "event-001",
  "correlationId": "case-001",
  "type": "NEED_MORE_INFO",
  "payload": { "question": "Which order?" }
}
```

Edges marked `taskResult: true` require the current invocation, expected result ID, and causation link. Stale callbacks after state re-entry are rejected. A supplied invocation ID is checked even on an unmarked edge. These identifiers ensure consistency; callers still need to be trusted.

`dispatch.status: "started"` reports launch, not completion. Missing or ambiguous bindings return `unavailable` after the event has been stored. The append is not rolled back. Replay, duplicates, rejected events, and inspection never dispatch tasks.

## Versioning and limits

Save new definitions through the machine editor/API. Existing identities are immutable: identical content is a no-op; different content at the same identity conflicts. The catalog's `isDefault` flag only selects the editor's starting document. Saving a definition does not deploy tasks or change existing cases.

The local API exposes `GET /api/machines` and `POST /api/machines` with `{ "definition": { ... } }`. Saves return 201 for a new version, 200 for identical content, or 409 for a conflicting identity.

Submit events sequentially. Data Tables provide neither atomic compare-and-append nor application event-ID uniqueness constraints. A crash between append and dispatch can leave work unstarted; automatic recovery is not implemented. Stable result IDs deduplicate events, not external effects. See [table schemas](../data-tables/README.md).
