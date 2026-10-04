import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold Competition - Notify Participant (Preview)
// Nodes   : 15  |  Connections: 18
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveTask                        executeWorkflowTrigger
// RunFictionalDemo                   manualTrigger
// FictionalDemoInput                 set
// ValidateNotificationInvocation     code
// ValidateRecipientAndResponseLink   code
// RouteNotificationState             switch
// RegistrationPinMessage             code
// ProgressUpdateMessage              code
// InformationRequestMessage          code
// InvitationMessage                  code
// PrizeAcceptanceMessage             code
// FinalOutcomeMessage                code
// ComposeParticipantMessage          set
// ReturnUndeliveredPreview           code
// IntegrationBoundary                stickyNote
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveTask
//    → ValidateNotificationInvocation
//      → ValidateRecipientAndResponseLink
//        → RouteNotificationState
//          → RegistrationPinMessage
//            → ComposeParticipantMessage
//              → ReturnUndeliveredPreview
//         .out(1) → ProgressUpdateMessage
//            → ComposeParticipantMessage (↩ loop)
//         .out(2) → InformationRequestMessage
//            → ComposeParticipantMessage (↩ loop)
//         .out(3) → InvitationMessage
//            → ComposeParticipantMessage (↩ loop)
//         .out(4) → PrizeAcceptanceMessage
//            → ComposeParticipantMessage (↩ loop)
//         .out(5) → FinalOutcomeMessage
//            → ComposeParticipantMessage (↩ loop)
// RunFictionalDemo
//    → FictionalDemoInput
//      → ValidateNotificationInvocation (↩ loop)
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'u98rBfeXu4I66zMP',
    name: 'Flow4Gold Competition - Notify Participant (Preview)',
    active: false,
    isArchived: false,
    settings: { saveManualExecutions: false, saveDataErrorExecution: 'none', executionOrder: 'v1' },
})
export class Flow4goldCompetitionNotifyParticipantPreviewWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '31cb1159-2639-46e2-957b-b801934e1f6a',
        name: 'Receive Task',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [-600, 0],
    })
    ReceiveTask = {
        inputSource: 'passthrough',
    };

    @node({
        id: '95b59153-1a70-4e38-8283-249d5e7e24c7',
        name: 'Run Fictional Demo',
        type: 'n8n-nodes-base.manualTrigger',
        version: 1,
        position: [-860, 260],
    })
    RunFictionalDemo = {};

    @node({
        id: '84b8b973-6149-40e8-aae7-c6fdb18d58b7',
        name: 'Fictional Demo Input',
        type: 'n8n-nodes-base.set',
        version: 3.5,
        position: [-600, 260],
    })
    FictionalDemoInput = {
        mode: 'manual',
        assignments: {
            assignments: [
                {
                    id: 'mode',
                    name: 'mode',
                    type: 'string',
                    value: 'preview',
                },
                {
                    id: 'caseId',
                    name: 'caseId',
                    type: 'string',
                    value: 'demo-entry-001',
                },
                {
                    id: 'machine',
                    name: 'machine',
                    type: 'string',
                    value: 'flow4gold-submission',
                },
                {
                    id: 'machineVersion',
                    name: 'machineVersion',
                    type: 'number',
                    value: 1,
                },
                {
                    id: 'state',
                    name: 'state',
                    type: 'string',
                    value: 'NEEDS_INFORMATION',
                },
                {
                    id: 'task',
                    name: 'task',
                    type: 'string',
                    value: 'notify_participant',
                },
                {
                    id: 'triggerEventId',
                    name: 'triggerEventId',
                    type: 'string',
                    value: 'demo-admin-001:INFORMATION_REQUESTED',
                },
                {
                    id: 'taskInvocationId',
                    name: 'taskInvocationId',
                    type: 'string',
                    value: 'demo-admin-001:INFORMATION_REQUESTED:notify_participant',
                },
                {
                    id: 'correlationId',
                    name: 'correlationId',
                    type: 'string',
                    value: 'demo-competition-001',
                },
                {
                    id: 'input',
                    name: 'input',
                    type: 'object',
                    value: {
                        recipientEmail: 'contestant@example.invalid',
                        recipientVerified: true,
                        responseUrl: 'https://example.invalid/entries/demo-entry-001',
                        question: 'Please provide a video with audible narration.',
                    },
                },
            ],
        },
        options: {},
    };

    @node({
        id: 'e3e51a0e-33fe-4efe-a67a-f35e466e3be4',
        name: 'Validate Notification Invocation',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [-330, 0],
    })
    ValidateNotificationInvocation = {
        mode: 'runOnceForAllItems',
        jsCode: `const items = $input.all();
if (items.length !== 1) throw new Error('One notification invocation required');
const x = items[0].json;
if (x.mode !== 'preview') throw new Error('Only preview mode is supported');
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
for (const key of ['caseId','taskInvocationId','triggerEventId','correlationId']) required(x[key], key);
if (x.machine !== 'flow4gold-submission' || x.machineVersion !== 1 || x.task !== 'notify_participant') throw new Error('Unsupported notification invocation');
if (x.taskInvocationId !== x.triggerEventId + ':notify_participant') throw new Error('Notification invocation ID must be triggerEventId:notify_participant');
const input = x.input;
if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Notification input required');
return [{json:x}];`,
    };

    @node({
        id: 'ad1e3ac8-28ab-4d19-8225-86e58c069f7f',
        name: 'Validate Recipient and Response Link',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [-60, 0],
    })
    ValidateRecipientAndResponseLink = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const input = x.input;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const recipient = required(input.recipientEmail, 'input.recipientEmail');
