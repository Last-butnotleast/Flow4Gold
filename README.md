# Flow4Gold

A small proof of concept for domain state machines running in n8n. The state machine owns the process; task workflows perform the work. See [the project brief](PROJECT_BRIEF.md).

The runtime loads machine definitions from the `machine_definitions` Data Table. Its current default is customer-refund v3; existing streams retain their recorded versions. Local [machine files](machines/customer-refund.v3.json) are reference/seed examples. Its [state diagram and JSON contract](docs/customer-refund.md) describe the allowed refund lifecycle. The core workflow rebuilds each case from its ordered event stream in an n8n Data Table, then appends an accepted event. The stream is authoritative; there is no case snapshot to keep in sync. Jev diagnosis runs asynchronously and chooses a bounded investigation outcome using sample payment evidence. A proposal starts a Discord webhook approval task, which waits on an n8n form and returns a proposal-bound decision. Version 3 also sends escalated cases to human review: approve an explicit refund, reject, or ask the customer a question. After approval, simulated refund and verification tasks finish the case. Jev calls are real; payment execution is simulated.

## Interactive machine explorer

The [React Flow frontend](visualizer/README.md) has three screens: **Demo workspace** for the customer conversation beside its live process, **Sample orders** for preparing fictional evidence, and **Machine explorer** for editing JSON with live graph validation, importing definitions, and saving immutable versions. The workspace shows current status and recent activity; **Inspect case** opens the technical event/model/workflow details.

```bash
npm ci --prefix visualizer
npm run demo
```

Open http://localhost:5173/?mode=live. If the visualizer is already running, start only the bridge with `npm run demo:api`. `npm run visualizer` remains available for definition-only use. Run `npm run visualizer:test` and `npm run visualizer:build` to test and build it.

Use the **Sample orders** screen to select an item or create a new fictional payment record. **Use in conversation** attaches it to a new draft without sending a message. Its stored amount supplies any refund proposal. See [the live demo guide](docs/live-demo.md) for sample inputs, the local bridge, and recorded live checks. Real n8n credentials stay on the server; the browser never receives them.

## Machine to Mermaid

The [Flow4Gold submission demo](docs/flow4gold-submission.md) researches the contest's contestant and organizer journeys, including registration while template publication is pending. Open [flow4gold-submission.v1.json](machines/flow4gold-submission.v1.json) in the Machine explorer to inspect its proposed lifecycle. This is a model with a diagram and demo storyboard; the competition is not wired into the live runtime.

Generate a Mermaid state diagram from a machine JSON file:

```bash
npm run diagram -- machines/customer-refund.v3.json docs/customer-refund.mmd
```

Omit the output path to print the diagram. For redirection, use `npm run --silent diagram -- machines/customer-refund.v3.json > docs/customer-refund.mmd` so npm's banner stays out of the file. The output is plain Mermaid (`stateDiagram-v2`), ready to paste into a Mermaid editor or a Markdown `mermaid` code block.

The diagram includes initial and final states, full event names on transitions, `decide:` labels for decision transitions, closing outcomes, and task notes beside states. It emits plain `stateDiagram-v2` syntax without configuration or custom styles.

Regenerate after editing the JSON; the command does not update the diagram embedded in `docs/customer-refund.md`.

## Machine to workflow

Save machine definitions through the [machine editor](docs/machine-editor.md). Once a version has recorded events, keep it unchanged and save a new version for lifecycle changes. For interpreter or workflow-code changes, use:

```bash
npm run build
npm test
npm run validate
npm run n8n -- push workflows/flow4gold/core-runtime.workflow.ts --verify
```

Builds bundle interpreter, validation, and task-adapter code. Core Runtime and diagnosis read machine definitions from native Data Table nodes, without embedded JSON fallback. New cases use the catalog default; existing streams select their recorded version. Payment evidence comes from `demo_orders`. Pull and review remote workflow edits before rebuilding code.

Call the core with one event per execution:

```json
{
  "caseId": "case-demo-001",
  "eventId": "event-demo-001",
  "type": "RECEIVED",
  "payload": {}
}
```

The caller supplies identifiers and the event, never the case state. The first event must be `RECEIVED`. Starting at `OPEN`, the runtime replays the case's events in sequence, validates the new event, and appends one row. State and the `REFUNDED` or `REJECTED` outcome are derived from the pinned machine definition.

An identical event retry is a no-op. Reusing an event ID with different content or lineage is rejected. Invalid events do not append anything. Events are submitted sequentially in this PoC; there is no concurrency guarantee.

Optional `causationId` identifies the existing event that caused this one. `correlationId` groups the chain: it defaults to the established case correlation, otherwise the causing event's correlation, otherwise `caseId`. This preserves causal links across related cases without introducing an event bus.

Rebuild a case without writing or executing tasks:

