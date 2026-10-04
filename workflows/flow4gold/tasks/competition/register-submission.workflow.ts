import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Competition - Register Submission (Preview)
// Nodes   : 10  |  Connections: 9
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveRequest                     executeWorkflowTrigger
// TryFictionalExample                manualTrigger
// SyntheticRequest                   code
// CheckPreviewAndCaller              code
// ValidateRegistrationEvidence       code
// PublishedWorkflowProvided          if
// PreparePublishedEntry              code
// PreparePendingPublication          code
// ReturnEventPreview                 code
// IntegrationNotes                   stickyNote
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveRequest
//    → CheckPreviewAndCaller
//      → ValidateRegistrationEvidence
//        → PublishedWorkflowProvided
//          → PreparePublishedEntry
//            → ReturnEventPreview
//         .out(1) → PreparePendingPublication
//            → ReturnEventPreview (↩ loop)
// TryFictionalExample
//    → SyntheticRequest
//      → CheckPreviewAndCaller (↩ loop)
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'VJci6tpJ4SncQfbJ',
    name: 'Flow4Gold - Competition - Register Submission (Preview)',
    active: true,
    isArchived: false,
    settings: { saveManualExecutions: false, saveDataErrorExecution: 'none', executionOrder: 'v1' },
})
export class Flow4goldCompetitionRegisterSubmissionPreviewWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'fc42a1ff-904a-43ef-9254-051c1dc415ad',
        name: 'Receive Request',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    ReceiveRequest = {
        inputSource: 'passthrough',
    };

    @node({
        id: 'df5a3025-a5fe-4f7c-ad3e-7410f65783ab',
        name: 'Try Fictional Example',
        type: 'n8n-nodes-base.manualTrigger',
        version: 1,
        position: [0, 260],
    })
    TryFictionalExample = {};

    @node({
        id: '6983c498-c59d-4bfa-bd0d-e30dce1559f2',
        name: 'Synthetic Request',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [240, 260],
    })
    SyntheticRequest = {
        mode: 'runOnceForAllItems',
        jsCode: 'return [{ json: {"mode": "preview", "machine": "flow4gold-submission", "machineVersion": 1, "caseId": "demo-entry-alex", "requestId": "demo-register-alex", "correlationId": "demo-entry-alex", "actor": {"id": "demo-contestant-alex", "role": "contestant", "verified": true, "caseId": "demo-entry-alex"}, "submission": {"contestantName": "Alex Example", "email": "alex@example.invalid", "title": "A useful demo workflow", "videoUrl": "https://example.invalid/video/alex", "templateSubmitted": true, "ticketConfirmed": true, "privacyConsent": true, "recordingConsent": true}} }];',
    };

    @node({
        id: '5744d87e-efba-48e1-adb7-5a729cfaf430',
        name: 'Check Preview and Caller',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [500, 0],
    })
    CheckPreviewAndCaller = {
        mode: 'runOnceForAllItems',
        jsCode: `const items = $input.all();
if (items.length !== 1) throw new Error('Expected exactly one request');
const request = items[0].json;
function text(value, field, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + field);
  return value.trim();
}
if (request.mode !== 'preview') throw new Error('Preview only: runtime and storage are unbound');
if (request.machine !== 'flow4gold-submission' || request.machineVersion !== 1) throw new Error('Unsupported machine identity');
const caseId = text(request.caseId, 'caseId', 200);
const requestId = text(request.requestId, 'requestId', 200);
const correlationId = text(request.correlationId, 'correlationId', 200);
const actor = request.actor;
if (!actor || actor.role !== 'contestant' || actor.verified !== true || actor.caseId !== caseId) throw new Error('Trusted contestant caller attestation is required');
const actorId = text(actor.id, 'actor.id', 200);
return [{ json: { request, caseId, requestId, correlationId, actorId } }];`,
    };

    @node({
        id: '97cbeb04-8539-45c7-ba79-4e6bafe5f619',
        name: 'Validate Registration Evidence',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [760, 0],
    })
    ValidateRegistrationEvidence = {
        mode: 'runOnceForAllItems',
        jsCode: `const data = $input.first().json;
const { request, caseId, requestId, correlationId, actorId } = data;
function text(value, field, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + field);
  return value.trim();
}
function https(value, field) {
  const normalized = text(value, field, 2000);
  if (!/^https:\\/\\/[^\\s/?#@]+(?:[/?#][^\\s]*)?$/.test(normalized)) throw new Error('Expected HTTPS URL for ' + field);
  return normalized;
}
const submission = request.submission;
if (!submission || typeof submission !== 'object' || Array.isArray(submission)) throw new Error('Submission is required');
const email = text(submission.email, 'submission.email', 254).toLowerCase();
if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw new Error('Invalid contestant email');
for (const field of ['templateSubmitted', 'ticketConfirmed', 'privacyConsent', 'recordingConsent']) {
  if (submission[field] !== true) throw new Error('Submission requires ' + field);
}
const evidence = { contestantName: text(submission.contestantName, 'submission.contestantName', 200), email,
  title: text(submission.title, 'submission.title', 300), videoUrl: https(submission.videoUrl, 'submission.videoUrl'),
  templateSubmitted: true, ticketConfirmed: true, privacyConsent: true, recordingConsent: true };
return [{ json: { ...data, evidence, hasPublishedWorkflow: submission.publishedWorkflow != null } }];`,
    };

    @node({
        id: '3a9e8754-4861-4c61-a168-5401ae8abda2',
        name: 'Published Workflow Provided?',
        type: 'n8n-nodes-base.if',
        version: 2.3,
        position: [1020, 0],
    })
    PublishedWorkflowProvided = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
                version: 2,
            },
            conditions: [
                {
                    id: '9339f4af-cd38-4b8f-aa02-c6b675e71eeb',
                    leftValue: '={{ $json.hasPublishedWorkflow }}',
                    rightValue: true,
                    operator: {
                        type: 'boolean',
                        operation: 'equals',
                    },
                },
            ],
            combinator: 'and',
        },
        options: {},
    };

    @node({
        id: 'a489457e-6a1a-4176-9eff-da38251413a1',
        name: 'Prepare Published Entry',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1280, -120],
    })
    PreparePublishedEntry = {
        mode: 'runOnceForAllItems',
        jsCode: `const data = $input.first().json;
const { request, caseId, requestId, correlationId, actorId } = data;
function text(value, field, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + field);
  return value.trim();
}
function https(value, field) {
  const normalized = text(value, field, 2000);
  if (!/^https:\\/\\/[^\\s/?#@]+(?:[/?#][^\\s]*)?$/.test(normalized)) throw new Error('Expected HTTPS URL for ' + field);
  return normalized;
}
function published(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Published workflow evidence is required');
  const id = text(value.id, 'workflow.id', 30);
  if (!/^[1-9][0-9]*$/.test(id)) throw new Error('Workflow ID must be a positive numeric template ID');
  const url = https(value.url, 'workflow.url');
  if (!new RegExp('^https://n8n\\\\.io/workflows/' + id + '(?:[-/?#]|$)').test(url)) throw new Error('Workflow URL must match the n8n template ID');
  return { id, url, verificationReference: text(value.verificationReference, 'workflow.verificationReference') };
}
const workflow = published(request.submission.publishedWorkflow);
return [{ json: { ...data, proposals: [
  { type: 'SUBMISSION_RECEIVED', payload: { submission: { ...data.evidence, publishedWorkflow: workflow } } },
] } }];`,
    };

    @node({
        id: '17806baf-c7f9-45cd-9f46-cd6ababba735',
        name: 'Prepare Pending Publication',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1280, 140],
    })
    PreparePendingPublication = {
        mode: 'runOnceForAllItems',
        jsCode: `const data = $input.first().json;
return [{ json: { ...data, proposals: [
  { type: 'SUBMISSION_RECEIVED', payload: { submission: data.evidence } },
] } }];`,
    };

    @node({
        id: 'b686811c-9fa8-4d7a-a67c-10d9d3cc5f5c',
        name: 'Return Event Preview',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1570, 0],
    })
    ReturnEventPreview = {
        mode: 'runOnceForAllItems',
        jsCode: `const data = $input.first().json;
const { request, caseId, requestId, correlationId, actorId } = data;
const proposals = data.proposals;
const events = proposals.map(({ type, payload }, index) => {
  const event = { eventId: JSON.stringify([caseId, requestId, type]), caseId,
    machine: request.machine, machineVersion: request.machineVersion, type,
    payload: { ...payload, actorId }, correlationId };
  if (index > 0) event.causationId = JSON.stringify([caseId, requestId, proposals[index - 1].type]);
  return event;
});
const effects = [{ type: 'persist_registration', status: 'required_before_dispatch', contestantId: actorId },
  { type: 'issue_and_store_pin', status: 'unbound', note: 'Secure issuance, hashed storage and private delivery belong to the registration adapter. No PIN was issued.' }];
return [{ json: { mode: 'preview', persisted: false, dispatched: false, machine: request.machine, machineVersion: request.machineVersion,
  caseId, correlationId, events, effects, integration: { runtime: 'unbound', identity: 'trusted-caller-required', storage: 'unbound' } } }];`,
    };

    @node({
        id: '293a48ae-0076-4b4f-9765-98443c52cd48',
        name: 'Integration Notes',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [460, -510],
    })
    IntegrationNotes = {
        content: `## Preview integration boundary
Left to right: check caller → validate evidence → route response → return one registration event. The REGISTERED state task determines publication status.

Manual execution uses fictional data. Caller identity flags and publication references are attestations only. No authentication, case persistence, PIN issuance, email or runtime dispatch happens here. The generic runtime owns state transitions and deduplication.`,
        height: 240,
        width: 1150,
        color: 5,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ReceiveRequest.out(0).to(this.CheckPreviewAndCaller.in(0));
        this.TryFictionalExample.out(0).to(this.SyntheticRequest.in(0));
        this.SyntheticRequest.out(0).to(this.CheckPreviewAndCaller.in(0));
        this.CheckPreviewAndCaller.out(0).to(this.ValidateRegistrationEvidence.in(0));
        this.ValidateRegistrationEvidence.out(0).to(this.PublishedWorkflowProvided.in(0));
        this.PublishedWorkflowProvided.out(0).to(this.PreparePublishedEntry.in(0));
        this.PublishedWorkflowProvided.out(1).to(this.PreparePendingPublication.in(0));
        this.PreparePublishedEntry.out(0).to(this.ReturnEventPreview.in(0));
        this.PreparePendingPublication.out(0).to(this.ReturnEventPreview.in(0));
    }
}
