import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold Competition - Handle Organizer Action (Preview)
// Nodes   : 14  |  Connections: 16
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveTask                        executeWorkflowTrigger
// RunFictionalDemo                   manualTrigger
// FictionalDemoInput                 set
// ValidateTrustedOrganizerRequest    code
// PrepareDecisionEvidence            code
// RouteOrganizerAction               switch
// RecordMissingInformation           code
// ValidateHumanJuryDecision          code
// ValidateAttendanceEvidence         code
// VerifyAcceptanceExpiry             code
// RecordDisqualificationReason       code
// PrepareStableDomainEvent           code
// ReturnUndispatchedPreview          code
// IntegrationBoundary                stickyNote
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveTask
//    → ValidateTrustedOrganizerRequest
//      → PrepareDecisionEvidence
//        → RouteOrganizerAction
//          → RecordMissingInformation
//            → PrepareStableDomainEvent
//              → ReturnUndispatchedPreview
//         .out(1) → ValidateHumanJuryDecision
//            → PrepareStableDomainEvent (↩ loop)
//         .out(2) → ValidateAttendanceEvidence
//            → PrepareStableDomainEvent (↩ loop)
//         .out(3) → VerifyAcceptanceExpiry
//            → PrepareStableDomainEvent (↩ loop)
//         .out(4) → RecordDisqualificationReason
//            → PrepareStableDomainEvent (↩ loop)
// RunFictionalDemo
//    → FictionalDemoInput
//      → ValidateTrustedOrganizerRequest (↩ loop)
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'II9743VhDIHuMPiO',
    name: 'Flow4Gold Competition - Handle Organizer Action (Preview)',
    active: true,
    isArchived: false,
    settings: { saveManualExecutions: false, saveDataErrorExecution: 'none', executionOrder: 'v1' },
})
export class Flow4goldCompetitionHandleOrganizerActionPreviewWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '9d5abcf0-6d45-4a96-a4b8-223a67153ab5',
        name: 'Receive Task',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [-600, 0],
    })
    ReceiveTask = {
        inputSource: 'passthrough',
    };

    @node({
        id: '0a60f9e1-b72f-4d68-910b-47886033b35f',
        name: 'Run Fictional Demo',
        type: 'n8n-nodes-base.manualTrigger',
        version: 1,
        position: [-860, 260],
    })
    RunFictionalDemo = {};

    @node({
        id: '028b472f-82bf-4e3b-a489-9ba198d8421e',
        name: 'Fictional Demo Input',
        type: 'n8n-nodes-base.set',
        version: 3.5,
        position: [-600, 260],
    })
    FictionalDemoInput = {
        mode: 'manual',
        assignments: {
            assignments: [
                {
                    id: 'mode',
                    name: 'mode',
                    type: 'string',
                    value: 'preview',
                },
                {
                    id: 'caseId',
                    name: 'caseId',
                    type: 'string',
                    value: 'demo-entry-001',
                },
                {
                    id: 'requestId',
                    name: 'requestId',
                    type: 'string',
                    value: 'demo-admin-001',
                },
                {
                    id: 'correlationId',
                    name: 'correlationId',
                    type: 'string',
                    value: 'demo-competition-001',
                },
                {
                    id: 'machine',
                    name: 'machine',
                    type: 'string',
                    value: 'flow4gold-submission',
                },
                {
                    id: 'machineVersion',
                    name: 'machineVersion',
                    type: 'number',
                    value: 1,
                },
                {
                    id: 'actor',
                    name: 'actor',
                    type: 'object',
                    value: {
                        id: 'demo-organizer',
                        role: 'organizer',
                        verified: true,
                    },
                },
                {
                    id: 'action',
                    name: 'action',
                    type: 'string',
                    value: 'INFORMATION_REQUESTED',
                },
                {
                    id: 'evidence',
                    name: 'evidence',
                    type: 'object',
                    value: {
                        reason: 'Video audio is unclear.',
                        revision: 'demo-revision-1',
                        question: 'Please provide a video with audible narration.',
                    },
                },
            ],
        },
        options: {},
    };

    @node({
        id: 'bf2e827e-994a-43a3-9472-6c73f67fed76',
        name: 'Validate Trusted Organizer Request',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [-330, 0],
    })
    ValidateTrustedOrganizerRequest = {
        mode: 'runOnceForAllItems',
        jsCode: `const items = $input.all();
if (items.length !== 1) throw new Error('One organizer request required');
const x = items[0].json;
if (x.mode !== 'preview') throw new Error('Only preview mode is supported');
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
for (const key of ['caseId','requestId','correlationId']) required(x[key], key);
if (x.machine !== 'flow4gold-submission' || x.machineVersion !== 1) throw new Error('Unsupported machine/version');
if (!x.actor || x.actor.role !== 'organizer' || x.actor.verified !== true) throw new Error('Verified organizer assertion required from trusted caller');
required(x.actor.id, 'actor.id');
const actions = ['INFORMATION_REQUESTED','ENTRY_DISQUALIFIED','FINALIST_SELECTED','NOT_SELECTED','CHECKED_IN','NO_SHOW_RECORDED','WINNER_SELECTED','RUNNER_UP_SELECTED','PRIZE_ACCEPTANCE_EXPIRED'];
if (!actions.includes(x.action)) throw new Error('Unsupported organizer action');
const evidence = x.evidence;
if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('Evidence required');
return [{json: x}];`,
    };

    @node({
        id: '9ed47de4-8d13-4653-8a81-d748bb2dc7b3',
        name: 'Prepare Decision Evidence',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [-60, 0],
    })
    PrepareDecisionEvidence = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = { actor: { id: x.actor.id, role: 'organizer' }, reason: required(evidence.reason, 'evidence.reason'), evidenceRevision: required(evidence.revision, 'evidence.revision') };
