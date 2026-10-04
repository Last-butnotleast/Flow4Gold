# Machine editor and catalog

Machine explorer places editable JSON beside a graph preview. Import a document or select a saved definition. After a short typing pause, valid source updates the graph. Invalid source remains editable and the previous graph is labeled stale; invalid or pending validation cannot be saved.

This describes the local phase-1 contract; see [generic runtime status](generic-runtime.md) before running against the hosted instance.

**Save new version** stores the validated document. It does not publish workflows, start cases, execute tasks or change a running case. **Next version** proposes a new identity. Existing identities are immutable: identical content is a no-op; changed content at the same machine/version returns a conflict. Unsaved edits are protected when switching documents.

## Catalog

`machine_definitions` stores:

| Column | Type | Meaning |
| --- | --- | --- |
| `machine` | String | Machine identity |
| `version` | Number | Positive immutable version |
| `definition` | String | Validated JSON |
| `isDefault` | Boolean | Editor selection preference only |

The default does not choose a runtime machine. New core cases explicitly supply `machine` and `machineVersion`; existing cases use their stream's pinned identity. Saves always use `isDefault:false`; the editor has no default-switch operation. The payment demo separately selects its compatible refund v1 adapter.

The editor, backend and runtime share `shared/machine-validation.mjs`. The supported graph has atomic states, ordinary/semantic transitions, optional outcomes, `taskResult` callback requirements, and at most one task per state. Validation rejects missing targets, ambiguous events, final-state work and unsupported executable features such as guards/actions/nested states. Descriptive metadata is preserved.

Core Runtime and diagnosis read definitions through native Data Table nodes. No filesystem or embedded-definition fallback is used. Source JSON remains seed/reference material. Builds bundle interpreter code, not a fixed machine registry.

Saving a valid graph does not implement its tasks or task-specific policies. The generic runtime handles graph semantics; adapters handle business evidence. Merely saving or previewing an order-fulfilment definition never sends a customer message or changes a refund case.

## API

- `GET /api/machines` returns catalog entries plus the editor default identity.
- `POST /api/machines` accepts `{ "definition": { ... } }`, with a 256 KiB request limit.
- New saves return 201; identical saves return 200 without writing; conflicting identities return 409.

The browser never receives the n8n API key. The local bridge validates the full catalog and rejects duplicate/corrupt identities. `/api/config` selects the payment adapter's definition; case inspection reads its exact pinned definition.
