// <workflow-map>
// Workflow: Flow4Gold Competition - Notify Participant (Preview)
// ReceiveTask (executeWorkflowTrigger)
// Demo (manualTrigger)
// DemoInput (set)
// ValidateInvocation (code)
// ValidateRecipient (code)
// RouteState (switch)
// RegistrationMessage (code)
// ProgressMessage (code)
// QuestionMessage (code)
// InvitationMessage (code)
// PrizeMessage (code)
// OutcomeMessage (code)
// ComposeMessage (set)
// Preview (code)
// ReceiveTask[0] -> ValidateInvocation
// Demo[0] -> DemoInput
// DemoInput[0] -> ValidateInvocation
// ValidateInvocation[0] -> ValidateRecipient
// ValidateRecipient[0] -> RouteState
// RouteState[0] -> RegistrationMessage
// RegistrationMessage[0] -> ComposeMessage
// RouteState[1] -> ProgressMessage
// ProgressMessage[0] -> ComposeMessage
// RouteState[2] -> QuestionMessage
// QuestionMessage[0] -> ComposeMessage
// RouteState[3] -> InvitationMessage
// InvitationMessage[0] -> ComposeMessage
// RouteState[4] -> PrizeMessage
// PrizeMessage[0] -> ComposeMessage
// RouteState[5] -> OutcomeMessage
// OutcomeMessage[0] -> ComposeMessage
// ComposeMessage[0] -> Preview
// </workflow-map>
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
  "id": "u98rBfeXu4I66zMP",
  "name": "Flow4Gold Competition - Notify Participant (Preview)",
  "active": false,
  "isArchived": false,
  "projectId": "8d5DQtHZkgLco5Yr",
  "settings": {
    "executionOrder": "v1",
    "saveManualExecutions": false,
    "saveDataSuccessExecution": "none",
    "saveDataErrorExecution": "none"
  }
})
export class CompetitionNotifyParticipant {
  @node({
  "name": "Receive Task",
  "type": "n8n-nodes-base.executeWorkflowTrigger",
  "version": 1.2,
  "position": [
    -600,
    0
  ]
})
  ReceiveTask = {
  "inputSource": "passthrough"
};

  @node({
  "name": "Run Fictional Demo",
  "type": "n8n-nodes-base.manualTrigger",
  "version": 1,
  "position": [
    -860,
    260
  ]
})
  Demo = {};

  @node({
  "name": "Fictional Demo Input",
  "type": "n8n-nodes-base.set",
  "version": 3.5,
  "position": [
    -600,
    260
  ]
})
  DemoInput = {
  "mode": "raw",
  "jsonOutput": "{\"mode\": \"preview\", \"caseId\": \"demo-entry-001\", \"machine\": \"flow4gold-submission\", \"machineVersion\": 1, \"state\": \"NEEDS_INFORMATION\", \"task\": \"notify_participant\", \"triggerEventId\": \"demo-admin-001:INFORMATION_REQUESTED\", \"taskInvocationId\": \"demo-admin-001:INFORMATION_REQUESTED:notify_participant\", \"correlationId\": \"demo-competition-001\", \"input\": {\"recipientEmail\": \"contestant@example.invalid\", \"recipientVerified\": true, \"responseUrl\": \"https://example.invalid/entries/demo-entry-001\", \"question\": \"Please provide a video with audible narration.\"}}",
  "options": {}
};

