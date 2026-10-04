# Live Flow4Gold demo

The live view combines the actual n8n event stream with the existing machine graph. Jev handles the investigation decision; the machine determines allowed transitions; the human approves the recorded proposal; payment tasks remain simulations.

## Run locally

```bash
npm ci
npm ci --prefix visualizer
npm run demo
```

Open `http://localhost:5173/?mode=live`. If Vite is already running, use `npm run demo:api` instead of starting a second frontend. The API listens only on `127.0.0.1:5174`; Vite proxies `/api`. Both processes are needed for live mode. Static preview remains a definition viewer.

The local ignored `.env` contains `N8N_API_KEY` and `FLOW4GOLD_DEMO_TOKEN`. The latter matches the n8n Demo Gateway's header-auth credential; it is separate from the API key. Both are server-side only. The gateway and all six business workflows (core plus five tasks) must be published. This instance is already configured. For another instance, recreate the gateway header credential and replace the local token and deployment IDs; do not copy secrets into browser configuration.

Gateway: `K83lSyLHmJ4PBTh4`, production path `/webhook/flow4gold-demo`, header `X-Flow4Gold-Demo`. The gateway accepts only customer-origin `RECEIVED`, `CUSTOMER_REPLIED`, and inspection requests. It does not expose approvals or task callbacks. The browser cannot choose an arbitrary event type or state.

## Show the story

1. Open **Demo workspace**, choose an order if relevant, and enter a customer message or use an example.
2. Start the case. The graph loads its pinned machine version and highlights its current state and path.
3. Watch the Jev decision and accepted event appear. Confidence/probabilities are model signals, not guarantees. Displayed reasons and questions are application templates.
4. If information is missing, reply in the case panel. The reply is recorded before diagnosis runs again.
5. If a refund is recommended, review the exact proposal in Discord and choose on the linked n8n form.
6. Approval starts simulated execution and verification. Rejection closes the case without a refund. The live view shows the resulting outcome and simulated receipt.
7. Refresh the page or share its local case URL. The view reloads the same event stream; it does not restart tasks.

The bottom activity strip summarizes recorded events. **Inspect case** opens event payloads, causation/correlation links, model signals and n8n workflow links in a drawer. **Machine explorer** independently supports catalog selection, live JSON editing/validation, explicit version saving, import/export, searching, and definition inspection; changing its definition does not change the running case. The live view polls every three seconds while the case is open; the server caches core inspection until the stream changes.

The primary interaction is a customer conversation. One composer handles the first message and requested replies; it pauses during processing, team approval, and after closure. Enter sends, Shift+Enter inserts a line, and failures keep the draft. Technical details are in the **Inspect case** drawer. The separate operator card above the process graph explains the Discord review action without presenting it as the customer's responsibility. Starting a new conversation does not delete the previous case.

## Choose or create sample evidence

Open **Sample orders**. Select an item from the library to see its payment evidence, or choose **Create sample order** and enter its item name, amount per charge, currency, and whether it was charged twice. Saving creates a fictional Data Table record. **Use in conversation** then returns to a new draft with the order attached, preserving an unsent new-case message. Neither action starts a case or sends Discord notifications. The workspace also has a compact order picker.

The composer shows the attached record and amount. Recent-case choices are saved in this browser; starting a new conversation leaves persisted cases intact. Duplicate-charge and boundary-test examples use the selected order. The missing-information example deliberately clears the selection. You can still enter an unknown order reference manually to test that path. New record creation does not modify existing proposals; no update/delete control is exposed.

For example, create a duplicate-charged EUR 89.90 order and ask about it: a justified refund proposal will be EUR 89.90, rather than the seed order's EUR 25. Changing a requested amount in customer text still cannot change the payment record.

## Three demonstration inputs

| Preset | What to demonstrate |
| --- | --- |
| Duplicate charge, order `1042` | Jev interprets a refund request; trusted sample evidence supplies EUR 25 and payment reference `demo-payment-1042`; human approval is still required. |
| Missing information | The case enters `WAITING_CUSTOMER`; reply with order `1042` and the duplicate-charge issue to resume investigation. |
| Try bypassing approval | Customer text requests EUR 5,000 without approval. The model can only return one of the three investigation events; amount and payment reference still come from sample records. |

The `demo_orders` Data Table is explicitly fictional: order 1042 has a duplicate EUR 25 charge; order 1043 has a single EUR 40 charge and no duplicate-charge refund eligibility. API/model errors and cases beyond the duplicate-charge policy escalate to human review. Version-3 cases send a Discord review form; its question appears in customer chat and a reply restarts diagnosis. The reviewer can approve the fixed known sample payment with a reason, or reject. Older version-1/2 review states remain manual; start a new case to use this path. This demo does not claim prompt-injection immunity or production reliability.

## Verified live behavior

- `demo-461fe26c-7910-40af-900a-728260c0f108`: browser intake with missing information produced a real Jev `NEED_MORE_INFO`. A browser reply naming order 1042 produced `REFUND_RECOMMENDED` for EUR 25 and reached `AWAITING_APPROVAL` (four events).
- `demo-ade7fe8a-2322-4715-8c8e-b5adfaf9ed4d`: the EUR 5,000 approval-bypass request produced a proposal for EUR 25 and remained `AWAITING_APPROVAL`. There was no approval, refund execution, or verification event from the customer text alone.
- The previous completed case `approval-check-20261004-52617792` loaded through the bridge as `CLOSED / REFUNDED`, with all five events and its simulated receipt.

The new cases generated real Discord review messages and await human decisions. No decision was submitted by the agent. Live Chrome checks found no browser errors for the intake/reply flow. Local checks passed 38 root tests and 17 visualizer tests; frontend build and workflow validation passed.

The Data Table order-library update was also verified through Chrome: creating **Demo wireless headphones, EUR 89.90, charged twice** saved and selected an order without starting a case. Sending the next message created case `demo-cc313f08-ffaa-4901-83c1-9360f3df823b`; real diagnosis read order `demo-4b90eadf-086b-48d3-9d8a-4ca86484a0f5` from the table and proposed EUR 89.90. Its event evidence includes the exact order snapshot. The case reached `AWAITING_APPROVAL`; no decision was submitted by the agent. Updated checks passed 55 runtime/backend tests and 31 frontend tests.

## Files

- `server/demo-server.mjs`: local API, filtered event reads, cached authoritative inspection.
- `workflows/flow4gold/demo-gateway.workflow.ts`: authenticated customer-only n8n entry point.
- `visualizer/src/App.tsx`, `LivePanel.tsx`, `LiveGraph.tsx`, and `CaseInspector.tsx`: workspace navigation, conversation, process and technical inspection.
- `SampleOrders.tsx` and `MachineExplorer.tsx`: separate evidence and definition screens.
- `runtime/diagnosis-*.js`, `runtime/demo-order-lookup.js`, `scripts/build-diagnosis.mjs`: bounded Jev adapter and validated native Data Table evidence lookup.

See [diagnosis](diagnosis.md), [approval](approval.md), and [event persistence](persistence.md) for the underlying contracts.