```json
{ "caseId": "case-demo-001", "operation": "inspect" }
```

The runtime stores domain events in `case_event_stream` and resolves task workflow IDs through `task_bindings`. Only newly accepted transitions dispatch tasks; replay, inspection, duplicates, and rejected events never do.

Call the core using n8n's Execute Sub-workflow node. The core has no public webhook. Approval callbacks must match the pending proposal and task invocation; version-3 review decisions must match the pending review and recorded proposal details. The signed form link provides bearer access, not verified Discord user identity; broader producer authentication remains necessary before real refund actions.

See [the persistence contract](docs/persistence.md) for event and replay rules, and [asynchronous tasks](docs/tasks.md) for the invocation/callback contract. [Jev diagnosis](docs/diagnosis.md) documents the actual decision API and evidence guards. See [Discord approval](docs/approval.md) for the human step and current live test.

## Workspace

Run `npm ci` to install the pinned n8n-as-code CLI. Use `npm run n8n -- ...` to select this project's version instead of a global installation.

`AGENTS.md` is intentionally maintained as concise project instructions. The upstream generator is `npm run n8n -- update-ai --cli-cmd 'npm run n8n --'`, but do not run it routinely: it appends extensive generated guidance. The generated architect agent and skill remain available as references.

The checked-in `n8nac-config.json` selects the Flow4Gold environment at https://n8n.last-butnotleast.com, with folder sync enabled in the account's Personal project:

```text
workflows/
  flow4gold/
    core-runtime.workflow.ts
    tasks/
      diagnose-case.workflow.ts
      request-approval.workflow.ts
      human-review.workflow.ts
      issue-refund.workflow.ts
      verify-refund.workflow.ts
    tests/
      persistence-check.workflow.ts
      finish-approved-case.workflow.ts
```

The `flow4gold` and `tasks` directories become n8n folders on push. Folder placement needs n8n 2.32+ with folders enabled (registered Community or a paid edition). Folder sync creates these folders automatically; they are not separate n8n team projects.

## Connect

API authentication is machine-local and is not stored in the repository. If no key is configured, enter it without echoing it or adding it to shell history:

```bash
read -rsp 'n8n API key: ' FLOW4GOLD_API_KEY
printf '%s' "$FLOW4GOLD_API_KEY" | npm run n8n -- env auth set Flow4Gold --api-key-stdin
unset FLOW4GOLD_API_KEY
npm run n8n -- env status --json
```

In n8nac 2.7.0, the status probe uses the Projects API and can report `invalid-api-key` when that endpoint is edition- or permission-restricted, even when workflow and folder operations succeed. `npm run n8n -- env status --json --no-probe` inspects configuration without that probe; it does not verify connectivity. Check authenticated workflow operations before treating this status as a credential failure.

## Validate and sync

Native MCP assist is connected to the Flow4Gold environment at level 1 (schema sync). The token is stored locally, separate from the API key. Before pushing, n8nac fetches and caches the instance's node schemas, then validates locally. `npm run validate` checks the local build and bundled node schemas.

Check the connection with `npm run n8n -- native-mcp doctor --json`. The server currently exposes 54 tools; n8nac 2.7.0 does not recognize some newer execution/reference tool names. Level 1 does not enable direct workflow changes, publishing, or execution through MCP.

```bash
npm run validate
npm run n8n -- push workflows/flow4gold/core-runtime.workflow.ts --verify
npm run n8n -- push workflows/flow4gold/tasks/diagnose-case.workflow.ts --verify
```

Push is explicit. The first push assigns remote IDs to the source files. Check the n8n folder placement after that push: the CLI may warn and fall back to flat placement on an older or unregistered instance.

To retrieve an existing workflow, use `npm run n8n -- pull <workflow-id>`. Tracked workflows retain their local paths. The public API cannot reconstruct folder membership for a fresh checkout; do not expect an initial pull to recreate the nested folders. Optional experimental session authentication is outside this setup.

On n8n 2.x, updating an already published workflow can also publish its changes. Use `push <path> --draft --verify` when changes should remain a draft. Disposable test harnesses are deactivated after use. Core and task workflows remain published so human decisions and asynchronous callbacks can continue the simulated process.

## Next breakpoint

The simulated refund chain is implemented through `CLOSED`. Use [the live demo](docs/live-demo.md) to show different customer messages, bounded AI decisions, human approval, and event replay. The [original end-to-end example](docs/end-to-end.md) records the earlier deterministic proof. Automatic dispatch recovery, concurrent event protection, and real payment integration remain separate work.

Tool reference: [n8n-as-code](https://github.com/EtienneLescot/n8n-as-code) and [folder sync](https://github.com/EtienneLescot/n8n-as-code/blob/main/docs/docs/usage/folder-sync.md).
