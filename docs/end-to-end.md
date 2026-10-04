# Simulated refund, end to end

The fresh refund v1 example combines real Jev diagnosis, human decisions through Discord-linked forms, and simulated payment tasks. This phase-1 implementation is local; deployment and fresh live verification follow the coordinated reset described in [generic runtime status](generic-runtime.md).

```text
RECEIVED → INVESTIGATING
             │ diagnose (Jev)
             ▼
REFUND_RECOMMENDED → AWAITING_APPROVAL
                       │ Discord link → human form decision
                       ▼
APPROVED → EXECUTING
             │ issue_refund (simulation)
             ▼
ACTION_COMPLETED → VERIFYING
                     │ verify_refund (simulation evidence check)
                     ▼
REFUND_CONFIRMED → CLOSED / REFUNDED
```

An escalated case instead uses [human review](human-review.md), which can approve a concrete proposal directly, reject, or ask the customer for more information.

All task dispatches and callbacks are asynchronous. The stream is authoritative; replay reconstructs state and never executes tasks. Generic `taskResult: true` edges enforce callback invocation linkage, while refund-specific checks live in task workflows.

`issue_refund` reads the stored approval and exact approved proposal, validates their case and linkage, and creates a deterministic simulated receipt. `verify_refund` checks that receipt against stored approval/proposal evidence. Consistent evidence returns `REFUND_CONFIRMED`; inconsistent evidence returns `REFUND_UNCONFIRMED`, entering `RECONCILING`.

The receipt contains `simulation: true`, `receiptId`, `proposalEventId`, amount, currency and payment reference. Its deterministic ID is `simulated-refund:` plus the refund invocation ID. Verification establishes internal simulated-receipt consistency, not payment-provider confirmation.

After coordinated deployment, start a fresh case through the customer gateway, review its Discord form, and watch the case complete. The gateway supplies `machine: "customer-refund"` and `machineVersion: 1` internally for intake. Existing cases use the identity pinned in their event stream.

Independent submissions remain sequential. Append and dispatch are separate operations; automatic crash recovery is outside this PoC. Repeating an accepted event or inspecting a case never retries missing task work.
