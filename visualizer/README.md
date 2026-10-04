# Flow4Gold frontend

React/TypeScript/Vite workbench for the event-sourced n8n runtime. See the [project README](../README.md), [setup](../docs/setup.md) and [examples](../docs/examples.md).

From the repository root:

```bash
npm ci --prefix visualizer
npm run demo                 # frontend and local API bridge
npm run visualizer           # frontend only
npm run demo:api             # bridge only
npm run visualizer:test
npm run visualizer:build
```

Open `http://localhost:5173`. Browser requests use `/api`; credentials stay on the server. Static builds in `visualizer/dist/` support local definition exploration; saved catalogs and live cases need the bridge and n8n.

| Screen | Purpose |
| --- | --- |
| Demo workspace | Customer conversation, pinned live graph and recorded-event inspector. |
| Sample orders | Browse/create fictional payment evidence. |
| Machine explorer | Edit/import JSON, inspect graphs and save immutable catalog versions. |
| Contestant / Admin | Registration and review of persisted competition entries; local workbench, not authentication. |

Navigate with `?view=demo|orders|explorer|contestant|admin`. Graph inspection never changes state. Saving a definition does not run it; existing cases keep their pinned version. The competition workbench and adapters use the canonical `flow4gold-submission.v1.json` definition saved in the catalog.

Competition registration shows a preparation state until its bound task returns a publication event. The inbox reads stored `competition_notifications` task output; a pending update is distinct from a delivered in-app message, and late messages stay in history. Notifications do not imply email delivery.
