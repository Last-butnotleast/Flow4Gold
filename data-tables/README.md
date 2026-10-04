# Event store

**Fresh deployment:** the event, definition and binding tables were reset for the generic runtime on 4 October 2026. IDs and sample orders were preserved. See [deployment evidence](../docs/generic-runtime.md).

`case_event_stream` is the authoritative store. The runtime rebuilds each case by replaying its accepted events in sequence; it does not need a case snapshot or a second history write.

The table was created through the n8n public API in the workflows' project (`8d5DQtHZkgLco5Yr`). Its ID is `TjuB58skTvPRCwB3`. Columns and types were read back and verified. No manual import is needed for this instance.

For another instance, import [case_event_stream.csv](case_event_stream.csv) as **case_event_stream** in the workflows' project. It contains headers only. Set the types explicitly:

| Column | Type | Meaning |
| --- | --- | --- |
| `eventId` | String | Stable application event ID for duplicate delivery checks |
| `caseId` | String | Case event stream identifier |
| `sequence` | Number | Contiguous order within the case, starting at 1 |
| `type` | String | Accepted domain event type |
| `payload` | String | Event facts encoded as JSON |
| `causationId` | String | ID of the event that directly caused this event; empty for independent inputs |
| `correlationId` | String | Related chain identifier; inherits the case or cause's correlation, otherwise defaults to the case ID |
| `machine` | String | State machine identifier |
| `machineVersion` | Number | Immutable definition version used to replay the event |
| `taskInvocationId` | String | Task callback identity, derived from its triggering event and task name; blank for external inputs |

n8n supplies `id`, `createdAt`, and `updatedAt`; these are omitted from the CSV. `createdAt` records append time, while `sequence` controls replay ordering. Current state, outcome, and transition source/target are derived rather than stored as authoritative columns. Payload facts are retained; a general context projection is not implemented yet.

The runtime only appends accepted events. Keep existing rows and the machine definitions used by them unchanged. Data Tables do not enforce event-ID uniqueness or atomic compare-and-append: submit events sequentially for this PoC. A future PostgreSQL store can preserve this event contract while adding those guarantees.

Header-only CSV import has not been tested in the instance UI. If it requires data rows, create the empty table with these columns instead. The public API supports creation with explicit column types and project ID; see the [official create-table API schema](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/public-api/v1/handlers/data-tables/spec/paths/createDataTable.generated.yml).

See [the persistence contract](../docs/persistence.md) for runtime inputs and replay behavior.

## Task bindings

`task_bindings` maps `(machine, machineVersion, task)` to deployed workflow IDs. It is deployment configuration, not part of the immutable machine or event history. Created through the public API in the same project; table ID: `gYLwq6bG2pQQcF1w`.

| Column | Type | Meaning |
| --- | --- | --- |
| `machine` | String | Machine identity |
| `machineVersion` | Number | Definition version |
| `task` | String | Symbolic task name from the entered machine state |
| `workflowId` | String | n8n workflow implementing the task |

Keep one binding per `(machine, machineVersion, task)` tuple; missing or duplicate matches prevent task dispatch. Import [task_bindings.csv](task_bindings.csv) as a schema reference and populate the actual workflow IDs. The fresh refund seed needs five bindings: `diagnose`, `request_approval`, `human_review`, `issue_refund`, and `verify_refund`. Payment tasks remain simulated.

## Demo orders

`demo_orders` (`1NakvVeVYx0CI2hU`) is the source of fictional payment evidence. It is separate from the event stream and task bindings. The frontend lists it and can create new samples; diagnosis and human review read it through native Data Table nodes. There is no bundled order-file fallback.

| Column | Type | Meaning |
| --- | --- | --- |
| `orderReference` | String | Unique sample-order reference |
| `itemName` | String | Display name of the purchased item |
| `amount` | Number | Amount of one charge, positive and at most two decimal places |
| `currency` | String | Three uppercase currency letters |
| `paymentReference` | String | Fictional payment identifier |
| `duplicateCharge` | Boolean | Whether that payment was charged twice |

[demo_orders.csv](demo_orders.csv) supplies the two original seed records for a fresh instance. Set numeric and boolean types correctly when importing. Current-instance seeds were created through the API and are already present; do not import them again.

The local API generates unique references for newly created samples and supports create/list only. Creating or selecting an order does not submit a chat message or change a case. An accepted proposal stores its payment facts, so later catalog changes cannot rewrite that proposal or an already-open review form. Reused or invalid matching references cannot authorize a refund. This remains a small sequential demo catalog, not a production order database.


## Machine definitions

`machine_definitions` (`Lm8JZL9uCNqj14vE`) stores `machine` (String), `version` (Number), `definition` (String containing JSON), and `isDefault` (Boolean). Use [machine_definitions.csv](machine_definitions.csv) as a schema header reference. The editor/API catalog requires one default for display. The generic core does not use that flag: a new case selects its machine and version explicitly. The catalog contains fresh customer-refund v1 and Flow4Gold submission v1/v2 definitions; v2 is an explicit starting-transition comparison, not a compatibility version. Save validated, immutable versions through the frontend editor/API. See [the catalog contract](../docs/machine-editor.md) for loading and replay behavior.