  @node({
  "name": "Validate Notification Invocation",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    -330,
    0
  ]
})
  ValidateInvocation = {
  "mode": "runOnceForAllItems",
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
return [{json:x}];`
};

  @node({
  "name": "Validate Recipient and Response Link",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    -60,
    0
  ]
})
  ValidateRecipient = {
  "mode": "runOnceForAllItems",
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
return [{json:{...x,recipient,responseUrl}}];`
};

  @node({
  "name": "Route Notification State",
  "type": "n8n-nodes-base.switch",
  "version": 3.4,
  "position": [
    230,
    0
  ]
})
  RouteState = {
  "mode": "rules",
  "rules": {
    "values": [
      {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 3
          },
          "conditions": [
            {
              "id": "Registration PIN",
              "leftValue": "={{ $json.state === \"REGISTERED\" }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true",
                "singleValue": true
              }
            }
          ],
          "combinator": "and"
        },
        "renameOutput": true,
        "outputKey": "Registration PIN"
      },
      {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 3
          },
          "conditions": [
            {
              "id": "Progress update",
              "leftValue": "={{ $json.state === \"WAITING_FOR_PUBLICATION\" || $json.state === \"ADMIN_REVIEW\" || $json.state === \"JUDGING\" }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true",
                "singleValue": true
              }
            }
          ],
          "combinator": "and"
        },
        "renameOutput": true,
        "outputKey": "Progress update"
      },
      {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 3
          },
          "conditions": [
            {
              "id": "Information request",
              "leftValue": "={{ $json.state === \"NEEDS_INFORMATION\" }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true",
                "singleValue": true
              }
            }
          ],
          "combinator": "and"
        },
        "renameOutput": true,
        "outputKey": "Information request"
      },
      {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 3
          },
          "conditions": [
            {
              "id": "Invitation",
              "leftValue": "={{ $json.state === \"INVITED\" || $json.state === \"CONFIRMED\" }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true",
                "singleValue": true
              }
            }
          ],
          "combinator": "and"
        },
        "renameOutput": true,
        "outputKey": "Invitation"
      },
      {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 3
          },
          "conditions": [
            {
              "id": "Prize acceptance",
              "leftValue": "={{ $json.state === \"AWAITING_PRIZE_ACCEPTANCE\" }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true",
                "singleValue": true
              }
            }
          ],
          "combinator": "and"
        },
        "renameOutput": true,
        "outputKey": "Prize acceptance"
      },
      {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 3
          },
          "conditions": [
            {
              "id": "Final outcome",
              "leftValue": "={{ $json.state === \"CLOSED\" }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true",
                "singleValue": true
              }
            }
          ],
          "combinator": "and"
        },
        "renameOutput": true,
        "outputKey": "Final outcome"
      }
    ]
  },
  "options": {}
};

  @node({
  "name": "Registration PIN Message",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    580,
    -475.0
  ]
})
  RegistrationMessage = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
const input = x.input;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
let subject, body;

  subject = 'FLOW4GOLD registration received';
  body = 'Your entry is registered. Save your PIN: ' + required(input.registrationPin, 'input.registrationPin') + '. Publication may still be pending; send your workflow ID once it is published.';
  
return [{json:{...x,subject,body}}];`
};

  @node({
  "name": "Progress update Message",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    580,
    -285.0
  ]
})
  ProgressMessage = {
  "mode": "runOnceForAllItems",
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

return [{json:{...x,subject,body}}];`
};

  @node({
  "name": "Information request Message",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    580,
    -95.0
  ]
})
  QuestionMessage = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
const input = x.input;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
let subject, body;
 subject = 'FLOW4GOLD: information requested'; body = 'Please respond to this organizer question: ' + required(input.question, 'input.question'); 
return [{json:{...x,subject,body}}];`
};

  @node({
  "name": "Invitation Message",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    580,
    95.0
  ]
})
  InvitationMessage = {
  "mode": "runOnceForAllItems",
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

return [{json:{...x,subject,body}}];`
};

  @node({
  "name": "Prize acceptance Message",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    580,
    285.0
  ]
})
  PrizeMessage = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
const input = x.input;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
let subject, body;
 subject = 'FLOW4GOLD: please accept your prize'; body = 'The jury selected your entry as the winner. Please accept or decline the prize using the response link. Acceptance deadline: ' + required(input.acceptanceDeadline, 'input.acceptanceDeadline') + '. Acceptance does not confirm prize delivery.'; 
