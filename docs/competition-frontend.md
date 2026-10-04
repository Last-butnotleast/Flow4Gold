# Competition frontend

The contestant and organizer views use n8n as their source of truth. Registration and actions go through the local API, the authenticated competition gateway, domain adapters, and the generic core. Lists, details and graph state come from stored events plus authoritative core inspection.

```text
Browser → local API → authenticated n8n gateway → domain adapter → core
Browser ← saved entry and pinned graph ← Data Tables + core inspection
```

Open `http://localhost:5173/?view=contestant` to register or respond, and `?view=admin` to review entries. New installations show an empty list. The UI has no seeded entries, fake PIN, reset button or browser-side transition engine. A saved entry has a real case reference and survives reloads.

The server-held API key and gateway token never enter browser code. The local API only accepts the supported registration/action fields and constructs actor/case metadata itself. Role and contestant selection are local workbench views, not sign-in or named-user authentication. Notifications appear as recorded updates; no email is sent and this app does not submit an entry to an external contest portal.

## Local API

- `GET /api/competition/entries` → `{entries}`.
- `GET /api/competition/entries/:caseId` → `{entry}`.
- `POST /api/competition/entries` → `{requestId, submission}`.
- `POST /api/competition/entries/:caseId/actions` → `{requestId, action, ...actionEvidence}`.

Successful writes return `{entry,result}` containing the saved projection and n8n's actual batch result. The frontend updates state after confirmation, not optimistically. A request ID stays stable for an unchanged retry; registration derives its case ID from that request ID. n8n detects duplicate/conflicting event identities. Partial or uncertain results remain errors, with any actual persisted entry exposed by the API.

Registration requires name, email, title, HTTPS video URL and the four explicit registration assertions required by the task contract. Publication, organizer decisions, invitations, attendance and expiry gather the evidence needed by their adapter. No PIN or verification result is fabricated in the frontend.

Only persisted `flow4gold-submission` entries in the `competition-` application namespace are listed. Earlier core smoke fixtures remain outside that namespace. The definition attached to each entry is selected from its recorded machine/version, not imported as a browser fallback.

The local bridge serializes writes and enforces its three-finalist/one-winner limits across these entries. This remains the sequential PoC; direct external writers are not covered by that local lock. The generic core still owns allowed transitions, replay and event identity.

Run `npm run demo` (or `npm run demo:api` if Vite is already running). Backend tests cover the full lifecycle, stable retries, partial saves, capacity and rejected inputs. Frontend tests cover the API client and presentation; real browser checks verify persistence and graph updates through n8n.
