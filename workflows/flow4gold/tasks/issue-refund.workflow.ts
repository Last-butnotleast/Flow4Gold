import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Issue Refund (Simulated)
// Nodes   : 5  |  Connections: 4
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveTask                        executeWorkflowTrigger
// ValidateInvocation                 code
// ReadCaseEvents                     dataTable                  [alwaysOutput]
// BuildRefundResult                  code
// ReturnDomainEvent                  executeWorkflow
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveTask
//    → ValidateInvocation
//      → ReadCaseEvents
//        → BuildRefundResult
//          → ReturnDomainEvent
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'QWAFL09ceL8nUa6y',
    name: 'Flow4Gold - Issue Refund (Simulated)',
    active: false,
    isArchived: false,
    settings: { executionOrder: 'v1' },
})
export class Flow4goldIssueRefundSimulatedWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'd2114d0c-e237-45e0-a729-8191b021040e',
        name: 'Receive Task',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    ReceiveTask = {
        inputSource: 'passthrough',
    };

    @node({
        id: '4d93a7b5-4821-4866-9d2f-e78cb22c9398',
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
if (invocation.task !== 'issue_refund' || invocation.state !== 'EXECUTING' || invocation.machine !== 'customer-refund' ||
    (!Number.isSafeInteger(invocation.machineVersion) || invocation.machineVersion < 1) || invocation.taskInvocationId !== invocation.triggerEventId + ':issue_refund' ||
    !invocation.input || typeof invocation.input !== 'object' || Array.isArray(invocation.input)) {
  throw new Error('Unexpected issue_refund invocation; a positive pinned refund machine version is required');
}
return [{ json: invocation }];`,
    };

    @node({
        id: '1558c4ae-00e1-45e6-b12b-c56d8c051a2e',
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
        id: '7506b7bf-2e54-476a-b2da-0c137a60622e',
        name: 'Build Refund Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [780, 0],
    })
    BuildRefundResult = {
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
    if (approval.data.reviewEventId !== review.eventId || typeof approval.data.message !== 'string' || !approval.data.message.trim() ||
        !p || p.simulation !== true || typeof p.orderReference !== 'string' || !p.orderReference.trim() ||
        approval.taskInvocationId !== review.eventId + ':human_review' ||
        approval.eventId !== approval.taskInvocationId + ':result' || approval.sequence !== review.sequence + 1 ||
        !p || typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0 || p.amount > 1000000 || Math.abs(p.amount * 100 - Math.round(p.amount * 100)) > 0.000001 ||
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
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0 || p.amount > 1000000 || Math.abs(p.amount * 100 - Math.round(p.amount * 100)) > 0.000001 ||
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
const approval = event(invocation.triggerEventId, ['APPROVED', 'REVIEW_APPROVED']);
const proposal = proposalFor(approval);
if (approval.type === 'APPROVED' && invocation.input.proposalEventId !== proposal.eventId) throw new Error('Invocation proposal differs from recorded approval');
// This is only a deterministic simulation receipt; no payment API is called.
const payload = {
  simulation: true, receiptId: 'simulated-refund:' + invocation.taskInvocationId,
  proposalEventId: proposal.eventId, amount: proposal.data.amount,
  currency: proposal.data.currency, paymentReference: proposal.data.paymentReference,
};
return [{ json: { ...callback, type: 'ACTION_COMPLETED', payload } }];`,
    };

    @node({
        id: '54444dc4-7dd2-4ad0-a9a1-d30dc64e6483',
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
        this.ReadCaseEvents.out(0).to(this.BuildRefundResult.in(0));
        this.BuildRefundResult.out(0).to(this.ReturnDomainEvent.in(0));
    }
}
