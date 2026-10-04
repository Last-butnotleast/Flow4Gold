# Human review

Refund machine version 3 gives `HUMAN_REVIEW` an asynchronous `human_review` task. Versions 1 and 2 retain their original graph and do not acquire a review task automatically. Start a new conversation to use the new flow; existing histories are not migrated or rewritten.

```text
ESCALATE → HUMAN_REVIEW
               ├─ Approve refund → REVIEW_APPROVED → EXECUTING
               ├─ Reject → REJECTED → CLOSED / REJECTED
               └─ Ask customer → NEED_MORE_INFO → WAITING_CUSTOMER
                                                       │
                                                 CUSTOMER_REPLIED
                                                       │
                                                       ▼
                                                 INVESTIGATING
```

There is no version-3 `RESUME` edge. Investigation restarts only when the customer provides a reply, and diagnosis receives the reviewer question along with the recorded customer conversation.

## Review form

[Human Review workflow](https://n8n.last-butnotleast.com/workflow/QqlNaOkKKdpSGjO8) posts a signed n8n form link through the saved Discord webhook. The form shows the customer conversation, escalation reason and matching sample payment.

- With a known sample payment, the choices are **Approve refund**, **Reject**, and **Ask customer**.
- Without a matching payment, only **Reject** and **Ask customer** appear. A reviewer cannot approve an unspecified payment.
- Every choice requires a message: the customer question, rejection explanation, or reason for approving.
- Amount, currency and payment reference come from the trusted sample records. The form has no editable monetary fields.

A reviewer may explicitly approve an exception for a known single-charge sample order, such as order 1043 for EUR 40. This is an explicit human decision, not a model override of payment facts. There is no second approval round.

Known-payment and unknown-payment branches use separate static Wait forms. This avoids an n8n rendering limitation where a nested expression for dropdown options produced blank entries. Only the selected task execution waits; Core Runtime finishes after dispatching it.

The link is signed bearer access, not verified Discord user identity. GET displays the form without deciding. No automatic timeout decision is configured.

## Recorded decisions

All callbacks keep the original case, correlation, causation and task invocation. The event ID is `<review-invocation-id>:result` and `reviewEventId` names the `ESCALATE` event that started this review.

For a question or rejection:

```json
{
  "reviewEventId": "escalation-event-001",
  "message": "Please explain what was wrong with the item."
}
```

An approval additionally records:

```json
{
  "reviewEventId": "escalation-event-001",
  "message": "Approve an exception for the damaged item.",
  "proposal": {
    "orderReference": "1043",
    "amount": 40,
    "currency": "EUR",
    "paymentReference": "demo-payment-1043",
    "reason": "Approve an exception for the damaged item.",
    "simulation": true
  }
}
```

Core validates the exact payload, current invocation and review linkage on both submission and replay. Bare decisions, stale callbacks, altered proposal fields and old `RESUME` requests are rejected. The `REVIEW_APPROVED` event itself is the approved proposal reference used by the simulated refund and verification tasks.

The chat labels reviewer messages **Support team**, keeps operator instructions separate, and enables the reply composer in `WAITING_CUSTOMER`. Reviewer-approved proposal details are shown from the recorded event. Historical version-1/2 review cases display a manual-review notice instead of falsely promising a Discord link.

## Verification

50 runtime/backend tests and 24 frontend tests pass. Coverage includes each review outcome, direct approval through simulated receipt verification, rejection closure, question/reply/new investigation, old callback rejection, unknown-payment restrictions, and unchanged v1/v2 behavior.

Live case `demo-46b20f1c-a5a5-498a-a36b-378c9a45a4c0` used real Jev diagnosis to enter version-3 `HUMAN_REVIEW`. Execution `1859` is the corrected review form. Browser checks verified the three actual dropdown options, message field, displayed EUR 40 payment, unsigned-link rejection, and that opening the form leaves the execution waiting. The human decision has not been submitted by the agent.

Earlier test execution `1850` was canceled before any decision after its dropdown-rendering issue was found. Use the latest Discord message, not that canceled test link.

All money movement remains simulated. Sequential event handling and the known append/dispatch recovery limitations are unchanged.