const obligations = ['Authenticate organizer outside this callable workflow; payload verified=true is not authentication.', 'Persist evidence and deduplicate requestId before dispatch.', 'Runtime must serialize case events and validate the current state.'];
return [{json: {...x, payload, obligations}}];`,
    };

    @node({
        id: '88ab7a35-25e9-441f-aff8-898160156179',
        name: 'Route Organizer Action',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [220, 0],
    })
    RouteOrganizerAction = {
        mode: 'expression',
        numberOutputs: 5,
        output: '={{ ($json.action === "INFORMATION_REQUESTED") ? 0 : ($json.action === "FINALIST_SELECTED" || $json.action === "WINNER_SELECTED" || $json.action === "RUNNER_UP_SELECTED" || $json.action === "NOT_SELECTED") ? 1 : ($json.action === "CHECKED_IN" || $json.action === "NO_SHOW_RECORDED") ? 2 : ($json.action === "PRIZE_ACCEPTANCE_EXPIRED") ? 3 : ($json.action === "ENTRY_DISQUALIFIED") ? 4 : -1 }}',
    };

    @node({
        id: '568d20f9-30f7-4c8c-bc5b-a8a1efc47195',
        name: 'Record Missing Information',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [560, -440],
    })
    RecordMissingInformation = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = {...x.payload};
const obligations = [...x.obligations];
payload.question = required(evidence.question, 'evidence.question');
return [{json: {...x, payload, obligations}}];`,
    };

    @node({
        id: 'ff820afb-f746-41b4-b453-c69eab286750',
        name: 'Validate Human Jury Decision',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [560, -220],
    })
    ValidateHumanJuryDecision = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = {...x.payload};
const obligations = [...x.obligations];
if (['FINALIST_SELECTED','WINNER_SELECTED','RUNNER_UP_SELECTED','NOT_SELECTED'].includes(x.action)) payload.juryDecisionId = required(evidence.juryDecisionId, 'evidence.juryDecisionId');
if (x.action === 'FINALIST_SELECTED' || x.action === 'WINNER_SELECTED') {
  payload.competitionId = required(x.competitionId, 'competitionId');
  obligations.push(x.action === 'FINALIST_SELECTED' ? 'Atomically reserve one of three finalist slots in shared competition storage before dispatch.' : 'Atomically reserve the single winner slot in shared competition storage before dispatch.');
}
if (x.action === 'FINALIST_SELECTED') payload.invitationDetails = required(evidence.invitationDetails, 'evidence.invitationDetails');

return [{json: {...x, payload, obligations}}];`,
    };

    @node({
        id: 'a47452ab-8262-4297-aced-4522adf9465a',
        name: 'Validate Attendance Evidence',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [560, 0],
    })
    ValidateAttendanceEvidence = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = {...x.payload};
const obligations = [...x.obligations];
payload.attendanceRecord = required(evidence.attendanceRecord, 'evidence.attendanceRecord');
return [{json: {...x, payload, obligations}}];`,
    };

    @node({
        id: '0f83bc20-2a24-4dab-be1f-c634c8052920',
        name: 'Verify Acceptance Expiry',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [560, 220],
    })
    VerifyAcceptanceExpiry = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = {...x.payload};