if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(recipient)) throw new Error('Invalid recipient email');
if (input.recipientVerified !== true) throw new Error('Trusted caller must resolve the verified case recipient');
const responseUrl = required(input.responseUrl, 'input.responseUrl');
if (!/^https:\\/\\/[^\\s]+$/.test(responseUrl) || /[\\r\\n]/.test(responseUrl)) throw new Error('HTTPS response URL required');

const states = ['REGISTERED','WAITING_FOR_PUBLICATION','ADMIN_REVIEW','NEEDS_INFORMATION','INVITED','CONFIRMED','JUDGING','AWAITING_PRIZE_ACCEPTANCE','CLOSED'];
if (!states.includes(x.state)) throw new Error('No notification template for state');
return [{json:{...x,recipient,responseUrl}}];`,
    };

    @node({
        id: '6cd4169b-df3e-4c17-ac1c-f4450587f0b0',
        name: 'Route Notification State',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [230, 0],
    })
    RouteNotificationState = {
        mode: 'expression',
        numberOutputs: 6,
        output: '={{ ($json.state === "REGISTERED") ? 0 : ($json.state === "WAITING_FOR_PUBLICATION" || $json.state === "ADMIN_REVIEW" || $json.state === "JUDGING") ? 1 : ($json.state === "NEEDS_INFORMATION") ? 2 : ($json.state === "INVITED" || $json.state === "CONFIRMED") ? 3 : ($json.state === "AWAITING_PRIZE_ACCEPTANCE") ? 4 : ($json.state === "CLOSED") ? 5 : -1 }}',
    };

    @node({
        id: 'a6cba457-84eb-4828-8140-cbe88b8f79eb',
        name: 'Registration PIN Message',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [580, -475],
    })
    RegistrationPinMessage = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const input = x.input;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
let subject, body;

  subject = 'FLOW4GOLD registration received';
  body = 'Your entry is registered. Save your PIN: ' + required(input.registrationPin, 'input.registrationPin') + '. Publication may still be pending; send your workflow ID once it is published.';
  
return [{json:{...x,subject,body}}];`,
    };

    @node({
        id: 'cc0aedc7-808e-4676-8d1e-d93bd71127c7',
        name: 'Progress update Message',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [580, -285],
    })
    ProgressUpdateMessage = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const input = x.input;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
