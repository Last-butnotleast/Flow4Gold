# Competition task workflows

Four inactive, callable n8n workflows implement the competition demo's validation, event preparation and message rendering. Open a workflow and run its manual trigger to try a fictional example. Each also accepts one item through Execute Workflow Trigger for a future trusted adapter/runtime.

Remote folder: [flow4gold / tasks / competition](https://n8n.last-butnotleast.com/projects/8d5DQtHZkgLco5Yr/folders/r90iXDJhFZqYtA6U/workflows), created inside the requested `tasks` folder (`By4h7JBZP1jANqh8`). Sources: `workflows/flow4gold/tasks/competition/`.

| Source | Implemented behavior |
| --- | --- |
| [Register submission](https://n8n.last-butnotleast.com/workflow/VJci6tpJ4SncQfbJ) (`register-submission.workflow.ts`) | Validate submission evidence; prepare `SUBMISSION_RECEIVED`, followed by `PUBLICATION_PENDING` or `WORKFLOW_LINKED`. Missing publication ID is accepted. |
| [Contestant response](https://n8n.last-butnotleast.com/workflow/AH4T3dkJyEBoMCFe) (`contestant-response.workflow.ts`) | Match trusted contestant/case identity; validate publication evidence, clarification, invitation/prize response or withdrawal; prepare one event. |
| [Organizer action](https://n8n.last-butnotleast.com/workflow/II9743VhDIHuMPiO) (`handle-organizer-action.workflow.ts`) | Validate organizer assertions and action-specific evidence; prepare review, finalist, attendance, judging or checked prize-expiry events. |
| [Notify participant](https://n8n.last-butnotleast.com/workflow/u98rBfeXu4I66zMP) (`notify-participant.workflow.ts`) | Render plain-text email for entered state/final outcome; return a preview with a stable delivery key. No domain event. |

These workflows **do not register real entries, authenticate users, persist evidence/PINs, dispatch events, reserve finalist/winner slots or send email**. They explicitly return `mode: "preview"`, `persisted: false`, `dispatched: false` and unbound integration markers. Notification also returns `delivered: false`. Stable identifiers support future deduplication; no durable deduplication is currently implemented.

The existing runtime remains untouched because it is refund-specific. No competition events are sent to it. The reference `machines/flow4gold-submission.v1.json` remains unchanged. A future task-bearing machine version must be saved through the editor/API into `machine_definitions`; recorded versions remain immutable.

## Reading the canvas

The workflows separate intake checks, domain branching and output preparation. Read each canvas left to right: the internal trigger and fictional demo converge into validation, native If/Switch nodes expose the business branches, focused nodes handle the evidence or message for that branch, and a shared final node returns the preview contract. Sticky notes identify the phases and integration boundary.

The branches choose task behavior; they do not decide which state transition is legal. The generic runtime remains responsible for transition validation and persistence.

## Common adapter contract

Registration, contestant response and organizer action take:

```json
{
  "mode": "preview",
  "machine": "flow4gold-submission",
  "machineVersion": 1,
  "caseId": "demo-entry-alex",
  "requestId": "demo-request-001",
  "correlationId": "demo-entry-alex",
  "actor": { "id": "demo-contestant-alex", "role": "contestant", "verified": true, "caseId": "demo-entry-alex" }
}
```

`actor.verified` is an assertion from a trusted internal caller, not authentication. Never expose these raw payloads as a public form or webhook. Organizer uses role `organizer`; contestant requests bind `actor.caseId` to `caseId`.

Outputs share `machine`, `machineVersion`, `caseId`, `correlationId`, `events`, `effects` and `integration`. Events contain `eventId`, `caseId`, machine identity, `type`, `payload` and `correlationId`. Registration's second event cites its first event as `causationId`; dispatch them sequentially after durable registration. Reuse the same `requestId` on retries. A trusted dispatcher must reject changed payloads under the same identity and validate legal transitions against the stored machine, never these task workflows.

### Registration

Add `submission` containing `contestantName`, `email`, `title`, HTTPS `videoUrl`, and true assertions `templateSubmitted`, `ticketConfirmed`, `privacyConsent`, `recordingConsent`. These are demo intake requirements, not independent verification of official contest eligibility. An optional `publishedWorkflow` has positive numeric template `id`, matching `https://n8n.io/workflows/<id>...` URL, and caller-provided `verificationReference`. The workflow validates their shape; publication verification belongs upstream.

The registration event stores the normalized submission in `payload.submission` and the contestant identity in `payload.actorId`. A future projection should record `{caseId, contestantId: payload.actorId, ...payload.submission}`. Persist identity/evidence and issue/store a stable PIN securely before acknowledging registration. The workflow deliberately does not generate a PIN that would change on retries.

### Contestant response

Add a trusted `caseSnapshot: {caseId, contestantId}` and `response: {action, ...}`. `action` is one of `WORKFLOW_LINKED`, `INFORMATION_PROVIDED`, `INVITATION_ACCEPTED`, `INVITATION_DECLINED`, `WITHDRAWN`, `PRIZE_ACCEPTED`, `PRIZE_DECLINED`.

`WORKFLOW_LINKED` needs `response.workflow` with the same evidence shape as `publishedWorkflow`. `INFORMATION_PROVIDED` needs `response.message`, optionally HTTPS `videoUrl` and `workflow`. Every action optionally accepts `reason`. The caller authenticates the PIN/session and loads the snapshot; merely possessing a case ID is insufficient.

### Organizer action

Add `action` and `evidence: {reason, revision, ...}`. Supported events: `INFORMATION_REQUESTED`, `ENTRY_DISQUALIFIED`, `FINALIST_SELECTED`, `NOT_SELECTED`, `CHECKED_IN`, `NO_SHOW_RECORDED`, `WINNER_SELECTED`, `RUNNER_UP_SELECTED`, `PRIZE_ACCEPTANCE_EXPIRED`.

Additional evidence:

- Information requests: `question`.
- Jury decisions: `juryDecisionId` for finalist, winner, runner-up and not-selected.
- Finalist/winner: top-level `competitionId`; finalist also needs `invitationDetails`.
- Attendance: `attendanceRecord`.
- Prize expiry: parseable `acceptanceDeadline`, later `checkedAt`, and `noAcceptanceRecorded: true`.

The future dispatcher must atomically reserve at most three finalist slots and one winner across the competition. Prize expiry must be rechecked under the same case lock as the transition. Human jury evidence is recorded; no AI chooses winners.

### Notification

Accepts `{mode:"preview", caseId, machine, machineVersion, state, task:"notify_participant", triggerEventId, taskInvocationId, correlationId, input}`. `taskInvocationId` must equal `triggerEventId + ":notify_participant"`.

`input` includes `recipientEmail`, `recipientVerified: true` and HTTPS `responseUrl`, resolved from trusted case/configuration data. Additional template values: `registrationPin` for REGISTERED, `question` for NEEDS_INFORMATION, `invitationDetails` for INVITED/CONFIRMED, `acceptanceDeadline` for AWAITING_PRIZE_ACCEPTANCE, and known `outcome` for CLOSED (`reason` for DISQUALIFIED). Registration PIN is only supplied after durable issuance; never use real PINs in manual fixtures. Outcome messages distinguish prize acceptance from prize delivery.

The effect has `type: "notification"`, `status: "preview"`, `channel: "email"`, `to`, `subject`, `text`, and `deliveryKey`. A future provider adapter needs a persistent outbox, unique delivery keys and provider idempotency. Invoke for newly accepted transitions only; replay never executes tasks or sends notifications.

## Demo sequence

1. Open Register Submission and run the fictional example: inspect the two proposed events, including publication pending.
2. Open Contestant Response: run its clarification example, or supply published workflow evidence with action WORKFLOW_LINKED.
3. Open Handle Organizer Action: inspect an information-request proposal; select other actions with their required evidence.
4. Open Notify Participant: inspect the rendered request for information. Nothing is emailed.

These are isolated callable previews. Connecting them into a persisted contestant/admin journey requires the generic runtime binding, trusted ingress, record projections and delivery adapter described above.

## Validation and deployment

`npm run validate` includes all four competition sources alongside the existing project workflows. Focused tests execute the serialized n8n Code node logic and synthetic fixtures; they do not claim live n8n execution or external delivery.

Use `npm run n8n -- push <source> --verify` per intended source and preserve inactive status. Folder sync mirrors `flow4gold/tasks/competition`. Do not accept flat placement as completion. The public workflow API does not return folder membership; validate the parent chain and new folder's workflow count as well as CLI folder-sync placement. The active environment's status probe reported `invalid-api-key`, but authenticated workflow/folder API calls succeeded; no credential or environment configuration was changed.

Deployment verified on 2026-10-04: all four individual pushes passed `--verify`; remote workflows have `active: false` and no published version. The new competition folder reports four workflows and the exact requested parent ID. `npm run validate` passed all 13 workflow sources and generated-source checks. Worker checks passed 5 contestant scenarios and 33 organizer/notification assertions. Live manual execution has not been run through the n8n UI.
