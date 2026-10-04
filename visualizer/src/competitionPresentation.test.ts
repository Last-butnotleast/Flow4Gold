import { describe, expect, it } from 'vitest';
import definition from '../../machines/flow4gold-submission.v1.json';
import { parseMachine } from './machine';
import type { CompetitionEntry } from './competition';
import {
  competitionStats,
  inboxState,
  contestants,
  entriesForContestant,
  nextStep,
  statusLabel,
} from './competitionPresentation';
const taskDefinition = structuredClone(definition);
Object.assign(taskDefinition.states.REGISTERED, { tasks: ['prepare_submission'] });
Object.assign(taskDefinition.states.REGISTERED.on.WORKFLOW_LINKED, { taskResult: true });
Object.assign(taskDefinition.states.REGISTERED.on.PUBLICATION_PENDING, { taskResult: true });
const machine = parseMachine(taskDefinition);
// Test fixtures describe server snapshots; production never seeds or advances entries locally.
const fixture = (overrides: Partial<CompetitionEntry> = {}): CompetitionEntry => ({
  caseId: 'competition-test',
  title: 'Workflow',
  name: 'Alex',
  email: 'alex@example.invalid',
  videoUrl: 'https://example.invalid/video',
  machine,
  state: 'WAITING_FOR_PUBLICATION',
  sequence: 2,
  events: [],
  ...overrides,
});
describe('competition presentation of recorded snapshots', () => {
  it('covers every machine state and meaningful contestant actions', () => {
    const actionable = [
      'WAITING_FOR_PUBLICATION',
      'NEEDS_INFORMATION',
      'INVITED',
      'AWAITING_PRIZE_ACCEPTANCE',
    ];
    for (const state of Object.keys(machine.states)) {
      const entry = fixture({ state });
      const step = nextStep(entry);
      expect(step.title).not.toBe('No action needed');
      expect(step.description.length).toBeGreaterThan(10);
      expect(statusLabel(entry)).not.toMatch(/_/);
      expect(step.actionable, state).toBe(actionable.includes(state));
    }
  });
  it('shows the latest recorded organizer question, not old clarification', () => {
    const events = [
      {
        eventId: 'question-1',
        sequence: 1,
        type: 'INFORMATION_REQUESTED',
        payload: { question: 'First question?' },
      },
      {
        eventId: 'question-2',
        sequence: 2,
        type: 'INFORMATION_REQUESTED',
        payload: { question: '  Is your ticket confirmed?  ' },
      },
    ];
    expect(nextStep(fixture({ state: 'NEEDS_INFORMATION', events }))).toEqual({
      title: 'Reply to the organizers',
      description: 'Is your ticket confirmed?',
      actionable: true,
    });
    expect(nextStep(fixture({ state: 'ADMIN_REVIEW', events })).description).not.toContain(
      'ticket',
    );
  });
  it('shows distinct final outcomes without claiming prize delivery', () => {
    const outcomes = new Set(
      Object.values(machine.states).flatMap((state) =>
        Object.values({ ...state.on, ...state.decide }).flatMap((edge) =>
          edge.outcome ? [edge.outcome] : [],
        ),
      ),
    );
    const titles = new Set<string>();
    for (const outcome of outcomes) {
      const entry = fixture({ state: 'CLOSED', outcome }),
        step = nextStep(entry);
      expect(step.actionable).toBe(false);
      expect(step.title).not.toBe('Your entry is complete');
      expect(statusLabel(entry)).not.toBe('Closed');
      titles.add(step.title);
    }
    expect(titles.size).toBe(outcomes.size);
    expect(nextStep(fixture({ state: 'CLOSED', outcome: 'WINNER' })).description).not.toMatch(
      /delivered|paid/,
    );
  });
  it('summarizes stored history including a finalist who declined', () => {
    const entries = [
      fixture(),
      fixture({ caseId: 'review', state: 'ADMIN_REVIEW' }),
      fixture({
        caseId: 'declined',
        state: 'CLOSED',
        outcome: 'DECLINED',
        events: [{ eventId: 'finalist', sequence: 1, type: 'FINALIST_SELECTED', payload: {} }],
      }),
    ];
    expect(competitionStats(entries)).toEqual({
      total: 3,
      review: 1,
      waiting: 1,
      finalists: 1,
      closed: 1,
    });
    expect(competitionStats([])).toEqual({
      total: 0,
      review: 0,
      waiting: 0,
      finalists: 0,
      closed: 0,
    });
  });
  it('groups workbench views by normalized email without treating them as login', () => {
    const first = fixture(),
      second = fixture({ caseId: 'second', email: ' ALEX@EXAMPLE.INVALID ', name: 'Alex Updated' }),
      other = fixture({ caseId: 'other', email: 'another@example.invalid' });
    expect(contestants([first, second, other])).toEqual([
      { email: 'alex@example.invalid', name: 'Alex' },
      { email: 'another@example.invalid', name: 'Alex' },
    ]);
    expect(entriesForContestant([first, second, other], ' Alex@Example.invalid ')).toEqual([
      first,
      second,
    ]);
    expect(entriesForContestant([first], 'unknown@example.invalid')).toEqual([]);
    expect(contestants([])).toEqual([]);
  });
});

describe('persisted competition inbox', () => {
  const message = {
    taskInvocationId: 'prepared:notify_participant',
    caseId: 'competition-test',
    triggerEventId: 'prepared',
    correlationId: 'competition-test',
    machine: 'flow4gold-submission',
    machineVersion: 1,
    state: 'WAITING_FOR_PUBLICATION',
    sequence: 2,
    subject: 'Stored subject',
    message: 'Actual task output, not a state fallback.',
    channel: 'in_app' as const,
  };
  it('shows preparation without a manual publication step while the task runs', () => {
    const preparing = fixture({
      state: 'REGISTERED',
      notification: { channel: 'in_app', status: 'not_expected', delivered: false, current: null },
    });
    expect(nextStep(preparing).title).toBe('Preparing your submission');
    expect(nextStep(preparing).actionable).toBe(false);
    expect(inboxState(preparing)).toMatchObject({ preparing: true, current: null, pending: false });
  });
  it('does not invent a message while the notification row is pending', () => {
    const pending = fixture({
      notification: { channel: 'in_app', status: 'pending', delivered: false, current: null },
      notifications: [],
    });
    expect(inboxState(pending)).toEqual({
      preparing: false,
      pending: true,
      current: null,
      history: [],
    });
    expect(nextStep(pending).actionable).toBe(true);
  });
  it('renders actual stored content and keeps prior state messages separate', () => {
    const older = {
      ...message,
      taskInvocationId: 'old:notify_participant',
      triggerEventId: 'old',
      sequence: 1,
    };
    const saved = fixture({
      notification: { channel: 'in_app', status: 'delivered', delivered: true, current: message },
      notifications: [older, message],
    });
    expect(inboxState(saved).current?.message).toBe('Actual task output, not a state fallback.');
    expect(inboxState(saved).history).toEqual([older]);
    const closed = fixture({
      state: 'CLOSED',
      outcome: 'NOT_SELECTED',
      notification: { channel: 'in_app', status: 'not_expected', delivered: false, current: null },
      notifications: [message],
    });
    expect(inboxState(closed).current).toBeNull();
    expect(inboxState(closed).history).toEqual([message]);
  });
});
