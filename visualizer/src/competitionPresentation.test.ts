import { describe, expect, it } from 'vitest';
import definition from '../../machines/flow4gold-submission.v1.json';
import { parseMachine } from './machine';
import type { CompetitionEntry } from './competition';
import {
  competitionStats,
  contestants,
  entriesForContestant,
  nextStep,
  statusLabel,
} from './competitionPresentation';
const machine = parseMachine(definition);
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
      'REGISTERED',
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
