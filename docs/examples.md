# Example machines

The repository keeps two reference definitions. Runtime cases use immutable definitions saved in `machine_definitions`, not these files. See [runtime](runtime.md) and [setup](setup.md).

| Definition | Purpose |
| --- | --- |
| [`customer-refund.v1.json`](../machines/customer-refund.v1.json) | Task-driven customer support with bounded AI diagnosis, human approval and simulated payments. |
| [`flow4gold-submission.v1.json`](../machines/flow4gold-submission.v1.json) | Externally driven competition lifecycle used by the contestant/admin workbench and its adapters. |

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

The canonical submission v1 definition starts `OPEN → SUBMISSION_RECEIVED → REGISTERED`. Registration then records `PUBLICATION_PENDING` or `WORKFLOW_LINKED`. The workbench and all competition adapters use this same definition; seed it into the catalog for a fresh deployment.

### Workbench and adapters

**Contestant** and **Admin** load persisted cases through the local API, competition gateway and core. There are no browser-seeded entries or local transitions. The contestant selector is a local workbench convenience, not sign-in.

The gateway accepts `{adapter: "register" | "contestant" | "organizer", input: {...}}`. Adapter sources live in [`workflows/flow4gold/tasks/competition/`](../workflows/flow4gold/tasks/competition/). Each has a fictional manual example and a callable trigger. Native If/Switch branches separate evidence validation from event/message preparation; the core remains responsible for transition legality.

| Adapter | Required evidence / behavior |
| --- | --- |
| Register submission | Name, email, title, HTTPS video and explicit template/ticket/privacy/recording confirmations. Optional published workflow evidence. Proposes `SUBMISSION_RECEIVED`, then `PUBLICATION_PENDING` or `WORKFLOW_LINKED`. |
| Contestant response | Trusted contestant/case match. Supports publication linking, clarification, invitation/prize responses and withdrawal. Publication evidence includes a positive numeric template ID, matching n8n URL and verification reference. |
| Organizer action | Organizer assertion, reason and revision. Questions, jury references, invitation details, attendance records or explicitly checked expiry evidence are required for the corresponding actions. |
| Notify participant | Renders a plain-text email preview for a state/outcome, with a stable delivery key. Requires trusted recipient/template values and task invocation linkage. It is separate from the gateway and does not send email. |

Event-producing adapters return proposals in `mode: "preview"`; they do not persist themselves. The gateway submits those proposals to core sequentially and reports actual persistence results. Registration is a two-event batch without a transaction: a later rejection can leave a partial result; an ambiguous response is reported as uncertain. Retry unchanged content with the same request ID, and reload accepted history after errors.

Trusted callers supply case/request/correlation IDs and actor assertions; contestant actions also need the stored case/contestant snapshot. `actor.verified` is an assertion, not authentication. Public ingress must authenticate callers before constructing this contract. Template/ticket confirmations and publication checks are caller evidence, not independent verification.

The local server serializes its writes and checks at most three recorded finalist selections and one winner. These controls do not provide atomic reservations across other writers. PIN issuance, public authentication, email delivery and prize fulfillment are not implemented. A production delivery adapter needs durable outbox/idempotency; replay must never send notifications.
