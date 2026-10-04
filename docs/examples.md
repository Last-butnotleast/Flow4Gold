# Example machines

The repository keeps two reference definitions. Runtime cases use immutable definitions saved in `machine_definitions`, not these files. See [runtime](runtime.md) and [setup](setup.md).

| Definition | Purpose |
| --- | --- |
| [`customer-refund.v1.json`](../machines/customer-refund.v1.json) | Task-driven customer support with bounded AI diagnosis, human approval and simulated payments. |
| [`flow4gold-submission.v1.json`](../machines/flow4gold-submission.v1.json) | Competition lifecycle combining external human actions with bound preparation and in-app update tasks. |

## Customer refund

```text
RECEIVED → INVESTIGATING → AWAITING_APPROVAL → EXECUTING → VERIFYING → CLOSED
                ↕                  human decision         simulated payment
         WAITING_CUSTOMER
                ↕
           HUMAN_REVIEW
```

Diagnosis can recommend a refund, request information or escalate. Rejection closes the case; failed execution or unconfirmed verification enters `RECONCILING`, which has no automatic retry task.

- **Diagnosis:** calls Jev through OpenRouter with recorded customer messages, sample-order evidence and the pinned machine's allowed decisions. Amount, currency and payment reference come from `demo_orders`. Missing evidence prevents a refund proposal; service failures escalate. Confidence/probabilities are model signals; displayed explanations are application templates.
- **Approval/review:** posts a Discord link to an n8n Wait form. Ordinary approval accepts or rejects the recorded proposal. Human review can approve a known payment as an exception, reject, or ask the customer a question. The signed link grants bearer access, not verified Discord identity; opening it makes no decision.
- **Payment:** refund and verification tasks check recorded approval/proposal evidence and create/check a deterministic simulated receipt. No money moves or provider confirmation occurs.

Try **Demo workspace** with a duplicate-charge sample order, a vague request, or an unknown order. Reply when asked; make human decisions through the Discord form. **Sample orders** manages fictional evidence. **Inspect case** shows recorded events, decisions and receipts. Reopening a case reconstructs state without restarting tasks or sending another message.

The customer gateway permits intake, replies and inspection; it supplies refund v1 for new cases. Task-result callbacks retain their invocation and triggering-event references. Generic core checks linkage; task adapters check refund evidence.

## Competition

The lifecycle covers registration, publication waiting, review, clarification, finalist invitation, attendance, judging and prize acceptance. Human jury decisions remain explicit events. Prize acceptance records an outcome, not delivery or payment; expiry requires a checked deadline, with no automatic timer.

The canonical submission v1 definition starts `OPEN → SUBMISSION_RECEIVED → REGISTERED`. Entering `REGISTERED` dispatches `prepare_submission`; that task reads the stored registration and returns `PUBLICATION_PENDING` or `WORKFLOW_LINKED` with task-result lineage. These transitions are not manual contestant actions. The workbench and all competition adapters use this same definition; seed it into the catalog for a fresh deployment.

### Workbench and adapters

**Contestant** and **Admin** load persisted cases through the local API, competition gateway and core. There are no browser-seeded entries or local transitions. The contestant selector is a local workbench convenience, not sign-in.

The gateway accepts `{adapter: "register" | "contestant" | "organizer", input: {...}}`. Adapter sources live in [`workflows/flow4gold/tasks/competition/`](../workflows/flow4gold/tasks/competition/). Input adapters have callable triggers and manual examples. Bound state tasks accept the core invocation directly and have no fictional manual input. Native If/Switch branches separate evidence validation from event/message preparation; the core remains responsible for transition legality.

| Adapter | Required evidence / behavior |
| --- | --- |
| Register submission | Name, email, title, HTTPS video and explicit template/ticket/privacy/recording confirmations. Optional published workflow evidence. Proposes only `SUBMISSION_RECEIVED`, retaining any validated publication evidence for the preparation task. |
| Contestant response | Trusted contestant/case match. Supports publication linking, clarification, invitation/prize responses and withdrawal. Publication evidence includes a positive numeric template ID, matching n8n URL and verification reference. |
| Organizer action | Organizer assertion, reason and revision. Questions, jury references, invitation details, attendance records or explicitly checked expiry evidence are required for the corresponding actions. |
| Prepare submission (state task) | Runs on `REGISTERED`, loads recorded registration and its pinned machine, then asynchronously calls core with a publication result. |
| Notify participant (state task) | Runs on seven nonterminal stages and upserts a real in-app update from recorded case facts. It does not send email or return a transition event. |

Event-producing adapters return proposals in `mode: "preview"`; they do not persist themselves. The gateway submits one external event to core and reports actual persistence results. Registration acceptance does not mean its asynchronous preparation has finished; the frontend shows processing until the task result arrives. Retry unchanged content with the same request ID, and reload accepted history after errors.

Trusted callers supply case/request/correlation IDs and actor assertions; contestant actions also need the stored case/contestant snapshot. `actor.verified` is an assertion, not authentication. Public ingress must authenticate callers before constructing this contract. Template/ticket confirmations and publication checks are caller evidence, not independent verification.

The local server serializes its writes and checks at most three recorded finalist selections and one winner. These controls do not provide atomic reservations across other writers. PIN issuance, public authentication, email delivery and prize fulfillment are not implemented. A production delivery adapter needs durable outbox/idempotency; replay must never send notifications.

### Bound tasks and inbox

`task_bindings` contains the two submission v1 rows alongside the refund bindings. The same unmodified Core Runtime selects and launches both domains' tasks.

```text
Registration adapter → SUBMISSION_RECEIVED → core → REGISTERED
                                                       ↓ binding
                                               prepare_submission
                                                       ↓ result event
                         core → WAITING_FOR_PUBLICATION / ADMIN_REVIEW
                                                       ↓ binding
                                               notify_participant
                                                       ↓ upsert
                                          competition_notifications → inbox
```

The notifier also runs on `NEEDS_INFORMATION`, `INVITED`, `CONFIRMED`, `JUDGING`, and `AWAITING_PRIZE_ACCEPTANCE`. It validates the invocation against the recorded state-entry event, composes from history at that point, and stores a message with that event's sequence. It does not change the state; contestant responses and jury decisions remain external events. Replay and duplicate events do not dispatch either task.

The prototype retained one canonical submission v1 definition by backing up and resetting the earlier competition histories before enabling these task-result transitions. Refund data was preserved. Future changes must either use a fresh scoped reset or retain immutable definitions for existing histories.
