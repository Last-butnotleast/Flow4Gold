# Simulated refund, end to end

```text
RECEIVED → INVESTIGATING
             │ diagnose
             ▼
REFUND_RECOMMENDED → AWAITING_APPROVAL
                       │ Discord review link → human form decision
                       ▼
APPROVED → EXECUTING
             │ issue_refund (simulation)
             ▼
ACTION_COMPLETED → VERIFYING
                     │ verify_refund (simulation evidence check)
                     ▼
REFUND_CONFIRMED → CLOSED / REFUNDED
```

All task calls and callbacks are asynchronous. The event stream remains authoritative, and replay never executes tasks. Version 2's machine definition is unchanged: refund and verification tasks were already declared; their workflow bindings now exist.

## Task implementations

- [Issue Refund](https://n8n.last-butnotleast.com/workflow/QWAFL09ceL8nUa6y) resolves the triggering stored approval and the exact proposal it approved. It validates the case, version, event linkage, amount, currency and payment reference, then creates a deterministic simulated receipt.
- [Verify Refund](https://n8n.last-butnotleast.com/workflow/9LZC7MMcWWLI4FN9) reads the stored `ACTION_COMPLETED` event, its approval and original proposal. It checks the receipt's identity and fields against that evidence. Consistent evidence returns `REFUND_CONFIRMED`; inconsistent receipt evidence returns `REFUND_UNCONFIRMED` and enters `RECONCILING`.

Both tasks require version-2 proposal-bound input. No payment credentials, payment API nodes, or money movement are involved. Verification establishes simulated receipt consistency, not independent payment-provider confirmation.

The receipt payload records `simulation: true`, a stable `receiptId`, `proposalEventId`, amount, currency and payment reference. Its receipt ID is `simulated-refund:` plus the issue-refund invocation ID. Both callbacks preserve correlation and causation and use the usual stable result-event identity.

## Completing the already-approved example

Case: `approval-check-20261004-52617792`.

The user approved this case while `issue_refund` was still unbound. That approval was accepted as sequence 3 and correctly reported dispatch unavailable. Installing the binding alone does not retry old work: duplicate requests and replay deliberately never dispatch tasks.

To finish this particular example, a fixed-case helper checks the saved stream is still awaiting that exact refund invocation and starts it once using the original approval event and stable invocation ID. It does not create another approval or ask the user to approve again. The normal core then accepts `ACTION_COMPLETED` and dispatches verification automatically.

This is a controlled manual resume for one demonstration, not a general recovery worker. A sequential rerun must skip a case that has progressed or already contains the task result. Concurrent launches are outside the PoC guarantees.

## Operation

For a fresh version-2 case, publish Core Runtime and all four task workflows. Submit `RECEIVED` through the intended calling workflow, review the Discord proposal, and submit the form. The remaining simulated refund and verification steps then run automatically.

The test harnesses are not general public event APIs and are deactivated after use. Business workflows remain published for callbacks. The core itself has only a subworkflow trigger.

The simulation does not close the remaining reliability work: Data Tables have no enforced event uniqueness or atomic expected-sequence guard, appending and dispatching are separate, and general automatic recovery is still absent. A real payment integration would additionally need provider idempotency and authoritative payment-status checks.


## Verified completion

The existing case completed at `2026-10-04T12:12:46Z`:

| Sequence | Event | State after replay |
| --- | --- | --- |
| 1 | `RECEIVED` | `INVESTIGATING` |
| 2 | `REFUND_RECOMMENDED` | `AWAITING_APPROVAL` |
| 3 | `APPROVED` by the user | `EXECUTING` |
| 4 | `ACTION_COMPLETED` | `VERIFYING` |
| 5 | `REFUND_CONFIRMED` | `CLOSED`, outcome `REFUNDED` |

Refund execution `1730`, core callback `1731`, verification execution `1732`, and final core callback `1733` all succeeded. The original three event rows were unchanged. The two new events retain the exact EUR 25 proposal, deterministic simulated receipt, and correlation/causation/invocation links. No new diagnosis, Discord notification, or approval was created.

A repeated completion request returned `CLOSED` without dispatching work or changing rows. Read-only inspections `1735` and `1737` also succeeded. All 27 local tests passed, including altered receipt handling and simulation-only integration checks.

[Finish Approved Case](https://n8n.last-butnotleast.com/workflow/7wpRrMUHew9ERC0q) is the fixed-case resume helper, stored in `flow4gold/tests`. Its script is `node scripts/finish-approved-case.mjs`. The helper is inactive/unpublished after verification, while the business tasks remain published. The script is scoped to this already-approved fixture; it does not provide general task recovery or a new-case entry point.
