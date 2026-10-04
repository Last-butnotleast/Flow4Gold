# Human review

The fresh `customer-refund` v1 machine gives escalated cases an asynchronous `human_review` task. This is the local phase-1 contract; see [rollout status](generic-runtime.md).

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

The task posts a signed n8n review-form link through the configured Discord webhook. It shows the recorded conversation, escalation reason and matching fictional payment. A known payment permits **Approve refund**, **Reject**, or **Ask customer**. Without a known payment, approval is unavailable. Every response needs a message; amounts and payment references come from trusted order evidence, not editable form fields.

Known-payment and unknown-payment branches use separate static Wait forms. Dynamic nested dropdown-option expressions rendered blank choices in n8n; retain the static branches. Opening the signed link only displays the form. It is bearer access, not named-user authentication.

Reviewer questions appear in chat as **Support team** and wait for a customer reply before diagnosis restarts. Diagnosis receives the recorded question and answer. A reviewer can approve a specific known payment as an exception, with no second approval round.

All callback payloads contain `reviewEventId` (the triggering escalation) and `message`. Approval additionally contains `proposal`:

```json
{
  "reviewEventId": "escalation-001",
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

Callbacks preserve case, correlation, causation and task invocation, with event ID `<taskInvocationId>:result`. The generic core checks current invocation linkage on edges marked `taskResult: true`. Review, refund and verification adapters enforce business payload and recorded-evidence checks. The `REVIEW_APPROVED` event is itself the approved proposal reference.

No money moves. See [simulated completion](end-to-end.md).
