import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Competition Gateway
// Nodes   : 12  |  Connections: 10
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// TrustedInternalRequest             executeWorkflowTrigger
// CompetitionServerWebhook           webhook                    [creds]
// ExtractWebhookBody                 code
// PrepareAdapter                     code
// AdapterInput                       code
// RunPreviewAdapter                  executeWorkflow
// ValidateEventBatch                 code
// FirstEvent                         code
// ApplyFirstEvent                    executeWorkflow            [onError→regular]
// RecordFirstResult                  code
// BatchResult                        code
// IntegrationBoundary                stickyNote
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// TrustedInternalRequest
//    → PrepareAdapter
//      → AdapterInput
//        → RunPreviewAdapter
//          → ValidateEventBatch
//            → FirstEvent
//              → ApplyFirstEvent
//                → RecordFirstResult
//                  → BatchResult
// CompetitionServerWebhook
//    → ExtractWebhookBody
//      → PrepareAdapter (↩ loop)
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'DH0auiC9UkXNBfRz',
    name: 'Flow4Gold - Competition Gateway',
    active: false,
    isArchived: false,
    settings: { executionOrder: 'v1' },
})
export class Flow4goldCompetitionGatewayWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'competition-gateway-ReceiveRequest',
        name: 'Trusted Internal Request',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    TrustedInternalRequest = {
        inputSource: 'passthrough',
    };

    @node({
        id: 'competition-gateway-CompetitionWebhook',
        webhookId: 'flow4gold-competition-gateway',
        name: 'Competition Server Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [-220, 220],
        credentials: { httpHeaderAuth: { id: 'IY5r9QTXQxCFlFge', name: 'Flow4Gold Demo Gateway' } },
    })
    CompetitionServerWebhook = {
        httpMethod: 'POST',
        path: 'flow4gold-competition',
        authentication: 'headerAuth',
        responseMode: 'lastNode',
        responseData: 'firstEntryJson',
        options: {},
    };

    @node({
        id: 'competition-gateway-ExtractWebhookBody',
        name: 'Extract Webhook Body',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [0, 220],
    })
    ExtractWebhookBody = {
        mode: 'runOnceForAllItems',
        jsCode: `const items=$input.all();
if(items.length!==1)throw new Error('Submit one competition request.');
const body=items[0].json.body;
if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Competition webhook requires a JSON object body.');
return [{json:body}];`,
    };

    @node({
        id: 'competition-gateway-PrepareAdapter',
        name: 'Prepare Adapter',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [220, 0],
    })
    PrepareAdapter = {
        mode: 'runOnceForAllItems',
        jsCode: `const items=$input.all();
if(items.length!==1)throw new Error('Submit one competition request.');
const envelope=items[0].json;
const mappings={register:'VJci6tpJ4SncQfbJ',contestant:'AH4T3dkJyEBoMCFe',organizer:'II9743VhDIHuMPiO'};
if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||Object.keys(envelope).some(key=>!['adapter','input'].includes(key))||!Object.hasOwn(mappings,envelope.adapter))throw new Error('Unknown competition adapter.');
const input=envelope.input;
if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Adapter input must be an object.');
if((input.machine!==undefined&&input.machine!=='flow4gold-submission')||(input.machineVersion!==undefined&&input.machineVersion!==1))throw new Error('Unsupported competition machine.');
return [{json:{adapter:envelope.adapter,workflowId:mappings[envelope.adapter],input:{...input,mode:'preview',machine:'flow4gold-submission',machineVersion:1}}}];`,
    };

    @node({
        id: 'competition-gateway-AdapterInput',
        name: 'Adapter Input',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [440, 0],
    })
    AdapterInput = {
        mode: 'runOnceForAllItems',
        jsCode: "return [{json:$('Prepare Adapter').first().json.input}];",
    };

    @node({
        id: 'competition-gateway-RunAdapter',
        name: 'Run Preview Adapter',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [660, 0],
    })
    RunPreviewAdapter = {
        source: 'database',
        workflowId: {
            __rl: true,
            value: "={{ $('Prepare Adapter').first().json.workflowId }}",
            mode: 'id',
        },
        mode: 'each',
        options: {
            waitForSubWorkflow: true,
        },
    };

    @node({
        id: 'competition-gateway-ValidateBatch',
        name: 'Validate Event Batch',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [880, 0],
    })
    ValidateEventBatch = {
        mode: 'runOnceForAllItems',
        jsCode: `const items=$input.all();if(items.length!==1)throw new Error('Adapter must return one event batch.');
const preview=items[0].json;const prepared=$('Prepare Adapter').first().json;
if(preview.mode!=='preview'||preview.persisted!==false||!Array.isArray(preview.events)||preview.events.length!==1)throw new Error('Unexpected adapter event batch.');
const keys=['eventId','caseId','machine','machineVersion','type','payload','correlationId','causationId'];
const events=preview.events;
const ids=new Set();
for(const [index,event] of events.entries()){
 if(!event||typeof event!=='object'||Array.isArray(event)||Object.keys(event).some(key=>!keys.includes(key)))throw new Error('Unexpected event fields.');
 if(event.caseId!==prepared.input.caseId||event.correlationId!==prepared.input.correlationId||event.machine!=='flow4gold-submission'||event.machineVersion!==1)throw new Error('Adapter event identity mismatch.');
 if(typeof event.eventId!=='string'||!event.eventId.trim()||typeof event.type!=='string'||!event.type.trim()||!event.payload||typeof event.payload!=='object'||Array.isArray(event.payload))throw new Error('Malformed adapter event.');
 if(ids.has(event.eventId))throw new Error('Adapter repeated an event identity.');ids.add(event.eventId);
 if(prepared.adapter==='register'&&event.type!=='SUBMISSION_RECEIVED')throw new Error('Registration must propose SUBMISSION_RECEIVED.');
}
return [{json:{adapter:prepared.adapter,caseId:prepared.input.caseId,events,effects:preview.effects??[]}}];`,
    };

    @node({
        id: 'competition-gateway-FirstEvent',
        name: 'First Event',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1100, 0],
    })
    FirstEvent = {
        mode: 'runOnceForAllItems',
        jsCode: "return [{json:$('Validate Event Batch').first().json.events[0]}];",
    };

    @node({
        id: 'competition-gateway-ApplyFirst',
        name: 'Apply First Event',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [1320, 0],
        onError: 'continueRegularOutput',
    })
    ApplyFirstEvent = {
        source: 'database',
        workflowId: {
            __rl: true,
            value: 'frF2jemAeCrcFPDe',
            mode: 'id',
        },
        mode: 'each',
        options: {
            waitForSubWorkflow: true,
        },
    };

    @node({
        id: 'competition-gateway-RecordFirst',
        name: 'Record First Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1540, 0],
    })
    RecordFirstResult = {
        mode: 'runOnceForAllItems',
        jsCode: "const batch=$('Validate Event Batch').first().json;return [{json:{...batch,results:[$input.first().json]}}];",
    };

    @node({
        id: 'competition-gateway-BatchResult',
        name: 'Batch Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1760, 0],
    })
    BatchResult = {
        mode: 'runOnceForAllItems',
        jsCode: `const batch=$input.first().json;
const accepted=(result,index)=>result.caseId===batch.caseId&&result.eventId===batch.events[index].eventId&&['applied','duplicate'].includes(result.status);
const acceptedCount=batch.results.filter(accepted).length;
const complete=acceptedCount===batch.events.length;
const last=batch.results.at(-1);const lastIndex=batch.results.length-1;
const rejected=last?.status==='rejected'&&last.caseId===batch.caseId&&last.eventId===batch.events[lastIndex].eventId;
const status=complete?'completed':rejected?'rejected':'uncertain';
return [{json:{mode:'persist',adapter:batch.adapter,caseId:batch.caseId,events:batch.events,results:batch.results,status,persisted:complete,partiallyPersisted:false,
 appliedCount:batch.results.filter((result,index)=>accepted(result,index)&&result.status==='applied').length,
 duplicateCount:batch.results.filter((result,index)=>accepted(result,index)&&result.status==='duplicate').length,
 unattemptedEventIds:batch.events.slice(batch.results.length).map(event=>event.eventId),effects:batch.effects,notification:{delivered:false},
 integration:{runtime:'generic-core',identity:'trusted-caller-assertion',effects:'preview-only'}}}];`,
    };

    @node({
        id: 'competition-gateway-Scope',
        name: 'Integration Boundary',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [220, -350],
    })
    IntegrationBoundary = {
        content: `## Trusted competition gateway
Internal Execute Workflow callers or the authenticated local demo server webhook. The shared header credential stays on the server. The local server asserts actor identity; actor.verified is not browser authentication. Both entrypoints use the same fixed adapter mapping and forced preview mode.
Persist exactly one external event through the generic core. Registration starts the REGISTERED state task; publication status and in-app notifications run asynchronously through scoped task bindings. Completed means this event was accepted, not that its task finished. Retry unchanged requests with original IDs.
No email or PIN is issued. The gateway does not run state tasks itself; the generic core does.`,
        width: 1120,
        height: 260,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.TrustedInternalRequest.out(0).to(this.PrepareAdapter.in(0));
        this.CompetitionServerWebhook.out(0).to(this.ExtractWebhookBody.in(0));
        this.ExtractWebhookBody.out(0).to(this.PrepareAdapter.in(0));
        this.PrepareAdapter.out(0).to(this.AdapterInput.in(0));
        this.AdapterInput.out(0).to(this.RunPreviewAdapter.in(0));
        this.RunPreviewAdapter.out(0).to(this.ValidateEventBatch.in(0));
        this.ValidateEventBatch.out(0).to(this.FirstEvent.in(0));
        this.FirstEvent.out(0).to(this.ApplyFirstEvent.in(0));
        this.ApplyFirstEvent.out(0).to(this.RecordFirstResult.in(0));
        this.RecordFirstResult.out(0).to(this.BatchResult.in(0));
    }
}
