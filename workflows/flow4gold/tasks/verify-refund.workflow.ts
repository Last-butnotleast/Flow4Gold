import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Verify Refund (Simulated)
// Nodes   : 5  |  Connections: 4
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveTask                        executeWorkflowTrigger
// ValidateInvocation                 code
// ReadCaseEvents                     dataTable                  [alwaysOutput]
// BuildVerificationResult            code
// ReturnDomainEvent                  executeWorkflow
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveTask
//    → ValidateInvocation
//      → ReadCaseEvents
//        → BuildVerificationResult
//          → ReturnDomainEvent
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: '9LZC7MMcWWLI4FN9',
    name: 'Flow4Gold - Verify Refund (Simulated)',
    active: true,
    isArchived: false,
    settings: { executionOrder: 'v1' },
})
export class Flow4goldVerifyRefundSimulatedWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '22a3d8cf-80ab-491e-b839-86be39c5b892',
        name: 'Receive Task',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    ReceiveTask = {
        inputSource: 'passthrough',
    };

    @node({
        id: '36c97bb6-f1f3-4919-850c-b47d4c96a293',
        name: 'Validate Invocation',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [260, 0],
    })
    ValidateInvocation = {
        mode: 'runOnceForAllItems',
        jsCode: `const invocation = $input.first().json;
for (const field of ['caseId', 'triggerEventId', 'taskInvocationId', 'correlationId']) {
  if (typeof invocation[field] !== 'string' || !invocation[field].trim()) throw new Error('Missing task invocation field: ' + field);
}
if (invocation.task !== 'verify_refund' || invocation.state !== 'VERIFYING' || invocation.machine !== 'customer-refund' ||
    ![2, 3].includes(invocation.machineVersion) || invocation.taskInvocationId !== invocation.triggerEventId + ':verify_refund' ||
    !invocation.input || typeof invocation.input !== 'object' || Array.isArray(invocation.input)) {
  throw new Error('Unexpected verify_refund invocation; only proposal-bound machines v2/v3 are supported');
}
return [{ json: invocation }];`,
    };

    @node({
        id: '71b6070c-c7d8-4084-ba61-64fb469efc68',
        name: 'Read Case Events',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [520, 0],
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
                    keyValue: "={{ $('Validate Invocation').first().json.caseId }}",
                },
            ],
        },
        returnAll: true,
    };

    @node({
        id: '245e28f5-49c4-4cf5-867a-7074f0923b8b',
        name: 'Build Verification Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 0],
    })
    BuildVerificationResult = {
        mode: 'runOnceForAllItems',
        jsCode: `const invocation = $('Validate Invocation').first().json;
const rows = $input.all().map(item => item.json).filter(row => row.eventId);
function event(id, type) {
  const matches = rows.filter(row => row.eventId === id);
  if (matches.length !== 1) throw new Error('Expected one recorded ' + type + ' event');
  const row = matches[0];
  if (!(Array.isArray(type) ? type : [type]).includes(row.type) || row.caseId !== invocation.caseId || row.machine !== invocation.machine ||
      row.machineVersion !== invocation.machineVersion || row.correlationId !== invocation.correlationId) {
    throw new Error('Recorded event identity does not match invocation');
  }
  return { ...row, data: JSON.parse(row.payload) };
}
function proposalFor(approval) {
  if (approval.type === 'REVIEW_APPROVED') {
    const review = event(approval.causationId, 'ESCALATE');
    const p = approval.data.proposal;
    if (invocation.machineVersion !== 3 || approval.data.reviewEventId !== review.eventId ||
        approval.taskInvocationId !== review.eventId + ':human_review' ||
        approval.eventId !== approval.taskInvocationId + ':result' || approval.sequence !== review.sequence + 1 ||
        !p || typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0 ||
        typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency) ||
        typeof p.paymentReference !== 'string' || !p.paymentReference.trim() ||
        typeof p.reason !== 'string' || !p.reason.trim()) throw new Error('Invalid recorded human review approval');
    return { ...approval, data: p };
  }
  const proposal = event(approval.data.proposalEventId, 'REFUND_RECOMMENDED');
  if (approval.causationId !== proposal.eventId || approval.taskInvocationId !== proposal.eventId + ':request_approval' ||
      approval.eventId !== approval.taskInvocationId + ':result' || approval.sequence !== proposal.sequence + 1) {
    throw new Error('Approval is not linked to the recorded proposal');
  }
  const p = proposal.data;
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0 ||
      typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency) ||
      typeof p.paymentReference !== 'string' || !p.paymentReference.trim() ||
      typeof p.reason !== 'string' || !p.reason.trim()) throw new Error('Invalid recorded proposal');
  return proposal;
}
const callback = {
  caseId: invocation.caseId, eventId: invocation.taskInvocationId + ':result',
  taskInvocationId: invocation.taskInvocationId, causationId: invocation.triggerEventId,
  correlationId: invocation.correlationId,
};
let type = 'REFUND_CONFIRMED';
let payload;
try {
  const receipt = event(invocation.triggerEventId, 'ACTION_COMPLETED');
  const approval = event(receipt.causationId, ['APPROVED', 'REVIEW_APPROVED']);
  const proposal = proposalFor(approval);
  const expectedInvocation = approval.eventId + ':issue_refund';
  const r = receipt.data;
  if (receipt.taskInvocationId !== expectedInvocation || receipt.eventId !== expectedInvocation + ':result' ||
      receipt.sequence !== approval.sequence + 1 || r.simulation !== true ||
      r.receiptId !== 'simulated-refund:' + expectedInvocation || r.proposalEventId !== proposal.eventId ||
      r.amount !== proposal.data.amount || r.currency !== proposal.data.currency ||
      r.paymentReference !== proposal.data.paymentReference) throw new Error('Simulated receipt does not match approved proposal');
  for (const field of ['simulation', 'receiptId', 'proposalEventId', 'amount', 'currency', 'paymentReference']) {
    if (invocation.input[field] !== r[field]) throw new Error('Invocation differs from recorded receipt');
  }
  payload = { simulation: true, receiptId: r.receiptId, proposalEventId: proposal.eventId,
    amount: r.amount, currency: r.currency, paymentReference: r.paymentReference };
} catch (error) {
  type = 'REFUND_UNCONFIRMED';
  payload = { simulation: true, reason: error.message };
}
return [{ json: { ...callback, type, payload } }];`,
    };

    @node({
        id: 'bbd65fb3-cbdc-4141-b964-887f9128e863',
        name: 'Return Domain Event',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [1040, 0],
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

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ReceiveTask.out(0).to(this.ValidateInvocation.in(0));
        this.ValidateInvocation.out(0).to(this.ReadCaseEvents.in(0));
        this.ReadCaseEvents.out(0).to(this.BuildVerificationResult.in(0));
        this.BuildVerificationResult.out(0).to(this.ReturnDomainEvent.in(0));
    }
}