return [{json:{...x,subject,body}}];`
};

  @node({
  "name": "Final outcome Message",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    580,
    475.0
  ]
})
  OutcomeMessage = {
  "mode": "runOnceForAllItems",
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
return [{json:{...x,subject,body}}];`
};

  @node({
  "name": "Compose Participant Message",
  "type": "n8n-nodes-base.set",
  "version": 3.5,
  "position": [
    910,
    0
  ]
})
  ComposeMessage = {
  "assignments": {
    "assignments": [
      {
        "id": "message-text",
        "name": "text",
        "type": "string",
        "value": "={{ $json.body + '\\n\\nEntry: ' + $json.caseId + '\\nRespond or view your entry: ' + $json.responseUrl }}"
      }
    ]
  },
  "includeOtherFields": true,
  "options": {}
};

  @node({
  "name": "Return Undelivered Preview",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    1190,
    0
  ]
})
  Preview = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
return [{ json: { mode: 'preview', persisted: false, dispatched: false, delivered: false, machine: x.machine, machineVersion: x.machineVersion, caseId: x.caseId, correlationId: x.correlationId, events: [],
  effects: [{ type: 'notification', status: 'preview', deliveryKey: x.taskInvocationId, channel: 'email', to: x.recipient, subject: x.subject, text: x.text }],
  integration: { runtime: 'unbound', identity: 'trusted-caller-required', storage: 'unbound', delivery: 'unbound', obligations: ['Invoke only for newly accepted transitions, never replay.', 'Resolve recipient and allowlisted response URL from trusted case/config data, not user-submitted fields.', 'Persist an outbox with a unique deliveryKey and use provider idempotency before real delivery.', 'Restrict execution-data access: registration preview contains the recipient PIN.'] } } }];`
};

  @node({
  "name": "Integration Boundary",
  "type": "n8n-nodes-base.stickyNote",
  "version": 1,
  "position": [
    -880,
    -430
  ]
})
  Boundary = {
  "content": "## Participant notification — preview only\n1. Validate invocation, recipient and response link.\n2. Route by accepted state to its visible message template.\n3. Compose response link and return an undelivered preview.\n\nNo email sends. Stable deliveryKey is an outbox seam, not durable deduplication. Caller supplies trusted recipient/config data. Registration PIN appears only in its registration branch. Never notify during replay.",
  "height": 280,
  "width": 950,
  "color": 5
};

  @links()
  defineRouting() {
    this.ReceiveTask.out(0).to(this.ValidateInvocation.in(0));
    this.Demo.out(0).to(this.DemoInput.in(0));
    this.DemoInput.out(0).to(this.ValidateInvocation.in(0));
    this.ValidateInvocation.out(0).to(this.ValidateRecipient.in(0));
    this.ValidateRecipient.out(0).to(this.RouteState.in(0));
    this.RouteState.out(0).to(this.RegistrationMessage.in(0));
    this.RegistrationMessage.out(0).to(this.ComposeMessage.in(0));
    this.RouteState.out(1).to(this.ProgressMessage.in(0));
    this.ProgressMessage.out(0).to(this.ComposeMessage.in(0));
    this.RouteState.out(2).to(this.QuestionMessage.in(0));
    this.QuestionMessage.out(0).to(this.ComposeMessage.in(0));
    this.RouteState.out(3).to(this.InvitationMessage.in(0));
    this.InvitationMessage.out(0).to(this.ComposeMessage.in(0));
    this.RouteState.out(4).to(this.PrizeMessage.in(0));
    this.PrizeMessage.out(0).to(this.ComposeMessage.in(0));
    this.RouteState.out(5).to(this.OutcomeMessage.in(0));
    this.OutcomeMessage.out(0).to(this.ComposeMessage.in(0));
    this.ComposeMessage.out(0).to(this.Preview.in(0));
  }
}
