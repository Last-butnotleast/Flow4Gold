# Asynchronous state tasks

See [deployment checkpoints](generic-runtime.md) before publishing the local redesign.

A machine names a task, such as `INVESTIGATING.tasks = ["diagnose"]`. `task_bindings` resolves `(machine, machineVersion, task)` to a workflow ID. Different machines and versions may reuse the same task name with different implementations. Definitions contain no n8n workflow IDs.

```text
Core: replay → validate → append → resolve binding → launch task → finish
Task: validate business input → perform work → send result event → finish
```

Both task launch and callback use `waitForSubWorkflow: false`. Only a newly accepted event can dispatch work. One task per entered state is supported; the initial state is passive.

## Invocation and callback

```json
{
  "caseId": "case-001",
  "task": "diagnose",
  "taskInvocationId": "event-001:diagnose",
  "triggerEventId": "event-001",
  "correlationId": "case-001",
  "state": "INVESTIGATING",
  "machine": "customer-refund",
  "machineVersion": 1,
  "input": { "message": "Please check my payment" }
}
```

`input` is the entering event's payload. Tasks can load recorded case events and their domain tables for additional context. A result callback has this envelope:

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

Mark edges produced by a task with `"taskResult": true`. The core then requires the expected invocation ID, result event ID, and causation link for the current state-entry event. An old callback after state re-entry is rejected. Duplicate accepted callbacks remain no-ops. A supplied invocation ID is checked even on an unmarked edge.

The core does not know refund amounts, proposal IDs, review messages, contest eligibility, or receipt structure. Tasks and domain-specific ingress adapters validate those facts. Identifiers are not secrets or authentication; arbitrary clients cannot be given unrestricted access to the core.

## Dispatch and failures

`dispatch.status: "started"` means the subworkflow was launched without waiting, not that it completed. Inspect the case for its later state. Missing or ambiguous bindings return `dispatch.status: "unavailable"` after the accepted event has been stored. The event is not rolled back.

No automatic task recovery is implemented. A crash between append and dispatch can leave work unstarted; replay does not cause side effects. Stable callback IDs prevent duplicate result events, not duplicate external effects. Payments remain simulated.
