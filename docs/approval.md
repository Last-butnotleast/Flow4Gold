# Discord webhook approval

New refund cases use machine version 3; ordinary proposal approval behaves the same as version 2. Entering `AWAITING_APPROVAL` starts the `request_approval` task asynchronously. Version 1 is unchanged and remains available for existing event streams.

```text
Core: append REFUND_RECOMMENDED → start request_approval → finish
Task: validate recorded proposal → post Discord review link → wait for form
Human: open form → explicitly choose Approve or Reject → submit
Task: call Core asynchronously with the proposal-bound decision
```

Workflow: [Request Approval](https://n8n.last-butnotleast.com/workflow/cL04Sd1GfOlJk0Te). The `task_bindings` row maps `request_approval` to this workflow. It uses the saved `Discord Webhook account` credential; no bot or Discord interactions endpoint is needed.

## What the human sees

Discord receives a clearly labeled simulated refund proposal containing the case ID, amount/currency, payment reference, reason, proposal event ID, and a review link. The n8n form shows the same proposal and a required Approve/Reject choice. There is no automatic timeout decision.

The task uses n8n's signed per-execution resume form URL and refuses to post an unsigned URL. A live check confirmed that an unsigned GET is denied and a signed GET opens the form without resuming the task. The link provides bearer access; it is not authentication of a named Discord user. Keep it in the intended private approval channel.

Only the approval task waits. Core Runtime and other cases are not held open by the human response.

## Callback contract

The callback's values come from the original invocation, not user-editable form fields:

```json
{
  "caseId": "case-001",
  "eventId": "proposal-event-001:request_approval:result",
  "taskInvocationId": "proposal-event-001:request_approval",
  "causationId": "proposal-event-001",
  "correlationId": "case-001",
  "type": "APPROVED",
  "payload": { "proposalEventId": "proposal-event-001" }
}
```

Reject uses `REJECTED` with the same stable result ID. Version-2 approval requires the expected invocation, matching causation, and exactly the pending proposal event ID in its payload. These checks apply to submission and replay. A bare `APPROVED`, wrong proposal, forged extra payload fields, or stale invocation is rejected. An identical already recorded response is a duplicate; attempting a different decision with that result ID conflicts.

Approving enters `EXECUTING` and starts the bound simulated `issue_refund` task. Its result leads to simulated verification and then `CLOSED`/`REFUNDED`. No money is issued. Rejecting enters `CLOSED` directly with outcome `REJECTED`.

## Verification and operation

23 local tests passed, including both form choices, malformed responses, proposal tampering, replay of v1/v2, stale callbacks, and the signed-link guard. The Discord webhook send operation used the bundled schema fallback; actual delivery was verified live.

One live sample was sent for `approval-check-20261004-52617792`. Diagnosis execution `1716` completed and Request Approval execution `1718` reached waiting. Signed/unsigned GET checks passed. Inspection, duplicate input, and an illegal event added no rows and sent no extra notifications. The user then approved in the form: execution `1718` succeeded and sequence 3 recorded `APPROVED`, linked to the exact proposal event and approval invocation. The agent did not submit the decision. The case initially paused in `EXECUTING` because the refund task had not yet been implemented. Its original task invocation was later resumed explicitly after the two simulation tasks were installed; see [the end-to-end record](end-to-end.md).

The disposable test harness is inactive. Core Runtime, Diagnose Case, and Request Approval remain published for the approval flow. The sample approval has completed. Read-only inspection is safe; it does not resend the notification. Do not rerun the fresh-sample script for an existing case or use it to repair a partially completed run.

For a deliberate new sample, use the [live demo](live-demo.md). It accepts a real customer message and sample order reference, and sends an approval notification only if Jev recommends an evidence-backed refund. The old fixed-proposal approval script has been retired; its verification record above remains valid. The app never chooses a decision for the human.

Unchanged PoC limits: independent event submissions are sequential, append and task dispatch are not atomic, and automatic task recovery is not implemented. No real refund is connected.
