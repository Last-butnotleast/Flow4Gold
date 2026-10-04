# Bounded diagnosis with Jev

This describes the local phase-1 refund v1 adapter; remote rollout is separate. See [generic runtime status](generic-runtime.md).

The Diagnose Case task reads the case's accepted `RECEIVED` and `CUSTOMER_REPLIED` events through the triggering event, then asks Jev for one investigation outcome. It runs asynchronously and returns a domain event to Core Runtime. The machine definition and event stream remain authoritative.

## Request and response

The HTTP node calls `POST https://openrouter.ai/api/alpha/decisions` using the existing **Openrouter Auth** n8n credential. Its JSON request contains:

- `model`: `typesafe/jev-1.13`.
- `state.customer_messages`: recorded intake and subsequent customer replies.
- `state.trusted_order`: the matching sample order, or `null`.
- `state.policy`: the simulated duplicate-charge refund policy.
- `questions.next_event`: a `choice` question, with instructions and criteria derived from the current machine's `INVESTIGATING.decide` entries.

Allowed choices are `REFUND_RECOMMENDED`, `NEED_MORE_INFO`, and `ESCALATE`. The response is read from `answers.next_event`: `type`, `choice`, `confidence`, and `probabilities`. See the [OpenRouter raw HTTP example and response](https://openrouter.ai/blog/insights/what-is-jev/).

The accepted result event records `payload.decision` with the model, choice, probabilities, confidence, and provider request ID when supplied. These are model signals, not proof of correctness. Jev does not return a prose rationale; the displayed `reason` and follow-up `question` are application templates, not generated explanations.

## Sample evidence and boundaries

Fictional orders are read from the n8n `demo_orders` Data Table at task execution time. The original seed records are:

| Order | Payment evidence | Available proposal |
|---|---|---|
| `1042` | Duplicate charge | EUR 25, payment `demo-payment-1042` |
| `1043` | Single charge | No duplicate-charge refund proposal |

Order references come from an explicit `orderReference` in intake/replies, or a narrowly matched phrase such as `order 1042`. Later replies can provide or correct the reference. The task passes all relevant recorded customer messages to Jev.

Amount, currency, payment reference, item name, and duplicate-charge evidence come from the matching Data Table record. The event evidence retains the matched record as `orderSnapshot`. New samples created in the frontend are available immediately, without a workflow rebuild. Amount, currency, and payment reference are always copied from that record. A customer request for EUR 5,000 cannot change those fields. A model refund recommendation without a matching order becomes `NEED_MORE_INFO`; one without duplicate-charge evidence becomes `ESCALATE`. Every accepted refund recommendation still enters human approval. These limits do not imply that the model can never misclassify a request.

HTTP failures or invalid bounded answers return `ESCALATE` with a short service-unavailable explanation. The callback never includes raw HTTP errors, headers, or credential data. Invocation or stream-integrity errors stop the task rather than manufacturing a domain result.

The callback retains `caseId`, `correlationId`, `causationId`, and `taskInvocationId`; its stable event ID is `<taskInvocationId>:result`. The generic core checks current invocation linkage because investigation edges declare `taskResult: true`. Diagnosis validates refund-specific evidence and its bounded output; the core does not embed refund payload rules.

## Build and checks

`npm run build` embeds validation and `runtime/diagnosis-*.js`/`runtime/demo-order-lookup.js` code. Native Data Table nodes supply both the payment evidence and machine catalog. Semantic criteria come from the case’s exact recorded machine version, not an embedded definition. `npm run validate` checks that generated code matches its sources. `tests/diagnosis.test.mjs` verifies response parsing, evidence guards, intake/reply aggregation, asynchronous callback wiring, and sanitized error escalation.

To demonstrate the deployed adapter, try a vague request, a duplicate-charge request with a known order, and a request for an inflated amount. Model choices may vary. The invariant is that task evidence supplies the payment fields and every refund recommendation still requires human approval. The actual Jev HTTP request is real; all payments are simulated.
