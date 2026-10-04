# Asynchronous state tasks

The immutable machine names tasks, for example `INVESTIGATING.tasks = ["diagnose"]`. Deployment table `task_bindings` maps `diagnose` to n8n workflow `wkjUfwKoHZDmTAXW`. No workflow IDs are added to the machine definition. This breakpoint supports one task per entered state.

```text
Core: replay → validate → append event → look up task binding → start task → finish
Task: perform work → call Core with result event → finish
```

Both Execute Sub-workflow nodes use `waitForSubWorkflow: false`. Only newly accepted events dispatch work. Inspection, replay, duplicates, and rejected requests do not look up or start tasks.

## Invocation

The core derives a stable invocation from the event that entered the task-bearing state:

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
  "input": {}
}
```

`input` is the triggering event's payload, not a rebuilt general-purpose case context. The dispatch node also carries workflow-binding metadata; task business logic only needs the contract above.

Diagnosis validates the invocation, reads the recorded customer messages and replies, and calls Jev with the allowed investigation choices. Payment fields come from the `demo_orders` Data Table and are captured in the proposal event. For example, a recommendation calls the core with the following business fields (the current adapter additionally records decision/evidence metadata):

```json
{
  "caseId": "case-001",
  "eventId": "event-001:diagnose:result",
  "taskInvocationId": "event-001:diagnose",
  "causationId": "event-001",
  "correlationId": "case-001",
  "type": "REFUND_RECOMMENDED",
  "payload": {
    "amount": 25,
    "currency": "EUR",
    "paymentReference": "demo-payment-1042",
    "reason": "Duplicate charge confirmed in sample payment records"
  }
}
```

The core accepts this callback only when its invocation matches the task expected from the current state-entry event. An old callback after state re-entry is rejected even when its event type would otherwise be legal. Result IDs are stable so the same accepted callback can be delivered again without another append or task launch. Invocation metadata is stored in its own event column, separate from the business payload; it is not authentication.

For version 1, the callback enters taskless `AWAITING_APPROVAL` and stops. For versions 2 and 3, that state dispatches `request_approval`, which posts a signed review link to Discord and waits for an explicit form response. See [the approval task](approval.md). `issue_refund` now resolves the exact approved proposal and creates a deterministic simulated receipt. `verify_refund` checks the stored receipt against that proposal before confirming the simulated refund. See [the completed example](end-to-end.md). Version 3 also dispatches `human_review` from `HUMAN_REVIEW`, with approve/reject/customer-question outcomes described in [human review](human-review.md).

## Result and failure semantics

The initial core result reports the state after the submitted event (`INVESTIGATING`) and `dispatch.status: "started"`. That means the subworkflow invocation returned without waiting; it does not mean diagnosis or its callback has completed. Use inspection to obtain the current state afterward.

A missing or ambiguous binding returns an applied transition with `dispatch.status: "unavailable"` and a reason. The event is already stored. Subworkflow launch or execution failures are visible in n8n executions; no automatic recovery is implemented.

Append and dispatch are separate operations. A crash after append but before dispatch can leave an unstarted task. Replaying or retrying the accepted event will not restart it. Stable result IDs prevent duplicate result events, not duplicate task side effects. Recovery and side-effect idempotency remain prerequisites for real payments.

Continue to submit independent events sequentially. The asynchronous callback is submitted after its triggering event is appended, but this does not introduce protection against unrelated concurrent writes.

## Earlier deterministic verification

Case: `async-diagnose-check-68d3528f-1dce-4f23-a09e-12757ec9e675`.

- Initial `RECEIVED`: sequence 1, `INVESTIGATING`, dispatch started.
- Diagnosis execution `1699`: deterministic proposal, asynchronous callback.
- `REFUND_RECOMMENDED`: sequence 2, `AWAITING_APPROVAL`, preserved correlation, causation, and task invocation IDs.
- Inspection, original-event retry, and illegal `ACTION_COMPLETED`: no further event rows or diagnosis executions.

Seventeen local tests passed. Final no-write live checks also passed against the latest deployed draft. Core Runtime, Diagnose Case, and the test harness were each API-confirmed inactive and unpublished after cleanup. The two demo events remain available for review.
