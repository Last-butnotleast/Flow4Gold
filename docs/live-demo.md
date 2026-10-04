# Flow4Gold demo workspace

The demo combines a customer conversation, live process graph, sample payment library and machine editor. Jev performs real bounded diagnosis; Discord-linked forms collect human decisions; refund and verification tasks simulate payments.

**The fresh generic runtime is deployed.** See [generic runtime status](generic-runtime.md) for live checks and scope. Old case history and waiting approval forms were reset; start a new conversation.

## Start locally

```bash
npm ci
npm ci --prefix visualizer
npm run demo
```

Open `http://localhost:5173/?mode=live`. With Vite already running, start only `npm run demo:api`. Vite proxies `/api` to the bridge at `127.0.0.1:5174`. The ignored `.env` holds `N8N_API_KEY` and `FLOW4GOLD_DEMO_TOKEN`, which matches the gateway's header credential. These remain server-side.

The gateway, core and five refund task workflows are published for real callbacks. The customer gateway accepts only intake, customer replies and inspection. It adds `machine: "customer-refund", machineVersion: 1` to intake internally; browser users cannot inject arbitrary domain events or machine identities.

## Demo workspace

1. Attach a fictional order and describe a payment issue, or start without an order to demonstrate missing information.
2. Send the message. The graph shows the pinned machine, current state and traveled path.
3. Reply when the support conversation asks for information.
4. For approval or escalation, open the case's latest Discord review link. Human review can approve a known payment, reject, or ask the customer a question.
5. Approval starts simulated refund and receipt verification; the customer view shows the resulting outcome.
6. Refresh or reopen the case URL to reconstruct its stream. This never restarts tasks.

The customer composer pauses during system/operator work. Enter sends; Shift+Enter inserts a newline; failed sends preserve drafts. Operator instructions appear separately from customer messages. **Inspect case** shows events, correlation/causation, model signals, receipt details and workflow links. The graph polls an open case until it reaches a final state.

## Sample orders

Inspect fictional payment records, or create a sample with item name, amount, currency and duplicate-charge evidence. **Use in conversation** attaches a record to a new draft; neither creation nor selection sends a message. Accepted proposals retain their recorded evidence. There are no edit/delete controls for existing payments.

Seed order `1042` has a duplicate EUR 25 payment; `1043` has a single EUR 40 payment. A duplicate-charge recommendation uses the record's amount, not an amount requested in chat. Cases outside that policy can escalate for a human exception. Unknown orders cannot be approved as unspecified payments.

Useful inputs are a duplicate charge, a vague payment issue, and a request for EUR 5,000 without approval. These demonstrate bounded choices and evidence-based amounts, not a claim that AI never misclassifies requests. Confidence and probabilities are model signals; displayed diagnosis reasons/questions are application templates.

## Machine explorer

Edit/import JSON and inspect its graph independently of live cases. Valid changes refresh the preview; invalid source leaves a labeled last-valid graph. Saving creates an immutable catalog version, not a running process or deployment. A new generic-core case must explicitly select a machine/version. The catalog default is an editor preference only.

Navigation uses `?view=demo|orders|explorer`; existing `?mode=live&case=...` URLs still work. Recent case choices are browser-local. Drafts survive screen navigation; explicit **New case** resets the new-case draft without deleting recorded cases.

See [diagnosis](diagnosis.md), [approval](approval.md), [human review](human-review.md), [machine editor](machine-editor.md), and [event persistence](persistence.md).
