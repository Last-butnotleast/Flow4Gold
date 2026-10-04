# Flow4Gold demo workspace

A live customer-support demo, sample order library, and interactive machine explorer. Definition exploration runs entirely in the browser. The demo uses a local server bridge so n8n credentials stay out of the browser.

From the repository root:

```bash
npm ci --prefix visualizer
npm run visualizer
```

Open http://localhost:5173. To check or build the app:

```bash
npm run visualizer:test
npm run visualizer:build
npm --prefix visualizer run preview
```

The production files are written to `visualizer/dist/` and can be served as a static site. Machine definitions v1–v3 are bundled at build time; the live bridge supplies the current definition and cases supply their pinned versions.

## Exploring a machine

- Select a state to inspect its tasks and incoming/outgoing events. Select an event label or edge to inspect its source, target, decision criteria, and outcome.
- Search a state by its name, then choose a result or press Enter to focus it.
- Scroll to zoom, drag the canvas to pan, or use the zoom and fit controls.
- **Import JSON** loads a local source document into the editor. Syntax or semantic errors remain editable, with the last valid graph retained and explicitly marked stale.
- Edit the JSON source pane directly. Valid changes update the graph after a short debounce. **Download JSON** exports the exact editor document, including unsaved or invalid drafts; the inspector download exports the valid preview.
- Use **Load example** to return to the bundled refund machine.
- Tab to nodes or event labels and press Enter to inspect them. Escape clears graph selection. The inspector can be hidden with the panel button.

Symbols and colors identify decisions (purple diamond), tasks (blue gear), event waits (amber clock), and final states (teal double circle). These are derived from the definition's fields, not guesses about state names. A final state does not imply a successful outcome. Event names stay exact on the edges; outcomes and longer descriptions appear in the inspector.

Definition mode does not execute tasks or update cases. Nodes remain fixed so their routed edges stay aligned.

## Live case demo

Run `npm run demo` from the repository root, then open **Demo workspace** (or open `http://localhost:5173/?mode=live`). The bridge runs on localhost:5174; Vite proxies `/api` to it. Static preview alone supports the explorer, not live cases.

- Choose a sample message or write your own; starting a case can send a real Discord approval notification. All payment actions are simulations.
- Open **Sample orders** to inspect a saved item or create a fictional payment in n8n. **Use in conversation** attaches the selected record to a new draft; creation and selection do not send chat messages. Amounts come from the selected record.
- The graph loads the case’s pinned machine version, highlights its current state and traveled edges, and polls that case every three seconds until final.
- **Inspect case** shows recorded events, bounded AI decision signals, the simulated receipt, and links to n8n task workflows. The proposal is also shown in the customer conversation.
- The main panel is a customer conversation with one composer: Enter sends, Shift+Enter adds a line, and failed sends preserve the draft. The composer pauses while the system or support team is handling the case.
- Customer messages, support questions, and case updates have distinct roles. Discord instructions appear separately as a demo-operator step. Technical events, model signals, IDs and task links live in the **Inspect case** drawer.
- **New case** leaves previous cases saved and keeps them in the browser’s recent-conversation selector. Drafts are retained per conversation when switching; an explicit New case resets the new-case draft.
- A case waiting for information accepts a customer reply and optional order reference. Approval happens through the configured Discord review link.
- The selected case ID stays in the page URL. Refresh or open that URL to replay the same case; refreshing does not start tasks. You can also open an existing case by ID.
- Explorer mode retains JSON import/export, search, and the definition inspector.

Browser requests use only the same-origin `/api` bridge. The bridge’s config response supplies the current machine; individual case responses supply their pinned machine.

## Implementation

React, TypeScript, Vite, `@xyflow/react`, Lucide icons, and ELK. Dependencies are pinned in the local package and lockfile. Fonts use Google Fonts when available, with system fallbacks.

- `src/machine.ts` wraps `shared/machine-validation.mjs`, so editor and catalog API share validation rules while preserving metadata.
- `src/machineEditor.ts` handles source validation diagnostics, catalog identities, and next-version selection.
- `src/graph.ts` maps every state and event into React Flow, computes ELK placement, and preserves the edge routes and label coordinates.
- `src/components/StateNode.tsx` and `EventEdge.tsx` render the custom nodes and edges.
- `src/App.tsx` owns screen navigation, case state, browser recent cases, shared order data, and per-conversation drafts.
- `src/MachineExplorer.tsx` independently owns the editable JSON document, catalog reads/saves, last-valid graph, dirty-document handling, search, and definition inspector.
- `src/components/LiveGraph.tsx` displays the authoritative case path; `graphViewport.ts` fits nodes, routed edges, and labels together.
- `src/machine.test.ts` covers validation, data preservation, deterministic layout, cycles, parallel edges, and disconnected states.

## Research references

The implementation follows React Flow's [custom node guide](https://reactflow.dev/learn/customization/custom-nodes), [custom edge guide](https://reactflow.dev/learn/customization/custom-edges), [edge label example](https://reactflow.dev/examples/edges/edge-label-renderer), and [accessibility guidance](https://reactflow.dev/learn/advanced-use/accessibility).

Visual composition was informed by the [Base Node examples](https://reactflow.dev/ui/components/base-node), [Workflow Editor template](https://reactflow.dev/ui/templates/workflow-editor), and [React Flow showcase](https://reactflow.dev/showcase). Layout uses [ELK layered routing](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html), including label space and return paths.

## Demo workspace screens

The default view is **Demo workspace**: customer conversation on the left, the live state-machine path on the right, an operator action card for Discord decisions, and a recent-event activity strip. **Inspect case** opens recorded events, model probabilities, IDs, receipts, and workflow links. Clicking a graph state inspects its definition; it does not change the case state.

**Sample orders** is a separate fictional-payment library. Create an order, review its record, then choose **Use in conversation** to attach it to a new draft. This preserves an existing unsent new-case message and never submits a case automatically. The compact composer picker can attach records to the next intake or reply. Existing payment records and accepted proposals are not editable.

**Machine explorer** is a split JSON editor and graph preview with a saved-definition catalog from n8n. Valid edits refresh the graph after 350 ms; invalid source shows syntax location when available or an actionable validation error, with a clearly marked last-valid preview. Loading a different document with unsaved edits asks whether to discard them. **Next version** increments beyond existing versions of that machine; **Save new version** explicitly persists the exact valid editor definition. Changed content cannot overwrite an existing version. Saving is not activation: selecting or saving a definition never switches the runtime default or a pinned live case. Custom definitions may be previewed and saved without implying that existing task bindings or refund-specific business policies support them. Graph fitting includes routed return edges and event labels.

Navigation uses `?view=demo|orders|explorer`; existing `?mode=live&case=...` links still open the demo case. The recent-conversation list is local to the browser, not a global case listing. Drafts survive screen navigation during the current session. Explicit **New case** starts a blank draft while recorded cases remain saved.
