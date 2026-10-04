# Event stream persistence

The event stream is authoritative. The core reads one case's accepted events, replays them in order to derive state and outcome, and appends one new accepted event. After an append, it can dispatch the entered state's task asynchronously. It neither reads nor updates a case projection.

## Event input

Submit one event per execution:

```json
{
  "caseId": "case-demo-001",
  "eventId": "event-demo-002",
  "type": "NEED_MORE_INFO",
  "payload": { "question": "Which order should be refunded?" },
  "causationId": "event-demo-001",
  "correlationId": "case-demo-001"
}
```

`caseId`, `eventId`, and `type` are required nonempty strings without surrounding whitespace. `payload` defaults to `{}`. The caller cannot supply state, sequence, or a machine definition. A case starts with `RECEIVED`, replayed from the machine's initial `OPEN` state.

`causationId` identifies the existing event that directly caused this event. It is optional for independent external input, must not reference itself, and may reference an event in another case. `correlationId` identifies the larger related chain. It defaults to the case's established correlation, otherwise the cause's correlation, otherwise `caseId`. Explicit values must agree with the existing stream and the cause when present. These IDs track relationships; they do not grant authority.

An identical retry returns `duplicate` without appending. Identity includes the case, event type, JSON payload, causation, correlation, and optional task invocation ID. Payload object key order is irrelevant. Conflicting reuse of an event ID is rejected.

## Authoritative table

Native n8n table: `case_event_stream`, ID `TjuB58skTvPRCwB3`.

| Column | Type | Meaning |
| --- | --- | --- |
| `eventId` | String | Application event identity |
| `caseId` | String | Case stream identity |
| `sequence` | Number | Contiguous order within this case, starting at 1 |
| `type` | String | Accepted domain event |
| `payload` | String | JSON-encoded event facts |
| `causationId` | String | Direct causing event, or empty for independent input |
| `correlationId` | String | Related chain across one or more cases |
| `machine` | String | Domain machine identity |
| `machineVersion` | Number | Pinned transition rules |
| `taskInvocationId` | String | Callback invocation identity; blank/null for independent events |

n8n adds its own `id`, `createdAt`, and `updatedAt`; `createdAt` is the append timestamp. Replay uses `sequence`, not timestamps or physical row order. The machine definition is loaded from the `machine_definitions` Data Table; this PoC supports `customer-refund` versions 1, 2 and 3. New streams use the single catalog default (currently version 3); existing streams use the version recorded by their first event, and mixed versions are rejected. Retain recorded definitions unchanged when adding future versions.

Task callbacks supply `taskInvocationId`; the core checks it against the task expected from the latest state-entry event. This check is repeated at the historical position during replay. Previously accepted duplicate callbacks remain no-ops after later transitions. Existing events without this optional metadata remain valid. See [the task contract](tasks.md).

Version-3 human-review callbacks additionally require the current review event ID and a nonempty message. A reviewer-approved event carries the explicit proposal; a question waits for a customer reply before diagnosis runs again. See [human review](human-review.md).

There are no stored `fromState`, `toState`, or `outcome` columns: deterministic replay derives them. The runtime only inserts accepted events. Rejected requests are not part of this domain event stream. This is an application append-only convention, not a database permission preventing manual edits.

## Read-only replay

```json
{ "caseId": "case-demo-001", "operation": "inspect" }
```

Inspection reads and replays the stream without appending anything. An absent stream is `not_found`; it is not reported as a saved `OPEN` case. Replay verifies ordering, machine version, event identities and legal transitions, and stops on an inconsistent stream. Closing events derive `REFUNDED` or `REJECTED` from the pinned machine.

Causation existence is checked when appending. Inspection checks local ordering of causes but does not recursively load every other case to revalidate historical cross-case references.

Replay never dispatches tasks, sends messages, invokes AI, or repeats refunds. A future case projection will be disposable: it can be rebuilt from the stream without recovering agent memory.

## Limits

Submit events sequentially. Each accepted event requires one append. This does not add database uniqueness constraints, an atomic expected-sequence check, or protection against simultaneous appends. Those remain necessary before concurrent operation; PostgreSQL can provide them later without changing the domain events.

If the append succeeds but the response is lost, retry with the same event ID and content; the recorded event is recognized as a duplicate. Do not generate a new event ID for a delivery retry.

The entry point is for manually controlled simulation. Version-2 human decisions are bound to the exact proposal and task invocation. Named-user authentication, reliable task recovery, and real refund actions remain outside this breakpoint. Correlation and causation metadata do not solve those concerns.

## Verification

Local tests execute the generated Code-node bodies and check routing. They cover both machine versions, replay, all state transitions, outcomes, event identity, lineage, stale task results, and proposal-bound approve/reject decisions.

The live demo's authenticated n8n gateway accepts only customer intake, customer replies and read-only inspection. Its local server keeps API keys and the gateway token out of the browser. See [the live demo guide](live-demo.md).

New customer cases exercise Jev diagnosis before any approval notification. The earlier fixed-proposal harness is retained inactive as test history; its obsolete local runner has been retired. The recorded approval checks in [Discord approval](approval.md) remain valid: a signed review URL was required, opening the form did not decide, and duplicates did not resend notifications.
