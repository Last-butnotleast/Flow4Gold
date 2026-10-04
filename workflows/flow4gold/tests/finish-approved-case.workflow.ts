import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Finish Approved Case
// Nodes   : 8  |  Connections: 7
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Finishwebhook                      webhook
// Fixedcase                          code
// Inspectcore                        executeWorkflow
// Readcaseevents                     dataTable                  [alwaysOutput]
// Resumeguard                        code
// Dispatchneeded                     if
// Resumesimulatedrefund              executeWorkflow
// Existingstate                      code
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// Finishwebhook
//    → Fixedcase
//      → Inspectcore
//        → Readcaseevents
//          → Resumeguard
//            → Dispatchneeded
//              → Resumesimulatedrefund
//             .out(1) → Existingstate
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: '7wpRrMUHew9ERC0q',
    name: 'Flow4Gold - Finish Approved Case',
    active: false,
    isArchived: false,
    projectId: '8d5DQtHZkgLco5Yr',
    settings: { executionOrder: 'v1' },
})
export class Flow4goldFinishApprovedCaseWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '5c939459-20bd-4ee7-89ee-313bf1e1a276',
        webhookId: '6fc3c19d-3b35-41e7-81e4-08e3b5cec211',
        name: 'FinishWebhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [0, 0],
    })
    Finishwebhook = {
        httpMethod: 'POST',
        path: '781acd65-28a6-4783-93e9-5ce73636de15',
        authentication: 'none',
        responseMode: 'lastNode',
        responseData: 'firstEntryJson',
        options: {},
    };

    @node({
        id: '81355583-9ad7-4162-bddf-090e0cfe3bb9',
        name: 'FixedCase',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [240, 0],
    })
    Fixedcase = {
        mode: 'runOnceForAllItems',
        jsCode: "const body = $input.first().json.body; if (!body || Object.keys(body).some(key => key !== 'operation') || !['resume','inspect'].includes(body.operation)) throw new Error('Only fixed-case resume or inspect allowed'); return [{json:{caseId:'approval-check-20261004-52617792',operation:'inspect'}}];",
    };

    @node({
        id: '2a5396b5-d03a-401a-b0f6-d85344150569',
        name: 'InspectCore',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [480, 0],
    })
    Inspectcore = {
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
        id: '8a4e485d-4c66-41fa-ae59-72b239c9124a',
        name: 'ReadCaseEvents',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [720, 0],
        alwaysOutputData: true,
    })
    Readcaseevents = {
        resource: 'row',
        operation: 'get',
        dataTableId: {
            __rl: true,
            value: 'TjuB58skTvPRCwB3',
            mode: 'id',
        },
        matchType: 'allConditions',
        filters: {
            conditions: [
                {
                    keyName: 'caseId',
                    condition: 'eq',
                    keyValue: 'approval-check-20261004-52617792',
                },
            ],
        },
        returnAll: true,
    };

    @node({
        id: '7a8f2855-bacf-4d47-94c9-579ad7bdac4c',
        name: 'ResumeGuard',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [960, 0],
    })
    Resumeguard = {
        mode: 'runOnceForAllItems',
        jsCode: `const state = $('InspectCore').first().json;
const rows = $input.all().map(item => item.json).sort((a,b) => a.sequence-b.sequence);
const caseId = 'approval-check-20261004-52617792';
const proposalId = caseId + '-received:diagnose:result';
const approvalId = proposalId + ':request_approval:result';
if (state.status !== 'inspected' || state.caseId !== caseId) throw new Error('Case inspection failed');
if ($('FinishWebhook').first().json.body.operation === 'inspect' || state.sequence > 3) return [{json:{...state,dispatch:false}}];
if (state.currentState !== 'EXECUTING' || state.sequence !== 3 || rows.length !== 3) throw new Error('Expected approved three-event stream');
const approval = rows[2];
if (approval.eventId !== approvalId || approval.type !== 'APPROVED' || approval.machineVersion !== 2 || approval.caseId !== caseId || approval.causationId !== proposalId || JSON.parse(approval.payload).proposalEventId !== proposalId) throw new Error('Expected exact recorded human approval');
return [{json:{dispatch:true,caseId,task:'issue_refund',taskInvocationId:approvalId+':issue_refund',triggerEventId:approvalId,correlationId:approval.correlationId,state:'EXECUTING',machine:approval.machine,machineVersion:approval.machineVersion,input:JSON.parse(approval.payload)}}];`,
    };

    @node({
        id: 'd24b968a-3bb2-4edb-8084-b1490bc25ff0',
        name: 'DispatchNeeded',
        type: 'n8n-nodes-base.if',
        version: 2.3,
        position: [1200, 0],
    })
    Dispatchneeded = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
                version: 3,
            },
            conditions: [
                {
                    id: 'dispatch',
                    leftValue: '={{ $json.dispatch }}',
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
        id: '6c03eb1d-1d03-4983-89c6-8374dbe102a6',
        name: 'ResumeSimulatedRefund',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [1440, 0],
    })
    Resumesimulatedrefund = {
        source: 'database',
        workflowId: {
            __rl: true,
            value: 'QWAFL09ceL8nUa6y',
            mode: 'id',
        },
        mode: 'each',
        options: {
            waitForSubWorkflow: false,
        },
    };

    @node({
        id: '88eb3326-bd3a-436b-aacb-84e8d72b5de2',
        name: 'ExistingState',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1680, 0],
    })
    Existingstate = {
        mode: 'runOnceForAllItems',
        jsCode: 'return $input.all();',
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.Finishwebhook.out(0).to(this.Fixedcase.in(0));
        this.Fixedcase.out(0).to(this.Inspectcore.in(0));
        this.Inspectcore.out(0).to(this.Readcaseevents.in(0));
        this.Readcaseevents.out(0).to(this.Resumeguard.in(0));
        this.Resumeguard.out(0).to(this.Dispatchneeded.in(0));
        this.Dispatchneeded.out(0).to(this.Resumesimulatedrefund.in(0));
        this.Dispatchneeded.out(1).to(this.Existingstate.in(0));
    }
}
