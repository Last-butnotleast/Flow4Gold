# Event stream persistence

See [deployment checkpoints](generic-runtime.md) for the deployed generic runtime and completed fresh-data reset.

One `case_event_stream` table stores events for every machine and version. A case selects an immutable definition when it starts:

```json
{
  "caseId": "entry-001",
  "machine": "flow4gold-submission",
  "machineVersion": 1,
  "eventId": "entry-001-submitted",
  "type": "SUBMISSION_RECEIVED",
  "payload": { "registrationReference": "demo-registration" }
}
```

The first event must be enabled in the selected definition's initial state. Subsequent events may omit the machine pair; if supplied it must match the first event. The caller never supplies current state or sequence. Definitions cannot be changed after recording events.

The core reads accepted events for the case, replays them in sequence, and appends one new event only if valid. There is no authoritative case snapshot. Every accepted row records `eventId`, `caseId`, `sequence`, `type`, JSON-string `payload`, `causationId`, `correlationId`, `machine`, `machineVersion`, and `taskInvocationId`. n8n adds row IDs and timestamps; replay uses application sequence numbers, not physical row order.

`eventId` deduplicates delivery. An identical retry is a no-op even after subsequent transitions; reusing an ID with different content or lineage is rejected. JSON object key order does not change identity. `caseId` identifies one stream globally, not one stream per machine: use distinct case IDs for distinct runs.

`causationId` references an existing event, including one in another case, and cannot refer to itself. `correlationId` groups a related chain: it defaults to the established case correlation, then the cause's correlation, then the case ID. Explicit values must agree with the case and cause. These links are not authorization.

```json
{ "caseId": "entry-001", "operation": "inspect" }
```

Inspection derives state and outcome without writing or dispatching. A missing case returns `not_found`. Replay checks contiguous sequence, event identities, pinned machine identity, legal transitions and [task-result links](tasks.md). Business payload validation belongs to task/ingress adapters, not replay. Historical cross-case causes are not recursively reloaded.

Data Tables do not provide an atomic compare-and-append or application event-ID uniqueness constraint. Submit sequentially. Append and task dispatch are separate; if a task fails to launch after append, replay does not retry it automatically. These remain accepted PoC limits.
