import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Competition Gateway
// Nodes   : 16  |  Connections: 15
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
// ContinueBatch                      if
// SecondEvent                        code
// ApplySecondEvent                   executeWorkflow            [onError→regular]
// RecordSecondResult                 code
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
//                  → ContinueBatch
//                    → SecondEvent
//                      → ApplySecondEvent
//                        → RecordSecondResult
//                          → BatchResult
//                   .out(1) → BatchResult (↩ loop)
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
if(preview.mode!=='preview'||preview.persisted!==false||!Array.isArray(preview.events)||preview.events.length!==(prepared.adapter==='register'?2:1))throw new Error('Unexpected adapter event batch.');
const keys=['eventId','caseId','machine','machineVersion','type','payload','correlationId','causationId'];
const events=preview.events;
const ids=new Set();
for(const [index,event] of events.entries()){
 if(!event||typeof event!=='object'||Array.isArray(event)||Object.keys(event).some(key=>!keys.includes(key)))throw new Error('Unexpected event fields.');
 if(event.caseId!==prepared.input.caseId||event.correlationId!==prepared.input.correlationId||event.machine!=='flow4gold-submission'||event.machineVersion!==1)throw new Error('Adapter event identity mismatch.');
 if(typeof event.eventId!=='string'||!event.eventId.trim()||typeof event.type!=='string'||!event.type.trim()||!event.payload||typeof event.payload!=='object'||Array.isArray(event.payload))throw new Error('Malformed adapter event.');
 if(ids.has(event.eventId))throw new Error('Adapter repeated an event identity.');ids.add(event.eventId);
 if(index>0&&event.causationId!==events[index-1].eventId)throw new Error('Second event must cite the first event.');
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
        jsCode: `const batch=$('Validate Event Batch').first().json;const result=$input.first().json;
const matched=result.caseId===batch.caseId&&result.eventId===batch.events[0].eventId;
const accepted=matched&&['applied','duplicate'].includes(result.status);
return [{json:{...batch,results:[result],continueBatch:accepted&&batch.events.length===2}}];`,
    };

    @node({
        id: 'competition-gateway-ContinueBatch',
        name: 'Continue Batch?',
        type: 'n8n-nodes-base.if',
        version: 2.3,
        position: [1760, 0],
    })
    ContinueBatch = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
                version: 3,
            },
            conditions: [
                {
                    id: 'continue',
                    leftValue: '={{ $json.continueBatch }}',
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
        id: 'competition-gateway-SecondEvent',
        name: 'Second Event',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1980, 0],
    })
    SecondEvent = {
        mode: 'runOnceForAllItems',
        jsCode: "return [{json:$('Record First Result').first().json.events[1]}];",
    };

    @node({
        id: 'competition-gateway-ApplySecond',
        name: 'Apply Second Event',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [2200, 0],
        onError: 'continueRegularOutput',
    })
    ApplySecondEvent = {
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
        id: 'competition-gateway-RecordSecond',
        name: 'Record Second Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2420, 0],
    })
    RecordSecondResult = {
        mode: 'runOnceForAllItems',
        jsCode: "const batch=$('Record First Result').first().json;return [{json:{...batch,results:[...batch.results,$input.first().json]}}];",
    };

    @node({
        id: 'competition-gateway-BatchResult',
        name: 'Batch Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2640, 160],
    })
    BatchResult = {
        mode: 'runOnceForAllItems',
        jsCode: `const batch=$input.first().json;
const accepted=(result,index)=>result.caseId===batch.caseId&&result.eventId===batch.events[index].eventId&&['applied','duplicate'].includes(result.status);
const acceptedCount=batch.results.filter(accepted).length;
const complete=acceptedCount===batch.events.length;
const last=batch.results.at(-1);const lastIndex=batch.results.length-1;
const rejected=last?.status==='rejected'&&last.caseId===batch.caseId&&last.eventId===batch.events[lastIndex].eventId;
const status=complete?'completed':rejected?(acceptedCount?'partial':'rejected'):'uncertain';
return [{json:{mode:'persist',adapter:batch.adapter,caseId:batch.caseId,events:batch.events,results:batch.results,status,persisted:complete,partiallyPersisted:!complete&&acceptedCount>0,
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
Persist one event at a time through the generic core. Register emits two; stop on first failure. Partial results remain visible; retries keep original IDs. No batch transaction.
Email, PIN issuance and capacity reservations remain unimplemented preview effects. No notification workflow is invoked.`,
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
        this.RecordFirstResult.out(0).to(this.ContinueBatch.in(0));
        this.ContinueBatch.out(0).to(this.SecondEvent.in(0));
        this.ContinueBatch.out(1).to(this.BatchResult.in(0));
        this.SecondEvent.out(0).to(this.ApplySecondEvent.in(0));
        this.ApplySecondEvent.out(0).to(this.RecordSecondResult.in(0));
        this.RecordSecondResult.out(0).to(this.BatchResult.in(0));
    }
}
