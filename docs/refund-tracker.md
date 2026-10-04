# Refund tracker version 1

[Machine definition](../machines/refund-tracker.v1.json) · [Generated state diagram](refund-tracker.mmd)

This model follows one buyer's return from an uploaded shipping receipt until the full expected refund is verified. It models the supplied description and screenshot, without access to the original workflow export. It uses the existing machine format: states, entry tasks, external events (`on`), bounded semantic choices (`decide`), and a final outcome.

## Workflow mapping

| Supplied workflow | Machine responsibility | Task implementation |
| --- | --- | --- |
| Receipt uploaded to Google Drive | `OPEN` receives `RECEIVED` and enters `EXTRACTING_RECEIPT` | Download image or PDF, OCR, extract carrier, tracking ID, recipient and receipt date. |
| Research expected refund and create table row | `ESTABLISHING_EXPECTATION` | Match purchase email and payment evidence; save amount, currency and dates. |
| Check shipping status | `TRACKING` receives `DELIVERY_CHECK_DUE` | `CHECKING_DELIVERY` queries DHL, records the result and sends a delivery notification once. |
| Check bank account and PayPal | `TRACKING` receives `REFUND_CHECK_DUE` | `CHECKING_REFUND` reconciles transactions through Kontoflux and records received amounts. |
| Check announcement email | `ASSESSING_REFUND_UPDATE` | Read relevant Gmail messages, classify the evidence and validate any revised refund date. |
| Find service address and draft reminder | `PREPARING_REMINDER` | Search and read merchant pages through Firecrawl; save a concrete recipient and message. |
| Human approves reminder | `AWAITING_REMINDER_APPROVAL` | Present the exact draft; only a trusted human response may emit `REMINDER_APPROVED`. |
| Send reminder and record sent date | `SENDING_REMINDER` | Send the approved message and save its provider ID, sent date and next follow-up date. |

Integration names stay in task implementations. The machine does not issue a refund; it verifies money received by the buyer. A merchant promise or a partial payment cannot produce the final `REFUNDED` outcome.

## Timing and independent checks

The screenshot's rules specify initial delivery date = receipt date +7 days and initial refund date = receipt date +14 days. These are both measured from the receipt date. Delivery confirmation is not a prerequisite for checking the account: both checks return to `TRACKING`, with delivery status held in the tracking record.

A scheduler emits due events only when their persisted due dates are reached. A confirmed delivery disables further delivery polling. A pending delivery schedules another check. A revised refund date replaces the previous deadline; stale scheduled events must be discarded or revalidated. Incoming refund messages can trigger an earlier account check and reassessment.

The original description does not define repeat polling intervals, reminder cooldowns, or what happens after declining a reminder. Proposed policy: persist configurable next-check dates; after sending or declining a reminder, wait until an explicitly chosen follow-up date. Never immediately loop into another approval request. No fixed values for those intervals are assumed here.

The atomic machine processes one event at a time. The adapter must retain and re-evaluate due work while a task or human review is in progress. Approval can be superseded by a new refund check or message. Before sending, `RECHECKING_REMINDER` checks for payments, new announcements and a still-current approval. Superseded evidence returns to refund reconciliation; an obsolete approval cannot authorize a later draft.

## Task and event contracts

Persist one tracking record per return, linked to its case ID and source file ID. It needs the receipt reference and date, carrier and tracking ID, merchant, expected amount and currency, matched payment references, received total, delivery status, expected refund date, next check dates, supporting message IDs, and reminder draft, approval and send references. Task events reference the saved record and evidence revision.

Tasks persist their evidence and scheduling changes before emitting completion events. The current runtime passes incoming event payloads to tasks; it does not automatically merge an accumulated context. Future task adapters must load the tracking record explicitly. The JSON format does not implement date arithmetic, payload validation, timers, authorization or these persistence effects.

`REFUND_CONFIRMED` requires verified, deduplicated incoming transactions covering the expected amount in the correct currency for this return. Partial receipts are recorded and produce `REFUND_OUTSTANDING`. AI can propose matches, extract dates and classify messages, but deterministic validation must enforce amounts, dates and event preconditions. A past announced date does not postpone an overdue case.

Approval binds to the exact recipient, subject, body and draft revision. The send task must check that binding, deduplicate by reminder ID, and revalidate its eligibility before sending. These are implementation requirements, not guarantees provided by the JSON alone.

## Proposed recovery paths

Unreadable receipts or missing purchase evidence wait for corrected details. Task failures, delivery exceptions, ambiguous messages and unresolved service addresses enter manual review. `TRACKING_CORRECTED` requires a complete tracking record and valid future checks; receipt problems restart extraction instead.

A failed send may already have delivered the email. It therefore enters `RECONCILING_REMINDER`, which has no automatic send task. Confirming delivery returns to tracking; proving it was not sent permits preparation and fresh approval. These recovery paths and the pre-send recheck are proposed additions to make the supplied lifecycle explicit.

## Availability

This is a model only. Open the JSON with the visualizer's **Open machine** action. Runtime registration, tracking-record storage, scheduling, task workflows and trusted approval handling remain to be implemented. Existing customer-refund machines are unchanged. Once this version has recorded events, lifecycle changes require a new version, and replay must never execute tasks.
