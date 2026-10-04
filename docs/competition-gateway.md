# Competition gateway

The [Competition Gateway](https://n8n.last-butnotleast.com/workflow/DH0auiC9UkXNBfRz) connects the existing competition adapters to [Core Runtime](https://n8n.last-butnotleast.com/workflow/frF2jemAeCrcFPDe). Both are deployed. The three event-producing competition adapters are published because this n8n instance requires active subworkflows. The notification renderer remains a separate preview workflow and is not called by this gateway.

The local frontend bridge calls `POST /webhook/flow4gold-competition` using the server-held header credential. Trusted n8n workflows can still use Execute Sub-workflow and wait for the same result. Both entry points share the same validation.

Request envelope:

```json
{
  "adapter": "register",
  "input": {
    "caseId": "entry-001",
    "requestId": "registration-001",
    "correlationId": "entry-001",
    "actor": {
      "id": "fictional-contestant",
      "role": "contestant",
      "verified": true,
      "caseId": "entry-001"
    },
    "submission": {
      "contestantName": "Demo Contestant",
      "email": "contestant@example.invalid",
      "title": "Example workflow",
      "videoUrl": "https://example.invalid/demo",
      "templateSubmitted": true,
      "ticketConfirmed": true,
      "privacyConsent": true,
      "recordingConsent": true
    }
  }
}
```

Supported adapters are `register`, `contestant`, and `organizer`; IDs are mapped internally. Input shapes are described in [the task contract](competition-tasks.md). The gateway supplies `mode: preview`, `machine: flow4gold-submission`, and `machineVersion: 1` to the business adapter. That mode means the adapter itself does not persist. The gateway then submits the adapter's events to the core and returns `mode: persist` with actual core results. Submission v2 remains a direct-core version comparison, not a version supported by these domain adapters.

```text
Trusted request → domain adapter → proposed events
                                    ↓
                  core event 1 → check result → core event 2 (registration only)
                                    ↓
                         return actual persistence results
```

Registration produces two events; other actions produce one. Each core call finishes before the next begins. A rejected first event stops the batch. A second-event rejection reports `partial`; an ambiguous/error response reports `uncertain`. The gateway never claims the whole batch succeeded just because the adapter returned successfully.

Result fields include `status`, `persisted`, `partiallyPersisted`, `appliedCount`, `duplicateCount`, `events`, `results`, and `unattemptedEventIds`. Reuse the same request ID and content for a retry: accepted events return `duplicate`, not another append. No batch transaction is provided.

Only trusted internal callers may assert actor identity or provide a case snapshot. `actor.verified` is not authentication. The local API constructs actor assertions, loads case evidence, and serializes its actions with three-finalist/one-winner limits. These are local workbench controls, not a public authentication service or an atomic reservation across other writers. PIN issuance and email delivery remain unimplemented. Effects are returned as previews and `notification.delivered` is false. Independent organizer events omit `causationId`; a request ID is not a recorded event ID.

## Verification

[Live proof](generic-runtime-proof.json) records the successful integration check. To repeat it, generate the disposable authenticated driver:

```bash
node scripts/test-generic-live.mjs --build-driver --competition-gateway-id DH0auiC9UkXNBfRz
```

Publish and activate that driver only while testing, then run:

```bash
node scripts/test-generic-live.mjs --run --report-file /tmp/generic-live-report.json
```

The script creates fictional cases and invokes real Jev diagnosis. It never submits an approval. Remove the generated driver locally and remotely afterwards; no general-purpose test webhook is left active in the deployed setup.
