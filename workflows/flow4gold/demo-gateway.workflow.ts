import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Demo Gateway
// Nodes   : 3  |  Connections: 2
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// DemoWebhook                        webhook                    [creds]
// ValidateCustomerRequest            code
// RunCore                            executeWorkflow
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// DemoWebhook
//    → ValidateCustomerRequest
//      → RunCore
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'K83lSyLHmJ4PBTh4',
    name: 'Flow4Gold - Demo Gateway',
    active: false,
    isArchived: false,
    projectId: '8d5DQtHZkgLco5Yr',
    settings: { executionOrder: 'v1' },
})
export class Flow4goldDemoGatewayWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '8d9b555c-2219-4480-be5e-82485b2cde15',
        webhookId: 'flow4gold-demo-gateway',
        name: 'Demo Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [0, 0],
        credentials: { httpHeaderAuth: { id: 'IY5r9QTXQxCFlFge', name: 'Flow4Gold Demo Gateway' } },
    })
    DemoWebhook = {
        httpMethod: 'POST',
        path: 'flow4gold-demo',
        authentication: 'headerAuth',
        responseMode: 'lastNode',
        responseData: 'firstEntryJson',
        options: {},
    };

    @node({
        id: 'ca6890b5-3f3d-439c-9a59-e0df69d5c2f9',
        name: 'Validate Customer Request',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [240, 0],
    })
    ValidateCustomerRequest = {
        mode: 'runOnceForAllItems',
        jsCode: `// Narrow ingress: never accept arbitrary domain events or approval payloads.
const body = $json.body;
if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('JSON object required.');
const inspect = body.operation === 'inspect';
const keys = inspect ? ['operation', 'caseId'] : ['caseId', 'eventId', 'type', 'payload'];
if (Object.keys(body).some(key => !keys.includes(key))) throw new Error('Unknown field.');
if (typeof body.caseId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(body.caseId)) throw new Error('Invalid case ID.');
if (inspect) return [{json: {caseId: body.caseId, operation: 'inspect'}}];
if (!['RECEIVED', 'CUSTOMER_REPLIED'].includes(body.type)) throw new Error('Only customer intake and replies are permitted.');
if (typeof body.eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(body.eventId)) throw new Error('Invalid event ID.');
const payload = body.payload;
if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !['message', 'orderReference'].includes(key))) throw new Error('Invalid customer payload.');
if (typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 4000) throw new Error('Message must contain 1–4000 characters.');
if (payload.orderReference !== undefined && (typeof payload.orderReference !== 'string' || payload.orderReference.length > 80)) throw new Error('Invalid order reference.');
// Refund-specific adapter selects a definition; the generic core has no domain default.
return [{json: {caseId: body.caseId, eventId: body.eventId, type: body.type, ...(body.type === 'RECEIVED' ? {machine: 'customer-refund', machineVersion: 1} : {}), payload: {message: payload.message.trim(), ...(payload.orderReference?.trim() ? {orderReference: payload.orderReference.trim()} : {})}}}];
`,
    };

    @node({
        id: '2447126e-e362-4e30-aced-908032969ccb',
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
        this.DemoWebhook.out(0).to(this.ValidateCustomerRequest.in(0));
        this.ValidateCustomerRequest.out(0).to(this.RunCore.in(0));
    }
}
