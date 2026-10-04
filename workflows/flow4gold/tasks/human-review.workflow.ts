import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Human Review
// Nodes   : 10  |  Connections: 10
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveTask                        executeWorkflowTrigger
// ReadCaseEvents                     dataTable                  [alwaysOutput]
// ReadDemoOrders                     dataTable                  [alwaysOutput] [executeOnce]
// PrepareReview                      code
// PostToDiscord                      discord                    [creds]
// HasKnownOrder                      if
// WaitForDecision                    wait
// WaitForInformationDecision         wait
// BuildReviewResult                  code
// ReturnDomainEvent                  executeWorkflow
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveTask
//    → ReadCaseEvents
//      → ReadDemoOrders
//        → PrepareReview
//          → PostToDiscord
//            → HasKnownOrder
//              → WaitForDecision
//                → BuildReviewResult
//                  → ReturnDomainEvent
//             .out(1) → WaitForInformationDecision
//                → BuildReviewResult (↩ loop)
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'QqlNaOkKKdpSGjO8',
    name: 'Flow4Gold - Human Review',
    active: false,
    isArchived: false,
    settings: { executionOrder: 'v1' },
})
export class Flow4goldHumanReviewWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'flow4gold-review-ReceiveTask',
        name: 'Receive Task',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    ReceiveTask = {
        inputSource: 'passthrough',
    };

    @node({
        id: 'flow4gold-review-ReadCaseEvents',
        name: 'Read Case Events',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [240, 0],
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
        id: 'flow4gold-review-ReadDemoOrders',
        name: 'Read Demo Orders',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [360, 0],
        alwaysOutputData: true,
        executeOnce: true,
    })
    ReadDemoOrders = {
        resource: 'row',
        operation: 'get',
        dataTableId: {
            __rl: true,
            value: '1NakvVeVYx0CI2hU',
            mode: 'id',
        },
        returnAll: true,
    };

    @node({
        id: 'flow4gold-review-PrepareReview',
        name: 'Prepare Review',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [480, 0],
    })
    PrepareReview = {
        mode: 'runOnceForAllItems',
        jsCode: `// Read-only evidence from the n8n demo_orders table. Never fall back to bundled records.
function lookupDemoOrder(orderReference) {
  const candidates = $input.all().map(item => item.json).filter(row => row.orderReference === orderReference && orderReference);
  if (!candidates.length) return { order: null, orderLookupIssue: null };
  if (candidates.length !== 1) return { order: null, orderLookupIssue: 'Multiple sample payments have this order reference.' };
  const row = candidates[0];
  if (typeof row.itemName !== 'string' || !row.itemName.trim() || typeof row.amount !== 'number' ||
      !Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 1000000 || Math.abs(row.amount * 100 - Math.round(row.amount * 100)) > 0.000001 ||
      typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency) ||
      typeof row.paymentReference !== 'string' || !row.paymentReference.trim() || typeof row.duplicateCharge !== 'boolean') {
    return { order: null, orderLookupIssue: 'The sample payment record is incomplete or invalid.' };
  }
  return { order: Object.fromEntries(['orderReference','itemName','amount','currency','paymentReference','duplicateCharge'].map(key => [key,row[key]])), orderLookupIssue: null };
}

const invocation = $('Receive Task').first().json;
for (const key of ['caseId', 'triggerEventId', 'taskInvocationId', 'correlationId']) {
  if (typeof invocation[key] !== 'string' || !invocation[key].trim()) throw new Error('Missing review invocation field: ' + key);
}
if (invocation.task !== 'human_review' || invocation.machine !== 'customer-refund' || (!Number.isSafeInteger(invocation.machineVersion) || invocation.machineVersion < 1) ||
    invocation.state !== 'HUMAN_REVIEW' || invocation.taskInvocationId !== invocation.triggerEventId + ':human_review') throw new Error('Unexpected human review invocation');
const rows = $('Read Case Events').all().map(item => item.json).filter(row => row.caseId === invocation.caseId).sort((a,b) => a.sequence-b.sequence);
const matches = rows.filter(row => row.eventId === invocation.triggerEventId);
if (matches.length !== 1 || matches[0].type !== 'ESCALATE' || matches[0].machine !== invocation.machine || matches[0].machineVersion !== invocation.machineVersion || matches[0].correlationId !== invocation.correlationId) throw new Error('Missing recorded escalation');
const trigger = matches[0];
const events = rows.filter(row => row.sequence <= trigger.sequence).map(row => ({ ...row, data: JSON.parse(row.payload) }));
let orderReference = '';
const conversation = [];
for (const entry of events) {
  if (['RECEIVED','CUSTOMER_REPLIED'].includes(entry.type)) {
    const message = typeof entry.data.message === 'string' ? entry.data.message.slice(0,4000) : '';
    const reference = typeof entry.data.orderReference === 'string' && entry.data.orderReference.trim() || message.match(/\\border\\s*(?:is\\s+)?#?\\s*([a-z0-9][a-z0-9-]*)\\b/i)?.[1];
    if (reference) orderReference = reference;
    conversation.push(['Customer',message]);
  } else if (entry.type === 'NEED_MORE_INFO') {
    conversation.push(['Support',entry.data.message || entry.data.question || 'Please provide more information.']);
  }
}
const { order, orderLookupIssue } = lookupDemoOrder(orderReference);
const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escalation = JSON.parse(trigger.payload);
const reason = escalation.reason || escalation.message || 'Investigation requires human judgment.';
const formDescription = '<p>SIMULATED refund review. Your approval executes the exact sample payment shown below, without another approval round. Ask customer posts your message in chat and waits for their reply.</p>' +
  '<p><strong>Case:</strong> ' + escapeHtml(invocation.caseId) + '</p><p><strong>Escalation:</strong> ' + escapeHtml(reason) + '</p>' +
  (order ? '<p><strong>Recorded sample payment:</strong> Order ' + escapeHtml(order.orderReference) + ' — ' + escapeHtml(order.itemName) + '; ' + escapeHtml(order.currency) + ' ' + order.amount + '; ' + escapeHtml(order.paymentReference) + '; duplicate charge: ' + order.duplicateCharge + '.</p><p>Approve refund explicitly authorizes this amount. Explain your judgment in Message.</p>' : '<p>' + escapeHtml(orderLookupIssue || 'No matching sample payment.') + '</p><p><strong>No usable sample payment.</strong> Approval is unavailable. Ask for an order reference or reject the request.</p>') +
  '<h3>Conversation</h3>' + conversation.map(([actor,message])=>'<p><strong>' + actor + ':</strong> ' + escapeHtml(message) + '</p>').join('');
const plain = value => String(value).replace(/@/g,'@\\u200b').replace(/[\\r\\n\`*_~|<>]/g,' ').slice(0,450);
const discordSummary = 'Flow4Gold — HUMAN REVIEW (simulated)\\nCase: ' + plain(invocation.caseId) + '\\nReason: ' + plain(reason) + '\\n' +
  (order ? 'Review refund: ' + order.currency + ' ' + order.amount + ', order ' + order.orderReference : 'No matching payment — ask customer or reject') + '\\nRead the conversation and choose your next action in the form.';
return [{json:{...invocation,order,orderLookupIssue,formDescription,discordSummary}}];
`,
    };

    @node({
        id: 'flow4gold-review-PostToDiscord',
        webhookId: '6b4362af-7db8-41dd-be17-d4608e919358',
        name: 'Post to Discord',
        type: 'n8n-nodes-base.discord',
        version: 2,
        position: [720, 0],
        credentials: { discordWebhookApi: { id: 'Ru8ASx0zjxjWAqlH', name: 'Discord Webhook account' } },
    })
    PostToDiscord = {
        authentication: 'webhook',
        operation: 'sendLegacy',
        content:
            '={{ (() => { const url = $execution.resumeFormUrl; if (!/[?&]signature=[^&]{32,}/.test(url)) throw new Error("Review requires a signed resume form URL"); return $json.discordSummary + "\\n\\nReview and decide: " + url; })() }}',
        options: {
            wait: true,
            flags: ['SUPPRESS_EMBEDS'],
        },
    };

    @node({
        id: 'flow4gold-review-HasKnownOrder',
        name: 'Has Known Order',
        type: 'n8n-nodes-base.if',
        version: 2.3,
        position: [960, 0],
    })
    HasKnownOrder = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
                version: 3,
            },
            conditions: [
                {
                    id: 'known-order',
                    leftValue: "={{ !!$('Prepare Review').first().json.order }}",
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
        id: 'flow4gold-review-WaitForDecision',
        webhookId: 'flow4gold-human-review-WaitForDecision',
        name: 'Wait for Decision',
        type: 'n8n-nodes-base.wait',
        version: 1.1,
        position: [1200, -140],
    })
    WaitForDecision = {
        resume: 'form',
        incomingAuthentication: 'none',
        formTitle: 'Flow4Gold human review',
        formDescription: "={{ $('Prepare Review').first().json.formDescription }}",
        formFields: {
            values: [
                {
                    fieldLabel: 'Decision',
                    fieldType: 'dropdown',
                    fieldOptions: {
                        values: [
                            {
                                option: 'Approve refund',
                            },
                            {
                                option: 'Reject',
                            },
                            {
                                option: 'Ask customer',
                            },
                        ],
                    },
                    requiredField: true,
                },
                {
                    fieldLabel: 'Message',
                    fieldType: 'textarea',
                    placeholder: 'Question for the customer, or reason for approving/rejecting the refund.',
                    requiredField: true,
                },
            ],
        },
        responseMode: 'onReceived',
        limitWaitTime: false,
    };

    @node({
        id: 'flow4gold-review-WaitForInformationDecision',
        webhookId: 'flow4gold-human-review-WaitForInformationDecision',
        name: 'Wait for Information Decision',
        type: 'n8n-nodes-base.wait',
        version: 1.1,
        position: [1200, 140],
    })
    WaitForInformationDecision = {
        resume: 'form',
        incomingAuthentication: 'none',
        formTitle: 'Flow4Gold human review',
        formDescription: "={{ $('Prepare Review').first().json.formDescription }}",
        formFields: {
            values: [
                {
                    fieldLabel: 'Decision',
                    fieldType: 'dropdown',
                    fieldOptions: {
                        values: [
                            {
                                option: 'Reject',
                            },
                            {
                                option: 'Ask customer',
                            },
                        ],
                    },
                    requiredField: true,
                },
                {
                    fieldLabel: 'Message',
                    fieldType: 'textarea',
                    placeholder: 'Question for the customer, or reason for approving/rejecting the refund.',
                    requiredField: true,
                },
            ],
        },
        responseMode: 'onReceived',
        limitWaitTime: false,
    };

    @node({
        id: 'flow4gold-review-BuildReviewResult',
        name: 'Build Review Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1440, 0],
    })
    BuildReviewResult = {
        mode: 'runOnceForAllItems',
        jsCode: `const invocation = $('Prepare Review').first().json;
const form = $input.first().json;
const decision = form.Decision;
if (!['Approve refund','Reject','Ask customer'].includes(decision)) throw new Error('An explicit review decision is required');
const message = typeof form.Message === 'string' ? form.Message.trim() : '';
if (!message || message.length > 4000) throw new Error('A message of 1–4000 characters is required');
const payload = {reviewEventId:invocation.triggerEventId,message};
let type = 'REJECTED';
if (decision === 'Approve refund') {
  const order = invocation.order;
  if (!order || invocation.orderLookupIssue || typeof order.amount !== 'number' || !Number.isFinite(order.amount) ||
      order.amount <= 0 || order.amount > 1000000 || Math.abs(order.amount * 100 - Math.round(order.amount * 100)) > 0.000001 ||
      typeof order.currency !== 'string' || !/^[A-Z]{3}$/.test(order.currency) ||
      typeof order.paymentReference !== 'string' || !order.paymentReference.trim() ||
      typeof order.orderReference !== 'string' || !order.orderReference.trim()) {
    throw new Error('Cannot approve without a valid recorded sample payment; ask customer for the order reference');
  }
  payload.proposal = {orderReference:order.orderReference,amount:order.amount,currency:order.currency,paymentReference:order.paymentReference,reason:message,simulation:true};
  type = 'REVIEW_APPROVED';
} else if (decision === 'Ask customer') type = 'NEED_MORE_INFO';
return [{json:{caseId:invocation.caseId,eventId:invocation.taskInvocationId+':result',taskInvocationId:invocation.taskInvocationId,
  causationId:invocation.triggerEventId,correlationId:invocation.correlationId,type,payload}}];
`,
    };

    @node({
        id: 'flow4gold-review-ReturnDomainEvent',
        name: 'Return Domain Event',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [1680, 0],
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
        this.ReceiveTask.out(0).to(this.ReadCaseEvents.in(0));
        this.ReadCaseEvents.out(0).to(this.ReadDemoOrders.in(0));
        this.ReadDemoOrders.out(0).to(this.PrepareReview.in(0));
        this.PrepareReview.out(0).to(this.PostToDiscord.in(0));
        this.PostToDiscord.out(0).to(this.HasKnownOrder.in(0));
        this.HasKnownOrder.out(0).to(this.WaitForDecision.in(0));
        this.HasKnownOrder.out(1).to(this.WaitForInformationDecision.in(0));
        this.WaitForDecision.out(0).to(this.BuildReviewResult.in(0));
        this.WaitForInformationDecision.out(0).to(this.BuildReviewResult.in(0));
        this.BuildReviewResult.out(0).to(this.ReturnDomainEvent.in(0));
    }
}
