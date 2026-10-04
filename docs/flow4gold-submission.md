# Flow4Gold submission demo

[Machine](../machines/flow4gold-submission.v1.json) · [Generated diagram](flow4gold-submission.mmd)

Researched 4 October 2026. Scope: one competition entry, seen by its contestant and the organizer. This is a proposed demo model, not a reconstruction of the organizer's private automation. Registration, n8n template publication, and jury selection are separate milestones.

## What the public sources establish

The organizer's latest clarification moves the submission deadline to **5 October**. Submit the template to the Creator Portal, register with a walkthrough video even while publication is pending, retain the issued PIN, and email the workflow ID to `flow4gold@flowgrammer.com` after publication. A conference ticket is required. The announcement mentions a limited `FLOW4GOLD50` discount; remaining availability was not verified. This matches the update supplied in the task. [Organizer update, reposted by n8n](https://sb.linkedin.com/company/n8n)

The public form identifies Flowgramming Studios as organizer and n8n as sponsor. Its first page asks for name, email, ticket status, privacy acknowledgment and recording consent. It describes a filmed YouTube production and still displays the old deadline. Later pages were not inspected: proceeding would submit participant information. The PIN screen and video-upload interaction therefore remain unverified firsthand. [Registration form](https://theflowgrammer.app.n8n.cloud/form/Flow4Gold)

The linked German terms name Flowgramming Studios GmbH as organizer, and Maxym Tkacz and Marcel Claus-Ahrens as judges. They specify adults with valid tickets, exclude affiliated people and certain sanctioned participants, and require original work without sensitive data. Submission materials include country, phone, template ID or JSON, an approximately two-minute public video, and screenshot. Selection emails are scheduled by 6 October; three finalists have a further conversation before a winner is chosen. Criteria are usability, completeness, error handling, output quality and motivation; weights are discretionary. A tie can use a draw. The prize is one fine-ounce gold coin; acceptance is due within seven days. Authors retain copyright and grant usage rights; recording consent applies. These terms are dated 10 September and still specify 1 October, 23:59 CEST and an unpublished template. [Participation terms, sections 1–8](https://black-water-eab9.max-e6c.workers.dev/flow4gold_teilnahmebedingungen.pdf)

The privacy notice describes n8n Data Tables as primary storage, optional Notion/Slack administration, ticket verification by n8n, manual winner screening on site, and human prize decisions. It specifies deletion of nonselected entrants' records within 60 days after the event, longer purpose-dependent retention for selected entrants, and eight years for tax-relevant prize records. These are research findings, not functionality supplied by this JSON. [Privacy notice](https://black-water-eab9.max-e6c.workers.dev/Datenschutzinformation_Flow4Gold.txt)

The conference's public Ecosystem Day is **14 October 2026, Wilhelm Studios, Berlin**. The previous day is invite-only Partner Day. [Conference site](https://n8n.io/intheloop)

## Conflicts and unknowns

| Topic | Evidence and demo treatment |
| --- | --- |
| Deadline | Use the supplied and corroborated 5 October announcement as the working date. Its precise cutoff time/timezone is unspecified; do not carry the old cutoff forward silently. No automatic expiry in this model. |
| Publication | The newer clarification permits registration without an ID. Earlier publicity had already relaxed review timing but referred to September uploads. Whether October uploads now qualify is unresolved; an admin decides ambiguous eligibility. [Earlier update](https://yu.linkedin.com/company/n8n/) |
| Notification timing | The published selection timetable predates the extension; no revised timetable was found. Keep it configurable. |
| ID follow-up | No final publication/ID deadline was found. Do not reject a timely registration because n8n review is slow. |
| PIN | Saving it is confirmed; exact length, recovery process, and whether it must appear in the email are not. PIN plus verified sender matching is a proposed adapter contract. |
| Review sequence | Public sources do not say organizers must wait for publication before reading entries. For a small demo, the formal selection queue follows ID matching; admins may inspect pending evidence at any time. |
| Other details | Finalist invitation acceptance, time slots, no-shows, correction requests and reminder cadence are proposed operational conveniences. Multiple entries, teams, review turnaround and a numeric scoring scale remain unverified. |

The Creator Portal requires sign-in; private submission screens were not accessed. [Creator login](https://creators.n8n.io/login) The LinkedIn short link did not resolve through the research tool; the supplied direct form did. Public reposts corroborate the clarification, but are less durable than a direct post permalink. No form, contest entry, email or ticket purchase was submitted during research.

## Shared process, two views

One case represents **one entry**, not one person or the entire competition. The contestant sees their status and next action. The admin sees queues over those same cases. Separate state machines for these two views would duplicate truth.

| State | Contestant view | Organizer view / next action |
| --- | --- | --- |
| `OPEN` | Prepare template, ticket and application materials. | No accepted registration yet. |
| `REGISTERED` | Application received; save your PIN. | Registration stored; determine whether a workflow ID is available. |
| `WAITING_FOR_PUBLICATION` | You are registered. Send your workflow ID after publication. | Pending-publication queue; retain original submission timestamp. |
| `ADMIN_REVIEW` | Your entry is being reviewed. | Verify evidence and eligibility; record human selection. |
| `NEEDS_INFORMATION` | See the specific question and provide a correction. | Track the missing item and reply; return to review. |
| `INVITED` | Accept or decline the invitation. | Track responses and arrange the visit. |
| `CONFIRMED` | Show visit details and check-in instructions. | Expected attendees; record arrival or confirmed no-show. |
| `JUDGING` | Live demonstration / conversation. | Jury records its decision. |
| `AWAITING_PRIZE_ACCEPTANCE` | Accept or decline the prize. | Track acceptance against the recorded announcement. |
| `CLOSED` | Display the explicit outcome. | Preserve outcome and apply the relevant retention policy. |

The main path is:

```text
OPEN → REGISTERED → WAITING_FOR_PUBLICATION → ADMIN_REVIEW
                                               ↓
                                            INVITED → CONFIRMED → JUDGING
                                                                    ↓
                                                     AWAITING_PRIZE_ACCEPTANCE → CLOSED
```

Already-published entries go from `REGISTERED` directly to `ADMIN_REVIEW`. A correction loops from review through `NEEDS_INFORMATION`. Closure distinguishes not selected, disqualified, declined, no-show, runner-up, winner, unclaimed prize and withdrawal. Registration never means finalist selection; winning selection never means prize acceptance.

## Demo implementation boundary

The JSON has **no tasks or AI decisions**. All events are explicit external facts or human actions. This keeps the first demo understandable and avoids claiming integrations exist. Optionally add AI later to summarize an entry against the five criteria and draft questions; jury selection remains human.

Suggested future record: `caseId`, `competitionId`, `submittedAt`, contestant/contact references, PIN verification reference, ticket-check result, consent/version references, title/problem/audience, video and screenshot references, template submission date, nullable published workflow ID/URL, missing-information request, reviewer notes, invitation details, jury result, prize announcement/acceptance dates, and outcome. Keep publication status separate from registration time. Use fictional entrants and mock references for the demo.

Future adapters must implement the following; state descriptions do not enforce them:

- Store a valid registration and issue its PIN before `SUBMISSION_RECEIVED`. `PUBLICATION_PENDING` explicitly accepts a missing workflow ID.
- Authenticate contestant updates and administrator actions. A PIN is a matching reference, not authority to select winners. Match an incoming ID to the correct entry and verify the published template before `WORKFLOW_LINKED`. Ambiguous matches require an admin.
- Save corrected evidence before `INFORMATION_PROVIDED`. Subsequent ID corrections must update the entry safely without resetting its lifecycle.
- Keep the three-finalist limit and single active winner in a shared competition record. Independent entry machines cannot enforce these global limits. Prize reallocation is outside this demo: a closed runner-up cannot be reopened under this version. Supporting replacement awards needs a revised lifecycle and an authorized jury decision.
- Record decision reasons, actor, time and evidence revision. Persist invitation details before acceptance; record actual arrival before judging. Verify the acceptance deadline before emitting `PRIZE_ACCEPTANCE_EXPIRED`; no timer runs in the JSON.
- Give events stable IDs, process each case sequentially and deduplicate retries. Sending acknowledgments or invitations requires its own delivery tracking; a state transition alone does not prove delivery.
- Treat withdrawal, prize decline and no-show paths as demo policy. Consent changes and disqualifications discovered after selection need organizer handling; this minimal machine does not model appeals, post-award recovery or every legal exception.

This machine is **model-only**. Open it using **Open machine** in the existing Machine explorer. The live runtime currently supports customer-refund; creating this file does not register a runtime, create forms, wire email, merge context or execute competition tasks. Replay must remain free of side effects, and recorded versions must stay immutable.

## Two-minute demo storyboard

1. **0:00–0:20 — problem:** “A contestant has submitted on time, but n8n has not issued a workflow ID. Have they registered?” Show the shared process.
2. **0:20–0:50 — waiting:** Walk a fictional entry through `SUBMISSION_RECEIVED`, `PUBLICATION_PENDING`. Show the contestant reassurance beside the admin's pending queue concept.
3. **0:50–1:15 — continuation:** Explain the later ID email and emit `WORKFLOW_LINKED`. Demonstrate `INFORMATION_REQUESTED`, then `INFORMATION_PROVIDED`.
4. **1:15–1:45 — human control:** Follow `FINALIST_SELECTED`, `INVITATION_ACCEPTED`, `CHECKED_IN`, `WINNER_SELECTED`, `PRIZE_ACCEPTED`. Explain that the jury supplies decisions.
5. **1:45–2:00 — constraint:** From a waiting entry, show that `WINNER_SELECTED` is not available. End on the clear next action for each participant.

Today this is a graph walkthrough in the explorer; contestant/admin screens and event execution are proposed next work. A useful implementation breakpoint is a local simulation with three fictional cases: pending publication, needs information, and invited. Keep email, external forms, ticket purchase and automatic judging outside that first UI demo.
