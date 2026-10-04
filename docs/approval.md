# Discord approval

This describes the local phase-1 refund implementation. Remote rollout and data reset are separate; see [generic runtime status](generic-runtime.md).

Entering `AWAITING_APPROVAL` starts `request_approval` asynchronously:

```text
Core appends REFUND_RECOMMENDED → starts task → finishes
Task reads recorded proposal → posts Discord link → waits for form
Human chooses Approve or Reject → task calls Core with result
```

The Discord webhook and signed n8n Wait form need no bot. The message and form show the case, amount, currency, payment reference, reason and proposal event ID. Monetary fields are not editable. Opening the form does not decide; there is no timeout decision. Only the task waits. The link grants bearer access, not a verified Discord identity.

The callback uses the original invocation rather than form-supplied IDs:

```json
{
  "caseId": "case-001",
  "eventId": "proposal-001:request_approval:result",
  "taskInvocationId": "proposal-001:request_approval",
  "causationId": "proposal-001",
  "correlationId": "case-001",
  "type": "APPROVED",
  "payload": { "proposalEventId": "proposal-001" }
}
```

Rejection uses `REJECTED` with the same result identity. The generic core enforces the edge's `taskResult: true` requirement and current invocation linkage. Business payload validation belongs to the approval/refund task adapters: they resolve and check the recorded proposal. IDs alone do not authenticate a caller; the public demo gateway does not accept approval events.

Approval enters `EXECUTING`; rejection closes with outcome `REJECTED`. Refund and verification tasks simulate payment processing. Replaying or inspecting the case never resends a Discord message. A duplicate accepted result never starts another task.

See [human review](human-review.md) for escalated cases without an ordinary refund recommendation, and [end-to-end flow](end-to-end.md).
