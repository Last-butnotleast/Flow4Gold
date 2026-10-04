// <workflow-map>
// Workflow: Flow4Gold Competition - Handle Organizer Action (Preview)
// ReceiveTask (executeWorkflowTrigger)
// Demo (manualTrigger)
// DemoInput (set)
// ValidateRequest (code)
// PrepareEvidence (code)
// RouteAction (switch)
// QuestionEvidence (code)
// JuryEvidence (code)
// AttendanceEvidence (code)
// ExpiryEvidence (code)
// DisqualificationEvidence (code)
// PrepareEvent (code)
// Preview (code)
// ReceiveTask[0] -> ValidateRequest
// Demo[0] -> DemoInput
// DemoInput[0] -> ValidateRequest
// ValidateRequest[0] -> PrepareEvidence
// PrepareEvidence[0] -> RouteAction
// RouteAction[0] -> QuestionEvidence
// QuestionEvidence[0] -> PrepareEvent
// RouteAction[1] -> JuryEvidence
// JuryEvidence[0] -> PrepareEvent
// RouteAction[2] -> AttendanceEvidence
// AttendanceEvidence[0] -> PrepareEvent
// RouteAction[3] -> ExpiryEvidence
// ExpiryEvidence[0] -> PrepareEvent
// RouteAction[4] -> DisqualificationEvidence
// DisqualificationEvidence[0] -> PrepareEvent
// PrepareEvent[0] -> Preview
// </workflow-map>
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
  "id": "II9743VhDIHuMPiO",
  "name": "Flow4Gold Competition - Handle Organizer Action (Preview)",
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
export class CompetitionOrganizerAction {
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
  "jsonOutput": "{\"mode\": \"preview\", \"caseId\": \"demo-entry-001\", \"requestId\": \"demo-admin-001\", \"correlationId\": \"demo-competition-001\", \"machine\": \"flow4gold-submission\", \"machineVersion\": 1, \"actor\": {\"id\": \"demo-organizer\", \"role\": \"organizer\", \"verified\": true}, \"action\": \"INFORMATION_REQUESTED\", \"evidence\": {\"reason\": \"Video audio is unclear.\", \"revision\": \"demo-revision-1\", \"question\": \"Please provide a video with audible narration.\"}}",
  "options": {}
};

  @node({
  "name": "Validate Trusted Organizer Request",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    -330,
    0
  ]
})
  ValidateRequest = {
  "mode": "runOnceForAllItems",
  jsCode: `const items = $input.all();
if (items.length !== 1) throw new Error('One organizer request required');
const x = items[0].json;
if (x.mode !== 'preview') throw new Error('Only preview mode is supported');
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
for (const key of ['caseId','requestId','correlationId']) required(x[key], key);
if (x.machine !== 'flow4gold-submission' || x.machineVersion !== 1) throw new Error('Unsupported machine/version');
if (!x.actor || x.actor.role !== 'organizer' || x.actor.verified !== true) throw new Error('Verified organizer assertion required from trusted caller');
required(x.actor.id, 'actor.id');
const actions = ['INFORMATION_REQUESTED','ENTRY_DISQUALIFIED','FINALIST_SELECTED','NOT_SELECTED','CHECKED_IN','NO_SHOW_RECORDED','WINNER_SELECTED','RUNNER_UP_SELECTED','PRIZE_ACCEPTANCE_EXPIRED'];
if (!actions.includes(x.action)) throw new Error('Unsupported organizer action');
const evidence = x.evidence;
if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('Evidence required');
return [{json: x}];`
};

  @node({
  "name": "Prepare Decision Evidence",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    -60,
    0
  ]
})
  PrepareEvidence = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = { actor: { id: x.actor.id, role: 'organizer' }, reason: required(evidence.reason, 'evidence.reason'), evidenceRevision: required(evidence.revision, 'evidence.revision') };
const obligations = ['Authenticate organizer outside this callable workflow; payload verified=true is not authentication.', 'Persist evidence and deduplicate requestId before dispatch.', 'Runtime must serialize case events and validate the current state.'];
return [{json: {...x, payload, obligations}}];`
};

  @node({
  "name": "Route Organizer Action",
  "type": "n8n-nodes-base.switch",
  "version": 3.4,
  "position": [
    220,
    0
  ]
})
  RouteAction = {
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
              "id": "Question",
              "leftValue": "={{ $json.action === \"INFORMATION_REQUESTED\" }}",
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
        "outputKey": "Question"
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
              "id": "Jury decision",
              "leftValue": "={{ $json.action === \"FINALIST_SELECTED\" || $json.action === \"WINNER_SELECTED\" || $json.action === \"RUNNER_UP_SELECTED\" || $json.action === \"NOT_SELECTED\" }}",
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
        "outputKey": "Jury decision"
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
              "id": "Attendance",
              "leftValue": "={{ $json.action === \"CHECKED_IN\" || $json.action === \"NO_SHOW_RECORDED\" }}",
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
        "outputKey": "Attendance"
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
              "id": "Prize expiry",
              "leftValue": "={{ $json.action === \"PRIZE_ACCEPTANCE_EXPIRED\" }}",
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
        "outputKey": "Prize expiry"
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
              "id": "Disqualification",
              "leftValue": "={{ $json.action === \"ENTRY_DISQUALIFIED\" }}",
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
        "outputKey": "Disqualification"
      }
    ]
  },
  "options": {}
};

  @node({
  "name": "Record Missing Information",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    560,
    -440
  ]
})
  QuestionEvidence = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = {...x.payload};
const obligations = [...x.obligations];
payload.question = required(evidence.question, 'evidence.question');
return [{json: {...x, payload, obligations}}];`
};

  @node({
  "name": "Validate Human Jury Decision",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    560,
    -220
  ]
})
  JuryEvidence = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = {...x.payload};
