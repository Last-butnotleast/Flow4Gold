import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  allowedEvents,
  reconcileEntries,
  decodeEntry,
  loadCompetitionEntries,
  registerCompetitionEntry,
  recordCompetitionAction,
  registrationBody,
  requestIdentity,
  type CompetitionEntry,
  type EntryInput,
} from './competition';
import definition from '../../machines/flow4gold-submission.v1.json';
import { parseMachine } from './machine';
const entry = (): CompetitionEntry => ({
  caseId: 'competition-entry',
  machine: parseMachine(definition),
  state: 'WAITING_FOR_PUBLICATION',
  sequence: 2,
  events: [],
  title: 'Saved workflow',
  name: 'Alex',
  email: 'alex@example.invalid',
  videoUrl: 'https://example.invalid/video',
});
const input: EntryInput = {
  name: 'Alex',
  email: 'alex@example.invalid',
  title: 'Saved workflow',
  videoUrl: 'https://example.invalid/video',
  templateSubmitted: true,
  ticketConfirmed: true,
  privacyConsent: true,
  recordingConsent: true,
};
afterEach(() => vi.unstubAllGlobals());
describe('competition HTTP client', () => {
  it('loads persisted entries and their own machine definition without app seeds', async () => {
    const saved = entry();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: [saved] }) }),
    );
    expect(await loadCompetitionEntries()).toEqual([saved]);
  });
  it('accepts an empty server list without inventing sample entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: [] }) }),
    );
    expect(await loadCompetitionEntries()).toEqual([]);
  });
  it('fails when server definition is absent, instead of using a local machine', () => {
    expect(() =>
      decodeEntry({ ...entry(), machine: undefined } as unknown as CompetitionEntry),
    ).toThrow();
  });
  it('uses stable request identities on unchanged-payload retries, including undefined fields', () => {
    const id = vi.fn().mockReturnValueOnce('first').mockReturnValueOnce('second');
    const initial = requestIdentity(undefined, { title: 'same', workflowId: undefined }, id);
    expect(requestIdentity(initial, { title: 'same' }, id)).toBe(initial);
    expect(requestIdentity(initial, { title: 'changed' }, id).requestId).toBe('second');
    expect(id).toHaveBeenCalledTimes(2);
  });
  it('preserves UUID when payload object key order changes', () => {
    const first = requestIdentity(undefined, { action: 'X', payload: { b: 2, a: 1 } }, () => 'id');
    expect(requestIdentity(first, { payload: { a: 1, b: 2 }, action: 'X' }, () => 'wrong')).toBe(
      first,
    );
  });
  it('registration sends all explicit confirmations and one stable ID, without PIN or client case ID', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entry: entry() }) });
    vi.stubGlobal('fetch', fetcher);
    await registerCompetitionEntry(input, 'request-id');
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toEqual({
      requestId: 'request-id',
      submission: {
        contestantName: 'Alex',
        email: input.email,
        title: input.title,
        videoUrl: input.videoUrl,
        templateSubmitted: true,
        ticketConfirmed: true,
        privacyConsent: true,
        recordingConsent: true,
      },
    });
    expect(body).not.toHaveProperty('caseId');
    expect(body).not.toHaveProperty('pin');
  });
  it('requires a numeric checked workflow reference before constructing publication evidence', () => {
    expect(() =>
      registrationBody({ ...input, workflowId: 'javascript:bad', workflowVerified: true }, 'id'),
    ).toThrow();
    expect(() => registrationBody({ ...input, workflowId: '123' }, 'id')).toThrow();
    expect(
      registrationBody({ ...input, workflowId: '123', workflowVerified: true }, 'id').submission
        .publishedWorkflow,
    ).toEqual({
      id: '123',
      url: 'https://n8n.io/workflows/123/',
      verificationReference: 'local-workbench-registration:id',
    });
  });
  it('posts action evidence without moving a local entry or injecting actor assertions', async () => {
    const original = entry();
    const saved = { ...original, state: 'ADMIN_REVIEW', sequence: 3 };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entry: saved }) });
    vi.stubGlobal('fetch', fetcher);
    expect(
      await recordCompetitionAction(
        original.caseId,
        'WORKFLOW_LINKED',
        { workflowId: '123', workflowVerified: true },
        'action-id',
      ),
    ).toEqual(saved);
    expect(original.state).toBe('WAITING_FOR_PUBLICATION');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      requestId: 'action-id',
      action: 'WORKFLOW_LINKED',
      workflowId: '123',
      workflowVerified: true,
    });
  });
  it('propagates server rejection instead of computing an optimistic transition', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 409,
          json: async () => ({ error: 'Finalist capacity reached' }),
        }),
    );
    await expect(
      recordCompetitionAction('competition-entry', 'FINALIST_SELECTED', { reason: 'Jury' }, 'id'),
    ).rejects.toThrow('Finalist capacity reached');
  });
  it('displays role-appropriate choices from the server-pinned definition', () => {
    expect(allowedEvents(entry(), 'contestant')).toEqual(['WORKFLOW_LINKED', 'WITHDRAWN']);
    expect(allowedEvents(entry(), 'admin')).toEqual([]);
    expect(allowedEvents({ ...entry(), state: 'CLOSED' }, 'contestant')).toEqual([]);
  });
});

describe('competition graph reconciliation', () => {
  it('preserves the pinned machine reference across polls and accepted state changes', () => {
    const before = entry(),
      incoming = { ...structuredClone(before), state: 'ADMIN_REVIEW', sequence: 3 };
    const [next] = reconcileEntries([before], [incoming]);
    expect(next.machine).toBe(before.machine);
    expect(next.state).toBe('ADMIN_REVIEW');
    expect(next.sequence).toBe(3);
  });
  it('uses a new definition when a returned version or graph changes', () => {
    const before = entry();
    for (const machine of [
      { ...before.machine, version: before.machine.version + 1 },
      { ...before.machine, description: 'Changed graph metadata' },
    ]) {
      const incoming = { ...before, machine };
      expect(reconcileEntries([before], [incoming])[0].machine).toBe(machine);
    }
  });
  it('does not borrow another case definition or keep deleted entries', () => {
    const before = entry(),
      incoming = { ...structuredClone(before), caseId: 'competition-other' };
    expect(reconcileEntries([before], [incoming])[0]).toBe(incoming);
    expect(reconcileEntries([before], [])).toEqual([]);
  });
});
