# Setup and deployment

## Local development

Use Node.js 22.12+ with npm. From the repository root:

```bash
npm ci
npm ci --prefix visualizer
npm run n8n -- env status --json
```

Use the pinned CLI through `npm run n8n -- ...`. Manage environment configuration through that CLI. For a new connection:

```bash
npm run n8n -- env add <name> --base-url <n8n-url> --workflows-path workflows
npm run n8n -- env auth set <name> --api-key-stdin
npm run n8n -- env use <name>
npm run n8n -- env status --json
```

Provide the API key through stdin. Resolve any access diagnostic before deployment. The build scripts currently target `workflows/flow4gold/`, so use `workflows` as this project's workflow path.

## Prepare n8n

1. Create `case_event_stream`, `machine_definitions`, and `task_bindings` in the workflows' project using the [table schemas](../data-tables/README.md). The refund demo also needs `demo_orders`.
2. Map deployment-specific Data Table, workflow, and credential IDs to your instance. References appear in `scripts/build-*.mjs`, workflow sources, and `server/demo-server.mjs`. Edit generators for generated workflows, then run `npm run build`.
3. Configure header authentication for the demo gateways. The bridge sends `X-Flow4Gold-Demo`; its `FLOW4GOLD_DEMO_TOKEN` must match the n8n credential. Refund diagnosis also requires the OpenRouter credential; approval/review require the Discord webhook credential.
4. Save the two local JSON definitions to `machine_definitions`, using the editor/API once the bridge can access the catalog, or seed validated rows with the documented schema. Preserve all existing definitions referenced by recorded events. Set one catalog default for the editor.
5. Populate refund v1 bindings for `diagnose`, `request_approval`, `human_review`, `issue_refund`, and `verify_refund` with the deployed task workflow IDs. Submission v1 uses external events and has no state tasks.

The bundled definitions are `customer-refund.v1.json` and `flow4gold-submission.v1.json`. Seeding those two definitions supports both workbench examples. Competition registration enters `REGISTERED` first, then records publication status through the same v1 adapter contract. See [examples](examples.md).

## Validate and publish

For existing workflows, pull before editing and preserve unpushed changes. After intentional core canvas edits, run `npm run core:layout` after the pull and before rebuilding.

```bash
npm run build
npm test
npm run validate
npm run n8n -- push <path-to-workflow.workflow.ts> --verify --draft
```

Push only intended files. `--draft` leaves publication for an explicit step; pushing an already published workflow without it may publish changes. Publish/activate the runtime, task workflows, and gateways as required by your instance before exercising their callbacks. Keep unused scaffolds inactive and confirm folder placement under `flow4gold/` and `flow4gold/tasks/`.

## Run the workbench

Create an ignored `.env` from `.env.example` and set `N8N_API_KEY` and `FLOW4GOLD_DEMO_TOKEN`. The bridge resolves the host from the active n8n environment; credentials stay on the server. The native MCP token is only needed when configured for the CLI's MCP integration.

```bash
npm run demo
```

Open http://localhost:5173. Vite proxies `/api` to the bridge at `127.0.0.1:5174`. `npm run visualizer` starts just the frontend; `npm run demo:api` starts just the bridge. Catalog operations and live cases require the bridge and n8n.

The bridge and competition role selectors are a local workbench, not a public sign-in system. Refund payments are simulated; competition notifications and prize effects remain previews.