const obligations = [...x.obligations];
if (x.action === 'PRIZE_ACCEPTANCE_EXPIRED') {
  const deadline = required(evidence.acceptanceDeadline, 'evidence.acceptanceDeadline');
  const checkedAt = required(evidence.checkedAt, 'evidence.checkedAt');
  if (!Number.isFinite(Date.parse(deadline)) || !Number.isFinite(Date.parse(checkedAt)) || Date.parse(checkedAt) <= Date.parse(deadline) || evidence.noAcceptanceRecorded !== true) throw new Error('Expiry requires checked time after deadline and verified absence of acceptance');
  Object.assign(payload, { acceptanceDeadline: deadline, checkedAt, noAcceptanceRecorded: true });
  obligations.push('Recheck deadline and absence of acceptance under the same case lock before dispatch.');
}

return [{json: {...x, payload, obligations}}];`,
    };

    @node({
        id: '274d9533-1b97-421d-9fd9-cf21348ef44c',
        name: 'Record Disqualification Reason',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [560, 440],
    })
    RecordDisqualificationReason = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = {...x.payload};
const obligations = [...x.obligations];
// Common evidence already requires the organizer reason and revision.
return [{json: {...x, payload, obligations}}];`,
    };

    @node({
        id: 'f75c9483-6634-404f-8d4c-3f0c57aef1e9',
        name: 'Prepare Stable Domain Event',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [880, 0],
    })
    PrepareStableDomainEvent = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const event = {eventId: JSON.stringify([x.caseId, x.requestId, x.action]), caseId: x.caseId, machine: x.machine, machineVersion: x.machineVersion, type: x.action, payload: x.payload, correlationId: x.correlationId};
return [{json: {...x, event}}];`,
    };

    @node({
        id: '053c38d9-9459-4738-83cd-9da1e1ce7747',
        name: 'Return Undispatched Preview',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1160, 0],
    })
    ReturnUndispatchedPreview = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
return [{json: {mode:'preview',persisted:false,dispatched:false,machine:x.machine,machineVersion:x.machineVersion,caseId:x.caseId,correlationId:x.correlationId,events:[x.event],effects:[],integration:{runtime:'unbound',identity:'trusted-caller-required',storage:'unbound',obligations:x.obligations}}}];`,
    };

    @node({
        id: '98d2cc06-d334-4d51-a6a3-a3204793f047',
        name: 'Integration Boundary',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [-880, -430],
    })
    IntegrationBoundary = {
        content: `## Organizer action — preview only
1. Validate the trusted organizer request.
2. Route to question, jury, attendance, expiry or disqualification evidence.
3. Prepare a stable event proposal.

No persistence or runtime dispatch. The runtime owns legal transitions. Before real dispatch authenticate actors, save evidence, deduplicate requests, and atomically enforce three finalist slots / one winner across the competition.`,
        height: 280,
        width: 950,
        color: 5,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ReceiveTask.out(0).to(this.ValidateTrustedOrganizerRequest.in(0));
        this.RunFictionalDemo.out(0).to(this.FictionalDemoInput.in(0));
        this.FictionalDemoInput.out(0).to(this.ValidateTrustedOrganizerRequest.in(0));
        this.ValidateTrustedOrganizerRequest.out(0).to(this.PrepareDecisionEvidence.in(0));
        this.PrepareDecisionEvidence.out(0).to(this.RouteOrganizerAction.in(0));
        this.RouteOrganizerAction.out(0).to(this.RecordMissingInformation.in(0));
        this.RouteOrganizerAction.out(1).to(this.ValidateHumanJuryDecision.in(0));
        this.RouteOrganizerAction.out(2).to(this.ValidateAttendanceEvidence.in(0));
        this.RouteOrganizerAction.out(3).to(this.VerifyAcceptanceExpiry.in(0));
        this.RouteOrganizerAction.out(4).to(this.RecordDisqualificationReason.in(0));
        this.RecordMissingInformation.out(0).to(this.PrepareStableDomainEvent.in(0));
        this.ValidateHumanJuryDecision.out(0).to(this.PrepareStableDomainEvent.in(0));
        this.ValidateAttendanceEvidence.out(0).to(this.PrepareStableDomainEvent.in(0));
        this.VerifyAcceptanceExpiry.out(0).to(this.PrepareStableDomainEvent.in(0));
        this.RecordDisqualificationReason.out(0).to(this.PrepareStableDomainEvent.in(0));
        this.PrepareStableDomainEvent.out(0).to(this.ReturnUndispatchedPreview.in(0));
    }
}
