# Customer refund, version 1

[customer-refund.v1.json](../machines/customer-refund.v1.json) is the fresh refund example for the generic runtime. It includes diagnosis, ordinary approval, actionable human review, and simulated refund/verification. This is a local phase-1 reset, not a migration of deployed history; see [generic runtime status](generic-runtime.md).

```text
OPEN --RECEIVED--> INVESTIGATING
  INVESTIGATING --REFUND_RECOMMENDED--> AWAITING_APPROVAL
  INVESTIGATING --NEED_MORE_INFO-----> WAITING_CUSTOMER
  INVESTIGATING --ESCALATE-----------> HUMAN_REVIEW

AWAITING_APPROVAL --APPROVED---------> EXECUTING
AWAITING_APPROVAL --REJECTED---------> CLOSED / REJECTED
HUMAN_REVIEW -----REVIEW_APPROVED----> EXECUTING
HUMAN_REVIEW -----REJECTED-----------> CLOSED / REJECTED
HUMAN_REVIEW -----NEED_MORE_INFO-----> WAITING_CUSTOMER
WAITING_CUSTOMER --CUSTOMER_REPLIED--> INVESTIGATING

EXECUTING --ACTION_COMPLETED--------> VERIFYING
EXECUTING --ACTION_FAILED-----------> RECONCILING
VERIFYING --REFUND_CONFIRMED---------> CLOSED / REFUNDED
VERIFYING --REFUND_UNCONFIRMED-------> RECONCILING
RECONCILING --REFUND_CONFIRMED-------> CLOSED / REFUNDED
```

## Definition

The top-level fields are `machine`, `version`, `initial`, and `states`.

- `on` maps ordinary domain events to target states.
- `decide` maps semantic choices to targets and descriptions for a decision engine.
- `tasks` declares one symbolic task on state entry.
- `final: true` marks a terminal state without work or outgoing edges.
- Edge `outcome` records a derived outcome such as `REFUNDED` or `REJECTED`.
- Edge `taskResult: true` requires a result from the current task invocation.

```json
{
  "AWAITING_APPROVAL": {
    "tasks": ["request_approval"],
    "on": {
      "APPROVED": {"target": "EXECUTING", "taskResult": true},
      "REJECTED": {"target": "CLOSED", "outcome": "REJECTED", "taskResult": true}
    }
  }
}
```

The task names are `diagnose`, `request_approval`, `human_review`, `issue_refund`, and `verify_refund`. Workflow IDs belong in `task_bindings`, not the machine. Generic Core Runtime interprets the graph and invocation links; these task adapters validate refund-specific evidence and payloads.

Jev makes only investigation choices. Human approval refers to an explicit recorded proposal. Human review can approve a known payment, reject, or ask a question; investigation restarts after a customer reply. Verification checks a simulated receipt against evidence rather than asking AI whether payment succeeded. Reconciliation has no automatic retry task.

## Starting and replaying

A new generic-core case explicitly supplies `machine` and `machineVersion`; the refund gateway supplies `customer-refund` and `1`. The catalog default is an editor selection preference, not an implicit runtime machine. Existing cases replay using their recorded identity/version.

Definitions are read from `machine_definitions`; source JSON files are seed/reference examples. A newly accepted event is appended before its entered state's task starts asynchronously. Inspecting, replaying, or repeating an accepted event never dispatches work. Saved definitions remain immutable by identity/version.

Invocation linkage is structural, not caller authentication. The customer gateway accepts only customer intake, replies and inspection; human decisions travel through the signed form task. Payment actions remain simulations.
