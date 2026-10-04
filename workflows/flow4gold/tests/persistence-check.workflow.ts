import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Persistence Check
// Nodes   : 3  |  Connections: 2
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// TestWebhook                        webhook
// FixedFixture                       code
// RunCore                            executeWorkflow
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// TestWebhook
//    → FixedFixture
//      → RunCore
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'AhfVHfQSMDticQvL',
    name: 'Flow4Gold - Persistence Check',
    active: false,
    isArchived: false,
    settings: { executionOrder: 'v1' },
})
export class Flow4goldPersistenceCheckWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'be6a008e-5d5e-4137-b323-793840970c3f',
        webhookId: '2b1beb48-ea8f-45f6-aef2-9ba38c318d1c',
        name: 'Test Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [0, 0],
    })
    TestWebhook = {
        httpMethod: 'POST',
        path: '6f3650af-1d22-4f99-a86d-23e32072b44f',
        authentication: 'none',
        responseMode: 'lastNode',
        responseData: 'firstEntryJson',
        options: {},
    };

    @node({
        id: '5cdf0be7-024f-4b43-b843-76fd8c0da4de',
        name: 'Fixed Fixture',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [240, 0],
    })
    FixedFixture = {
        mode: 'runOnceForAllItems',
        jsCode: `const caseId = 'approval-check-20261004-52617792';
const scenarios = {
  initial: { eventId: caseId + '-received', type: 'RECEIVED' },
  inspect: { operation: 'inspect' },
  duplicate: { eventId: caseId + '-received', type: 'RECEIVED' },
  illegal: { eventId: caseId + '-illegal', type: 'ACTION_COMPLETED' },
};
const scenario = $json.body?.scenario;
if (!Object.hasOwn(scenarios, scenario)) throw new Error('Unknown fixed test scenario');
// Deliberately ignore caller case/event IDs, state and payload.
return [{ json: { caseId, ...scenarios[scenario] } }];`,
    };

    @node({
        id: 'd448f3e8-e135-42d4-a05c-293c06287ddd',
        name: 'Run Core',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [480, 0],
    })
    RunCore = {
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

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.TestWebhook.out(0).to(this.FixedFixture.in(0));
        this.FixedFixture.out(0).to(this.RunCore.in(0));
    }
}