let subject, body;
if (x.state === 'WAITING_FOR_PUBLICATION') {

  subject = 'FLOW4GOLD: waiting for your published workflow';
  body = 'Your registration remains recorded. Once your template is published, use the response link to provide its workflow ID.';
  
}
else if (x.state === 'ADMIN_REVIEW') {
 subject = 'FLOW4GOLD entry in review'; body = 'Your entry is ready for organizer review. We will contact you if we need more information.'; 
}
else if (x.state === 'JUDGING') {
 subject = 'FLOW4GOLD check-in recorded'; body = 'Your check-in has been recorded. The human jury will determine the result.'; 
}

return [{json:{...x,subject,body}}];`,
    };

    @node({
        id: '03a87404-46c1-43c9-94bc-3f7c76485c76',
        name: 'Information request Message',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [580, -95],
    })
    InformationRequestMessage = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const input = x.input;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
let subject, body;
 subject = 'FLOW4GOLD: information requested'; body = 'Please respond to this organizer question: ' + required(input.question, 'input.question'); 
return [{json:{...x,subject,body}}];`,
    };

    @node({
        id: 'b5292145-fe51-473e-b5d6-a13265fba25c',
        name: 'Invitation Message',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [580, 95],
    })
    InvitationMessage = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const input = x.input;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
let subject, body;
if (x.state === 'INVITED') {
 subject = 'FLOW4GOLD finalist invitation'; body = 'You have been selected as a finalist. Please accept or decline using the response link. Details: ' + required(input.invitationDetails, 'input.invitationDetails'); 
}
else if (x.state === 'CONFIRMED') {
 subject = 'FLOW4GOLD attendance confirmed'; body = 'Your participation is confirmed. Details: ' + required(input.invitationDetails, 'input.invitationDetails'); 
}

return [{json:{...x,subject,body}}];`,
    };

    @node({
        id: '9511ab2e-7294-4546-9093-c1683c49ded7',
        name: 'Prize acceptance Message',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [580, 285],
    })
    PrizeAcceptanceMessage = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const input = x.input;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
let subject, body;
 subject = 'FLOW4GOLD: please accept your prize'; body = 'The jury selected your entry as the winner. Please accept or decline the prize using the response link. Acceptance deadline: ' + required(input.acceptanceDeadline, 'input.acceptanceDeadline') + '. Acceptance does not confirm prize delivery.'; 
return [{json:{...x,subject,body}}];`,
    };

    @node({
        id: '1bea7928-3066-4ff1-9c5d-10bdd056b191',
        name: 'Final outcome Message',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [580, 475],
    })
    FinalOutcomeMessage = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const input = x.input;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
