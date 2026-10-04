# Flow4Gold frontend

Three screens share one app: **Demo workspace**, **Sample orders**, and **Machine explorer**. This local phase-1 frontend targets the fresh refund v1 example. Remote deployment/reset is tracked in [generic runtime status](../docs/generic-runtime.md).

From the repository root:

```bash
npm ci --prefix visualizer
npm run visualizer
```

Open `http://localhost:5173`. For the local n8n bridge and frontend together, use `npm run demo`; when Vite is already running, use only `npm run demo:api`.

```bash
npm run visualizer:test
npm run visualizer:build
npm --prefix visualizer run preview
```

The build output is `visualizer/dist/`. Static hosting supports local definition exploration; catalog operations and live cases need the server bridge. Browser requests use `/api`, with credentials kept on the server.

## Demo workspace

The customer conversation sits beside its live state-machine graph. An operator card separates Discord approval/review from customer actions. Recent activity summarizes accepted events; **Inspect case** opens payloads, IDs, decision signals, receipts and workflow links. Selecting a graph state inspects its definition without changing the process.

One composer handles intake and requested replies. Enter sends, Shift+Enter adds a line, and failed sends retain the draft. The composer pauses during task/human work. Human decisions happen through Discord-linked forms. Jev calls are real; payments are simulated.

Each case uses its pinned machine definition. The graph highlights state and traveled edges and polls until final. Refresh/reopen reconstructs the case without starting tasks. Recent-case choices are browser-local, not a global list. Drafts survive screen navigation; **New case** resets the new draft without deleting cases.

## Sample orders

Browse/create fictional payment records independently of the conversation. **Use in conversation** attaches an order to a new draft and preserves its unsent message; creation and selection never send automatically. The composer can also select a record for the next reply. Accepted proposals and existing order records are not editable.

## Machine explorer

Edit JSON beside the graph or import a file. Valid source updates the preview after a short delay; invalid source remains editable with a labeled last-valid preview. Select states/edges to inspect tasks, transitions, semantic criteria and outcomes. Search, pan, zoom and fit include routed edges and labels. Nodes stay fixed to preserve routing.

The saved-definition catalog comes from n8n. **Next version** proposes a fresh identity; **Save new version** stores the exact valid document without activating anything. Changed content cannot overwrite a recorded identity. Unsaved edits are protected when switching documents. Download preserves the editor document; definition exploration never runs tasks.

The catalog default is only an editor selection preference. The generic runtime requires explicit machine/version for new cases; the payment gateway chooses its compatible refund v1 contract. Explorer selection never changes a running case or its pinned graph.

Navigation uses `?view=demo|orders|explorer`; `?mode=live&case=...` links remain supported.

## Implementation

React, TypeScript, Vite, React Flow, Lucide and ELK. Dependencies are pinned. Google Fonts have system fallbacks.

- `src/App.tsx`: screens, current case, browser recent cases, order data and drafts.
- `src/MachineExplorer.tsx` and `machineEditor.ts`: editable source, validation, catalog/save flow and last-valid preview.
- `src/machine.ts`: typed wrapper around shared graph validation.
- `src/graph.ts`: state/event mapping and ELK routes.
- `src/components/LiveGraph.tsx` and `graphViewport.ts`: pinned live graph and complete graph fitting.
- `src/components/LivePanel.tsx`: customer conversation.
- `src/components/CaseInspector.tsx`: recorded process details.

See [demo guide](../docs/live-demo.md) and [machine catalog contract](../docs/machine-editor.md).
