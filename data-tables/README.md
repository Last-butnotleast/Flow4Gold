# n8n Data Tables

Create these tables in the workflows' project. CSVs provide column names; set types explicitly. If header-only import is unavailable, create the empty schema manually. n8n supplies row `id`, `createdAt`, and `updatedAt` automatically.

## `case_event_stream`

[Schema CSV](case_event_stream.csv). The authoritative history for every case; replay derives current state and outcome.

| Column | Type | Purpose |
| --- | --- | --- |
| `eventId` | String | Stable application event ID for duplicate checks |
| `caseId` | String | Globally unique case stream identity |
| `sequence` | Number | Contiguous case order, starting at 1 |
| `type` | String | Accepted domain event |
| `payload` | String | JSON-encoded event facts |
| `causationId` | String | Causing event ID; empty for independent input |
| `correlationId` | String | Related event-chain identity |
| `machine` | String | Machine identity |
| `machineVersion` | Number | Pinned immutable version |
| `taskInvocationId` | String | Task callback identity; empty for external input |

Keep accepted rows unchanged. Sequence controls replay, not timestamps. Submit events sequentially; these tables do not enforce application event uniqueness or atomic append. See the [runtime contract](../docs/runtime.md).

## `machine_definitions`

[Schema CSV](machine_definitions.csv).

| Column | Type | Purpose |
| --- | --- | --- |
| `machine` | String | Machine identity |
| `version` | Number | Positive immutable version |
| `definition` | String | Validated machine JSON |
| `isDefault` | Boolean | Editor selection preference |

Keep one row per machine/version and one editor default. New core cases select their version explicitly. Save new versions through the editor/API; retain definitions used by existing events. Bundled examples are refund v1 and submission v1. The competition workbench and its adapters use the same submission v1 definition.

## `task_bindings`

[Schema CSV](task_bindings.csv). All columns are String except `machineVersion` (Number): `machine`, `machineVersion`, `task`, `workflowId`.

Keep exactly one row per `(machine, machineVersion, task)`, pointing to a deployed workflow. Refund v1 needs `diagnose`, `request_approval`, `human_review`, `issue_refund`, and `verify_refund`. Submission v1 has no state tasks. Bindings are deployment configuration, separate from immutable definitions.

## `demo_orders` (refund example)

[Seed CSV](demo_orders.csv) contains fictional orders `1042` (duplicate EUR 25 charge) and `1043` (single EUR 40 charge). Import once for a fresh demo.

| Column | Type |
| --- | --- |
| `orderReference` | String |
| `itemName` | String |
| `amount` | Number |
| `currency` | String |
| `paymentReference` | String |
| `duplicateCharge` | Boolean |

The local API lists/creates sample orders; diagnosis and review read them through native Data Table nodes. References must be unique, amounts positive with at most two decimal places, and currency three uppercase letters. Accepted proposals retain their evidence, so later catalog changes do not rewrite history.