let subject, body;
 {
  const messages = {
    WITHDRAWN: 'Your entry has been withdrawn.', NOT_SELECTED: 'Your entry was not selected as a finalist.', DISQUALIFIED: 'Your entry was disqualified. Reason: ' + (input.reason || ''), DECLINED: 'Your invitation decline has been recorded.', NO_SHOW: 'The organizer recorded that you did not attend.', RUNNER_UP: 'Thank you for participating as a finalist. Your entry was not selected as the winner.', WINNER: 'Your prize acceptance has been recorded. The organizer will arrange delivery separately.', PRIZE_UNCLAIMED: 'The prize was declined or its acceptance deadline expired. Contact the organizer if you have questions.'
  };
  if (!Object.prototype.hasOwnProperty.call(messages, input.outcome)) throw new Error('Known closed outcome required');
  if (input.outcome === 'DISQUALIFIED') required(input.reason, 'input.reason');
  subject = 'FLOW4GOLD entry outcome: ' + input.outcome;
  body = messages[input.outcome];
}
return [{json:{...x,subject,body}}];`,
    };

    @node({
        id: '18d5b83e-85ca-4e74-b7eb-9417d4bd3542',
        name: 'Compose Participant Message',
        type: 'n8n-nodes-base.set',
        version: 3.5,
        position: [910, 0],
    })
    ComposeParticipantMessage = {
        assignments: {
            assignments: [
                {
                    id: 'message-text',
                    name: 'text',
                    type: 'string',
                    value: "={{ $json.body + '\\n\\nEntry: ' + $json.caseId + '\\nRespond or view your entry: ' + $json.responseUrl }}",
                },
            ],
        },
        includeOtherFields: true,
        options: {},
        mode: 'manual',
    };

    @node({
        id: '346b247e-8f62-46c8-939d-f4e83a18b613',
        name: 'Return Undelivered Preview',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1190, 0],
    })
    ReturnUndeliveredPreview = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
return [{ json: { mode: 'preview', persisted: false, dispatched: false, delivered: false, machine: x.machine, machineVersion: x.machineVersion, caseId: x.caseId, correlationId: x.correlationId, events: [],
  effects: [{ type: 'notification', status: 'preview', deliveryKey: x.taskInvocationId, channel: 'email', to: x.recipient, subject: x.subject, text: x.text }],
  integration: { runtime: 'unbound', identity: 'trusted-caller-required', storage: 'unbound', delivery: 'unbound', obligations: ['Invoke only for newly accepted transitions, never replay.', 'Resolve recipient and allowlisted response URL from trusted case/config data, not user-submitted fields.', 'Persist an outbox with a unique deliveryKey and use provider idempotency before real delivery.', 'Restrict execution-data access: registration preview contains the recipient PIN.'] } } }];`,
    };

    @node({
        id: '5137fb17-2d7d-4761-8a49-f32f241c9523',
        name: 'Integration Boundary',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [-880, -430],
    })
    IntegrationBoundary = {
        content: `## Participant notification — preview only
1. Validate invocation, recipient and response link.
2. Route by accepted state to its visible message template.
3. Compose response link and return an undelivered preview.

No email sends. Stable deliveryKey is an outbox seam, not durable deduplication. Caller supplies trusted recipient/config data. Registration PIN appears only in its registration branch. Never notify during replay.`,
        height: 280,
        width: 950,
        color: 5,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ReceiveTask.out(0).to(this.ValidateNotificationInvocation.in(0));
        this.RunFictionalDemo.out(0).to(this.FictionalDemoInput.in(0));
        this.FictionalDemoInput.out(0).to(this.ValidateNotificationInvocation.in(0));
        this.ValidateNotificationInvocation.out(0).to(this.ValidateRecipientAndResponseLink.in(0));
        this.ValidateRecipientAndResponseLink.out(0).to(this.RouteNotificationState.in(0));
        this.RouteNotificationState.out(0).to(this.RegistrationPinMessage.in(0));
        this.RouteNotificationState.out(1).to(this.ProgressUpdateMessage.in(0));
        this.RouteNotificationState.out(2).to(this.InformationRequestMessage.in(0));
        this.RouteNotificationState.out(3).to(this.InvitationMessage.in(0));
        this.RouteNotificationState.out(4).to(this.PrizeAcceptanceMessage.in(0));
        this.RouteNotificationState.out(5).to(this.FinalOutcomeMessage.in(0));
        this.RegistrationPinMessage.out(0).to(this.ComposeParticipantMessage.in(0));
        this.ProgressUpdateMessage.out(0).to(this.ComposeParticipantMessage.in(0));
        this.InformationRequestMessage.out(0).to(this.ComposeParticipantMessage.in(0));
        this.InvitationMessage.out(0).to(this.ComposeParticipantMessage.in(0));
        this.PrizeAcceptanceMessage.out(0).to(this.ComposeParticipantMessage.in(0));
        this.FinalOutcomeMessage.out(0).to(this.ComposeParticipantMessage.in(0));
        this.ComposeParticipantMessage.out(0).to(this.ReturnUndeliveredPreview.in(0));
    }
}
