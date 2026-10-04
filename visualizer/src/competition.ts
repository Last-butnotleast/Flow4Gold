import { api, type LiveCase } from './live';
import { parseMachine } from './machine';

export type CompetitionRole = 'contestant' | 'admin';
export interface CompetitionNotification {
  taskInvocationId: string;
  caseId: string;
  triggerEventId: string;
  correlationId: string;
  machine: string;
  machineVersion: number;
  state: string;
  sequence: number;
  subject: string;
  message: string;
  channel: 'in_app';
  createdAt?: string;
}
export interface CompetitionEntry extends LiveCase {
  title: string;
  name: string;
  contestantName?: string;
  email: string;
  videoUrl: string;
  workflowId?: string;
  workflowUrl?: string;
  notifications?: CompetitionNotification[];
  notification?: {
    channel: 'in_app';
    status: 'delivered' | 'pending' | 'not_expected';
    delivered: boolean;
    current: CompetitionNotification | null;
  };
}
export interface EntryInput {
  title: string;
  name: string;
  email: string;
  videoUrl: string;
  workflowId?: string;
  workflowVerified?: boolean;
  templateSubmitted: boolean;
  ticketConfirmed: boolean;
  privacyConsent: boolean;
  recordingConsent: boolean;
}
export interface RetryIdentity {
  fingerprint: string;
  requestId: string;
}
const canonical = (value: unknown): string =>
  JSON.stringify(
    value === null || typeof value !== 'object'
      ? value
      : Array.isArray(value)
        ? value.map((item) => JSON.parse(canonical(item)))
        : Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, JSON.parse(canonical(item))]),
          ),
  );
/** An ambiguous network failure must be retried with the same event identity. */
export function requestIdentity(
  previous: RetryIdentity | undefined,
  payload: unknown,
  newId: () => string = () => crypto.randomUUID(),
): RetryIdentity {
  const fingerprint = canonical(JSON.parse(JSON.stringify(payload)));
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, requestId: newId() };
}
const contestantEvents = new Set([
  'WORKFLOW_LINKED',
  'INFORMATION_PROVIDED',
  'INVITATION_ACCEPTED',
  'INVITATION_DECLINED',
  'WITHDRAWN',
  'PRIZE_ACCEPTED',
  'PRIZE_DECLINED',
]);
const registrationEvents = new Set(['SUBMISSION_RECEIVED', 'PUBLICATION_PENDING']);
/** Display choices from the server's pinned definition; the server decides whether to accept them. */
export function allowedEvents(entry: CompetitionEntry, role: CompetitionRole): string[] {
  const state = entry.machine.states[entry.state];
  return Object.entries({ ...state?.on, ...state?.decide })
    .filter(
      ([event, edge]) =>
        edge.taskResult !== true &&
        !registrationEvents.has(event) &&
        (contestantEvents.has(event) ? 'contestant' : 'admin') === role,
    )
    .map(([event]) => event);
}
export function decodeEntry(value: CompetitionEntry): CompetitionEntry {
  if (
    !value ||
    typeof value.caseId !== 'string' ||
    !Array.isArray(value.events) ||
    !Number.isSafeInteger(value.sequence)
  )
    throw new Error('The server returned an invalid competition entry.');
  const machine = parseMachine(value.machine);
  if (!Object.hasOwn(machine.states, value.state))
    throw new Error('The entry state is missing from its saved definition.');
  return {
    ...value,
    machine,
    name: value.name || value.contestantName || '',
    workflowId: value.workflowId,
  };
}

/** Keep the graph definition stable across polls; accepted events may still change its highlighted path. */
export function reconcileEntries(
  previous: CompetitionEntry[],
  incoming: CompetitionEntry[],
): CompetitionEntry[] {
  const existing = new Map(previous.map((entry) => [entry.caseId, entry]));
  return incoming.map((entry) => {
    const before = existing.get(entry.caseId);
    if (!before) return entry;
    const unchanged =
      canonical(JSON.parse(JSON.stringify(before.machine))) ===
      canonical(JSON.parse(JSON.stringify(entry.machine)));
    return unchanged ? { ...entry, machine: before.machine } : entry;
  });
}

export async function loadCompetitionEntries(signal?: AbortSignal): Promise<CompetitionEntry[]> {
  const result = await api<{ entries: CompetitionEntry[] }>(
    '/api/competition/entries',
    undefined,
    signal,
  );
  if (!Array.isArray(result.entries)) throw new Error('The server returned an invalid entry list.');
  return result.entries.map(decodeEntry);
}
export function registrationBody(input: EntryInput, requestId: string) {
  const id = input.workflowId?.trim();
  if (id && (!/^\d+$/.test(id) || input.workflowVerified !== true))
    throw new Error('Confirm a numeric published workflow ID before linking it.');
  return {
    requestId,
    submission: {
      contestantName: input.name.trim(),
      email: input.email.trim(),
      title: input.title.trim(),
      videoUrl: input.videoUrl.trim(),
      templateSubmitted: input.templateSubmitted,
      ticketConfirmed: input.ticketConfirmed,
      privacyConsent: input.privacyConsent,
      recordingConsent: input.recordingConsent,
      ...(id
        ? {
            publishedWorkflow: {
              id,
              url: `https://n8n.io/workflows/${id}/`,
              verificationReference: `local-workbench-registration:${requestId}`,
            },
          }
        : {}),
    },
  };
}
export async function registerCompetitionEntry(
  input: EntryInput,
  requestId: string,
): Promise<CompetitionEntry> {
  const result = await api<{ entry: CompetitionEntry }>(
    '/api/competition/entries',
    registrationBody(input, requestId),
  );
  return decodeEntry(result.entry);
}
export async function recordCompetitionAction(
  caseId: string,
  action: string,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<CompetitionEntry> {
  const result = await api<{ entry: CompetitionEntry }>(
    `/api/competition/entries/${encodeURIComponent(caseId)}/actions`,
    { ...payload, requestId, action },
  );
  return decodeEntry(result.entry);
}
