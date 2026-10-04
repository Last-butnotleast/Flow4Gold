# Machine editor and catalog

Open **Machine explorer** to edit machine JSON on the left and preview its graph on the right. Import a `.json` file or select a saved definition. Validation runs after a short typing pause. Syntax and graph errors stop preview updates; the last valid graph stays visible and is explicitly labeled stale. Invalid or pending validation cannot be saved.

**Save new version** writes the exact validated editor document through the local server to n8n. It does not publish a workflow, activate a definition, dispatch a task, or change a running case. **Next version** helps create a new identity before saving an edited existing definition. Download exports the current editor text; unsaved edits remain protected when switching documents.

## Data Table

`machine_definitions` table: `Lm8JZL9uCNqj14vE`.

| Column | Type | Purpose |
| --- | --- | --- |
| `machine` | String | Machine identity |
| `version` | Number | Immutable positive integer version |
| `definition` | String | Complete validated JSON definition |
| `isDefault` | Boolean | Selects the definition for new cases |

The catalog requires exactly one default. It currently selects `customer-refund` version 3. Historical refund versions 1 and 2, plus order-fulfilment preview examples, remain non-default. Existing cases select the identity/version recorded by their first event; changing the default does not migrate those histories.

The editor/API intentionally does not change the default flag. A new save always sets `isDefault:false`. Saving an identical definition again is a no-op; different content under the same machine/version returns a conflict. Catalog administration and task compatibility must be considered before selecting another runtime default.

Definitions use the current atomic-state subset: initial state, terminal states, `on`/`decide` transitions, descriptions/outcomes, and at most one task per state. Validation rejects missing targets, ambiguous events, work/outgoing transitions on final states, and unsupported executable fields such as guards, entry/exit actions and nested states. Additional descriptive metadata is preserved. The editor, backend and runtime share `shared/machine-validation.mjs`.

## Runtime loading

```text
Receive request
  → Read machine_definitions
  → Validate catalog
  → Read case events
  → Select recorded version, or default for a new case
  → Replay and validate
  → Append / dispatch as before
```

Core Runtime and diagnosis use native n8n Data Table nodes. There is no embedded-definition or filesystem fallback in either workflow. Diagnosis obtains its semantic choices from the exact version assigned to its case. Builds still bundle interpreter/validation code, but changing catalog data does not require recompiling machine JSON into workflows.

Local files under `machines/` remain reference/seed examples. The backend gets both the editor catalog and a live case's graph definition from the Data Table, not those files.

Saving a valid custom graph does not imply its tasks or business-specific policies are implemented. The current intake and task adapters remain the refund PoC. In particular, previewing an order-fulfilment definition does not turn it into an active application.

## API and verification

- `GET /api/machines`: saved definitions plus default identity.
- `POST /api/machines`: `{ "definition": { ... } }`, up to 256 KiB; no caller-supplied activation flag.

The browser never receives the n8n API key. The local bridge validates before writing and rejects duplicate/corrupt catalog entries.

Live checks saved non-default `order-fulfilment` version 2 through the editor, reloaded it, verified invalid-preview blocking and a 409 conflict for changed version-1 content, and confirmed default refund v3 was unchanged. Existing refund v1 and v2 cases replayed with their original state/outcome through the updated core. No case events, tasks or Discord messages were created by these checks.

Moving definitions into the catalog is one preparation step for the creator-portal submission. Consolidating the task workflows into a single submission workflow is still a separate step.