const obligations = [...x.obligations];
if (['FINALIST_SELECTED','WINNER_SELECTED','RUNNER_UP_SELECTED','NOT_SELECTED'].includes(x.action)) payload.juryDecisionId = required(evidence.juryDecisionId, 'evidence.juryDecisionId');
if (x.action === 'FINALIST_SELECTED' || x.action === 'WINNER_SELECTED') {
  payload.competitionId = required(x.competitionId, 'competitionId');
  obligations.push(x.action === 'FINALIST_SELECTED' ? 'Atomically reserve one of three finalist slots in shared competition storage before dispatch.' : 'Atomically reserve the single winner slot in shared competition storage before dispatch.');
}
if (x.action === 'FINALIST_SELECTED') payload.invitationDetails = required(evidence.invitationDetails, 'evidence.invitationDetails');

return [{json: {...x, payload, obligations}}];`
};

  @node({
  "name": "Validate Attendance Evidence",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    560,
    0
  ]
})
  AttendanceEvidence = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = {...x.payload};
const obligations = [...x.obligations];
payload.attendanceRecord = required(evidence.attendanceRecord, 'evidence.attendanceRecord');
return [{json: {...x, payload, obligations}}];`
};

  @node({
  "name": "Verify Acceptance Expiry",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    560,
    220
  ]
})
  ExpiryEvidence = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = {...x.payload};
const obligations = [...x.obligations];
if (x.action === 'PRIZE_ACCEPTANCE_EXPIRED') {
  const deadline = required(evidence.acceptanceDeadline, 'evidence.acceptanceDeadline');
  const checkedAt = required(evidence.checkedAt, 'evidence.checkedAt');
  if (!Number.isFinite(Date.parse(deadline)) || !Number.isFinite(Date.parse(checkedAt)) || Date.parse(checkedAt) <= Date.parse(deadline) || evidence.noAcceptanceRecorded !== true) throw new Error('Expiry requires checked time after deadline and verified absence of acceptance');
  Object.assign(payload, { acceptanceDeadline: deadline, checkedAt, noAcceptanceRecorded: true });
  obligations.push('Recheck deadline and absence of acceptance under the same case lock before dispatch.');
}

return [{json: {...x, payload, obligations}}];`
};

  @node({
  "name": "Record Disqualification Reason",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    560,
    440
  ]
})
  DisqualificationEvidence = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing ' + name); return value.trim(); };
const evidence = x.evidence;
const payload = {...x.payload};
const obligations = [...x.obligations];
// Common evidence already requires the organizer reason and revision.
return [{json: {...x, payload, obligations}}];`
};

  @node({
  "name": "Prepare Stable Domain Event",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    880,
    0
  ]
})
  PrepareEvent = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
const event = {eventId: JSON.stringify([x.caseId, x.requestId, x.action]), caseId: x.caseId, machine: x.machine, machineVersion: x.machineVersion, type: x.action, payload: x.payload, correlationId: x.correlationId, causationId: x.requestId};
return [{json: {...x, event}}];`
};

  @node({
  "name": "Return Undispatched Preview",
  "type": "n8n-nodes-base.code",
  "version": 2,
  "position": [
    1160,
    0
  ]
})
  Preview = {
  "mode": "runOnceForAllItems",
  jsCode: `const x = $input.first().json;
return [{json: {mode:'preview',persisted:false,dispatched:false,machine:x.machine,machineVersion:x.machineVersion,caseId:x.caseId,correlationId:x.correlationId,events:[x.event],effects:[],integration:{runtime:'unbound',identity:'trusted-caller-required',storage:'unbound',obligations:x.obligations}}}];`
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
  "content": "## Organizer action — preview only\n1. Validate the trusted organizer request.\n2. Route to question, jury, attendance, expiry or disqualification evidence.\n3. Prepare a stable event proposal.\n\nNo persistence or runtime dispatch. The runtime owns legal transitions. Before real dispatch authenticate actors, save evidence, deduplicate requests, and atomically enforce three finalist slots / one winner across the competition.",
  "height": 280,
  "width": 950,
  "color": 5
};

  @links()
  defineRouting() {
    this.ReceiveTask.out(0).to(this.ValidateRequest.in(0));
    this.Demo.out(0).to(this.DemoInput.in(0));
    this.DemoInput.out(0).to(this.ValidateRequest.in(0));
    this.ValidateRequest.out(0).to(this.PrepareEvidence.in(0));
    this.PrepareEvidence.out(0).to(this.RouteAction.in(0));
    this.RouteAction.out(0).to(this.QuestionEvidence.in(0));
    this.QuestionEvidence.out(0).to(this.PrepareEvent.in(0));
    this.RouteAction.out(1).to(this.JuryEvidence.in(0));
    this.JuryEvidence.out(0).to(this.PrepareEvent.in(0));
    this.RouteAction.out(2).to(this.AttendanceEvidence.in(0));
    this.AttendanceEvidence.out(0).to(this.PrepareEvent.in(0));
    this.RouteAction.out(3).to(this.ExpiryEvidence.in(0));
    this.ExpiryEvidence.out(0).to(this.PrepareEvent.in(0));
    this.RouteAction.out(4).to(this.DisqualificationEvidence.in(0));
    this.DisqualificationEvidence.out(0).to(this.PrepareEvent.in(0));
    this.PrepareEvent.out(0).to(this.Preview.in(0));
  }
}
