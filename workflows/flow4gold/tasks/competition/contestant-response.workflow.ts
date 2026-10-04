import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Competition - Contestant Response (Preview)
// Nodes   : 11  |  Connections: 11
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveRequest                     executeWorkflowTrigger
// TryFictionalExample                manualTrigger
// SyntheticRequest                   code
// CheckPreviewAndCaller              code
// MatchContestantAndCheckAction      code
// WhichContestantResponse            switch
// PrepareWorkflowLink                code
// PrepareClarificationEvidence       code
// PrepareParticipationDecision       code
// ReturnEventPreview                 code
// IntegrationNotes                   stickyNote
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveRequest
//    → CheckPreviewAndCaller
//      → MatchContestantAndCheckAction
//        → WhichContestantResponse
//          → PrepareWorkflowLink
//            → ReturnEventPreview
//         .out(1) → PrepareClarificationEvidence
//            → ReturnEventPreview (↩ loop)
//         .out(2) → PrepareParticipationDecision
//            → ReturnEventPreview (↩ loop)
// TryFictionalExample
//    → SyntheticRequest
//      → CheckPreviewAndCaller (↩ loop)
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'AH4T3dkJyEBoMCFe',
    name: 'Flow4Gold - Competition - Contestant Response (Preview)',
    active: false,
    isArchived: false,
    settings: { saveManualExecutions: false, saveDataErrorExecution: 'none', executionOrder: 'v1' },
})
export class Flow4goldCompetitionContestantResponsePreviewWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '9e0add00-682e-4dbc-857b-ebf287a8cb0f',
        name: 'Receive Request',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    ReceiveRequest = {
        inputSource: 'passthrough',
    };

    @node({
        id: '9462337b-4468-42b2-85fa-4c13b81777bf',
        name: 'Try Fictional Example',
        type: 'n8n-nodes-base.manualTrigger',
        version: 1,
        position: [0, 260],
    })
    TryFictionalExample = {};

    @node({
        id: '3ee61c1b-ccc1-478c-a522-18039ed13703',
        name: 'Synthetic Request',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [240, 260],
    })
    SyntheticRequest = {
        mode: 'runOnceForAllItems',
        jsCode: 'return [{ json: {"mode": "preview", "machine": "flow4gold-submission", "machineVersion": 1, "caseId": "demo-entry-alex", "requestId": "demo-info-alex", "correlationId": "demo-entry-alex", "actor": {"id": "demo-contestant-alex", "role": "contestant", "verified": true, "caseId": "demo-entry-alex"}, "caseSnapshot": {"caseId": "demo-entry-alex", "contestantId": "demo-contestant-alex"}, "response": {"action": "INFORMATION_PROVIDED", "message": "Here is the requested clarification for this fictional demo entry."}} }];',
    };

    @node({
        id: 'acee31a8-a4f6-4d21-baad-61a10a426dbe',
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
        id: 'a65f39c4-4050-4f9a-962d-84d97defe244',
        name: 'Match Contestant and Check Action',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [760, 0],
    })
    MatchContestantAndCheckAction = {
        mode: 'runOnceForAllItems',
        jsCode: `const data = $input.first().json;
const { request, caseId, requestId, correlationId, actorId } = data;
function text(value, field, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + field);
  return value.trim();
}
const snapshot = request.caseSnapshot;
if (!snapshot || snapshot.caseId !== caseId || snapshot.contestantId !== actorId) throw new Error('Contestant does not match trusted case snapshot');
const response = request.response;
if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Response is required');
const action = text(response.action, 'response.action', 100);
const allowed = ['WORKFLOW_LINKED', 'INFORMATION_PROVIDED', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED', 'WITHDRAWN', 'PRIZE_ACCEPTED', 'PRIZE_DECLINED'];
if (!allowed.includes(action)) throw new Error('Unsupported contestant action');
const actionFamily = action === 'WORKFLOW_LINKED' ? 'publication' : action === 'INFORMATION_PROVIDED' ? 'clarification' : 'decision';
return [{ json: { ...data, action, actionFamily } }];`,
    };

    @node({
        id: '63fc5202-22a1-4a7d-b592-5ff34e88682b',
        name: 'Which Contestant Response?',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [1020, 0],
    })
    WhichContestantResponse = {
        mode: 'expression',
        numberOutputs: 3,
        output: '={{ ["publication", "clarification", "decision"].indexOf($json.actionFamily) }}',
    };

    @node({
        id: '2776df20-2e44-4ec7-bf2f-df5be5371815',
        name: 'Prepare Workflow Link',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1280, -200],
    })
    PrepareWorkflowLink = {
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
const workflow = published(request.response.workflow);
return [{ json: { ...data, payload: { workflow } } }];`,
    };

    @node({
        id: '3851dfa0-7cf5-4e86-a484-a5ec07ece0c0',
        name: 'Prepare Clarification Evidence',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1280, 0],
    })
    PrepareClarificationEvidence = {
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
const response = request.response;
const payload = {};
  payload.message = text(response.message, 'response.message', 10000);
  if (response.videoUrl !== undefined) payload.videoUrl = https(response.videoUrl, 'response.videoUrl');
  if (response.workflow !== undefined) payload.workflow = published(response.workflow);
return [{ json: { ...data, payload } }];`,
    };

    @node({
        id: 'b992965d-e181-4b77-9a9f-ab22203b9657',
        name: 'Prepare Participation Decision',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1280, 200],
    })
    PrepareParticipationDecision = {
        mode: 'runOnceForAllItems',
        jsCode: `const data = $input.first().json;
// Acceptance, decline and withdrawal carry no extra evidence beyond an optional reason.
return [{ json: { ...data, payload: {} } }];`,
    };

    @node({
        id: 'a994ab6c-1e6a-4771-a019-ef529a3910ac',
        name: 'Return Event Preview',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1570, 0],
    })
    ReturnEventPreview = {
        mode: 'runOnceForAllItems',
        jsCode: `const data = $input.first().json;
const { request, caseId, requestId, correlationId, actorId } = data;
function text(value, field, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid ' + field);
  return value.trim();
}
const payload = { ...data.payload };
if (request.response.reason !== undefined) payload.reason = text(request.response.reason, 'response.reason', 2000);
const proposals = [{ type: data.action, payload }];
const events = proposals.map(({ type, payload }, index) => {
  const event = { eventId: JSON.stringify([caseId, requestId, type]), caseId,
    machine: request.machine, machineVersion: request.machineVersion, type,
    payload: { ...payload, actorId }, correlationId };
  if (index > 0) event.causationId = JSON.stringify([caseId, requestId, proposals[index - 1].type]);
  return event;
});
const effects = [{ type: 'persist_contestant_response', status: 'required_before_dispatch', contestantId: actorId }];
return [{ json: { mode: 'preview', persisted: false, dispatched: false, machine: request.machine, machineVersion: request.machineVersion,
  caseId, correlationId, events, effects, integration: { runtime: 'unbound', identity: 'trusted-caller-required', storage: 'unbound' } } }];`,
    };

    @node({
        id: '622f7b57-2fcb-4e39-9641-505c21c98f1c',
        name: 'Integration Notes',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [460, -510],
    })
    IntegrationNotes = {
        content: `## Preview integration boundary
Left to right: check caller → validate evidence → route response → return event proposals.

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
        this.CheckPreviewAndCaller.out(0).to(this.MatchContestantAndCheckAction.in(0));
        this.MatchContestantAndCheckAction.out(0).to(this.WhichContestantResponse.in(0));
        this.WhichContestantResponse.out(0).to(this.PrepareWorkflowLink.in(0));
        this.WhichContestantResponse.out(1).to(this.PrepareClarificationEvidence.in(0));
        this.WhichContestantResponse.out(2).to(this.PrepareParticipationDecision.in(0));
        this.PrepareWorkflowLink.out(0).to(this.ReturnEventPreview.in(0));
        this.PrepareClarificationEvidence.out(0).to(this.ReturnEventPreview.in(0));
        this.PrepareParticipationDecision.out(0).to(this.ReturnEventPreview.in(0));
    }
}
