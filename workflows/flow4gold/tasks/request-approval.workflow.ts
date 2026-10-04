import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Request Approval
// Nodes   : 8  |  Connections: 6
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveTask                        executeWorkflowTrigger
// ReadCaseEvents                     dataTable                  [alwaysOutput]
// PrepareApproval                    code
// PostToDiscord                      discord                    [creds]
// WaitForDecision                    wait
// BuildApprovalResult                code
// ReturnDomainEvent                  executeWorkflow
// ApprovalScope                      stickyNote
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveTask
//    → ReadCaseEvents
//      → PrepareApproval
//        → PostToDiscord
//          → WaitForDecision
//            → BuildApprovalResult
//              → ReturnDomainEvent
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'cL04Sd1GfOlJk0Te',
    name: 'Flow4Gold - Request Approval',
    active: false,
    isArchived: false,
    settings: { executionOrder: 'v1' },
})
export class Flow4goldRequestApprovalWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '64edb984-9ab5-444c-8276-f819b6e62016',
        name: 'Receive Task',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    ReceiveTask = {
        inputSource: 'passthrough',
    };

    @node({
        id: 'flow4gold-approval-read-case-events',
        name: 'Read Case Events',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [120, 0],
        alwaysOutputData: true,
    })
    ReadCaseEvents = {
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
                    keyValue: '={{ $json.caseId }}',
                },
            ],
        },
        returnAll: true,
    };

    @node({
        id: '31312854-4c29-4712-850a-73f8d682f865',
        name: 'Prepare Approval',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [240, 0],
    })
    PrepareApproval = {
        mode: 'runOnceForAllItems',
        jsCode: `const invocation = $('Receive Task').first().json;
for (const field of ['caseId', 'triggerEventId', 'taskInvocationId', 'correlationId']) {
  if (typeof invocation[field] !== 'string' || !invocation[field].trim()) {
    throw new Error('Missing task invocation field: ' + field);
  }
}
if (invocation.task !== 'request_approval' || invocation.machine !== 'customer-refund' ||
    (!Number.isSafeInteger(invocation.machineVersion) || invocation.machineVersion < 1) || invocation.state !== 'AWAITING_APPROVAL' ||
    invocation.taskInvocationId !== invocation.triggerEventId + ':request_approval') {
  throw new Error('Unexpected approval invocation');
}
const rows = $input.all().map(item => item.json).filter(row => row.eventId === invocation.triggerEventId);
if (rows.length !== 1) throw new Error('Expected one recorded refund proposal');
const recorded = rows[0];
if (recorded.type !== 'REFUND_RECOMMENDED' || recorded.caseId !== invocation.caseId ||
    recorded.machine !== invocation.machine || recorded.machineVersion !== invocation.machineVersion ||
    recorded.correlationId !== invocation.correlationId) throw new Error('Recorded proposal identity does not match approval invocation');
const proposal = JSON.parse(recorded.payload);
for (const field of ['amount', 'currency', 'paymentReference', 'reason']) {
  if (invocation.input?.[field] !== proposal?.[field]) throw new Error('Invocation differs from recorded refund proposal');
}
if (!proposal || typeof proposal.amount !== 'number' || !Number.isFinite(proposal.amount) || proposal.amount <= 0 || proposal.amount > 1000000 || Math.abs(proposal.amount * 100 - Math.round(proposal.amount * 100)) > 0.000001 ||
    typeof proposal.currency !== 'string' || !/^[A-Z]{3}$/.test(proposal.currency) ||
    typeof proposal.paymentReference !== 'string' || !proposal.paymentReference.trim() ||
    typeof proposal.reason !== 'string' || !proposal.reason.trim()) {
  throw new Error('Invalid recorded refund proposal');
}
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const lines = [
  ['Case', invocation.caseId],
  ['Amount', proposal.currency + ' ' + proposal.amount],
  ['Payment reference', proposal.paymentReference],
  ['Reason', proposal.reason],
  ['Proposal event', invocation.triggerEventId],
];
const formDescription = '<p>Simulated refund. Review this exact proposal before deciding.</p>' +
  lines.map(([label, value]) => '<p><strong>' + label + ':</strong> ' + escapeHtml(value) + '</p>').join('');
// Escape Discord formatting/mentions in proposal text; the form shows the complete proposal.
const discordText = (value) => String(value).replace(/@/g, '@\\u200b').replace(/[\\r\\n]/g, ' ').replace(/[\\x60*_~|<>]/g, '');
const discordSummary = 'Flow4Gold — SIMULATED refund approval\\n' +
  lines.map(([label, value]) => label + ': ' + discordText(value)).join('\\n');
if (discordSummary.length > 1500) throw new Error('Approval message exceeds demo size limit');
return [{ json: { ...invocation, formDescription, discordSummary } }];`,
    };

    @node({
        id: 'f7b306de-13fc-4186-91f3-a3b1fa43d8c0',
        webhookId: '3b6ebab2-a2cb-48d0-b49a-9954f8416126',
        name: 'Post to Discord',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [480, 0],
        credentials: { discordWebhookApi: { id: 'Ru8ASx0zjxjWAqlH', name: 'Discord Webhook account' } },
    })
    PostToDiscord = {
        authentication: 'webhook',
        operation: 'sendLegacy',
        content:
            '={{ (() => { const url = $execution.resumeFormUrl; if (!/[?&]signature=[^&]{32,}/.test(url)) throw new Error("Approval requires a signed resume form URL"); return $json.discordSummary + "\\n\\nReview and decide: " + url; })() }}',
        options: {
            wait: true,
            flags: ['SUPPRESS_EMBEDS'],
        },
    };

    @node({
        id: '96bc9c0b-c415-430f-b660-01cf590c5102',
        webhookId: 'flow4gold-refund-approval',
        name: 'Wait for Decision',
        type: 'n8n-nodes-base.wait',
        version: 1.1,
        position: [720, 0],
    })
    WaitForDecision = {
        resume: 'form',
        incomingAuthentication: 'none',
        formTitle: 'Flow4Gold refund approval',
        formDescription: "={{ $('Prepare Approval').first().json.formDescription }}",
        formFields: {
            values: [
                {
                    fieldLabel: 'Decision',
                    fieldType: 'dropdown',
                    fieldOptions: {
                        values: [
                            {
                                option: 'Approve',
                            },
                            {
                                option: 'Reject',
                            },
                        ],
                    },
                    requiredField: true,
                },
            ],
        },
        responseMode: 'onReceived',
        limitWaitTime: false,
    };

    @node({
        id: 'b4e5c226-0d60-4a1d-b89d-8f75e3be422a',
        name: 'Build Approval Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [960, 0],
    })
    BuildApprovalResult = {
        mode: 'runOnceForAllItems',
        jsCode: `const invocation = $('Prepare Approval').first().json;
const decision = $input.first().json.Decision;
if (decision !== 'Approve' && decision !== 'Reject') {
  throw new Error('An explicit Approve or Reject decision is required');
}
// IDs and proposal identity always come from the original task, never form fields.
return [{ json: {
  caseId: invocation.caseId,
  eventId: invocation.taskInvocationId + ':result',
  taskInvocationId: invocation.taskInvocationId,
  causationId: invocation.triggerEventId,
  correlationId: invocation.correlationId,
  type: decision === 'Approve' ? 'APPROVED' : 'REJECTED',
  payload: { proposalEventId: invocation.triggerEventId },
} }];`,
    };

    @node({
        id: '72fde679-6bdb-46ba-b263-05c4280324ea',
        name: 'Return Domain Event',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [1200, 0],
    })
    ReturnDomainEvent = {
        source: 'database',
        workflowId: {
            __rl: true,
            value: 'frF2jemAeCrcFPDe',
            mode: 'id',
        },
        mode: 'each',
        options: {
            waitForSubWorkflow: false,
        },
    };

    @node({
        id: '805a12fc-3014-455c-b79b-7667b467d7f4',
        name: 'Approval Scope',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [180, -260],
    })
    ApprovalScope = {
        content: `## Simulated refund approval
Posts the recorded proposal via the saved Discord webhook. Only this task waits; Core Runtime is free. A GET opens the form; an explicit submitted choice creates the callback. The private-channel link is bearer access, not verified Discord identity. No payment action. No timeout decision. Do not share the review link.`,
        width: 780,
        height: 180,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ReceiveTask.out(0).to(this.ReadCaseEvents.in(0));
        this.ReadCaseEvents.out(0).to(this.PrepareApproval.in(0));
        this.PrepareApproval.out(0).to(this.PostToDiscord.in(0));
        this.PostToDiscord.out(0).to(this.WaitForDecision.in(0));
        this.WaitForDecision.out(0).to(this.BuildApprovalResult.in(0));
        this.BuildApprovalResult.out(0).to(this.ReturnDomainEvent.in(0));
    }
}
