import type { Machine } from './machine';
export interface CaseEvent {
  eventId: string; type: string; sequence: number; payload: Record<string, unknown>;
  causationId?: string; correlationId?: string; taskInvocationId?: string; createdAt?: string;
}
export interface LiveCase {
  caseId: string; machine: Machine; state: string; outcome?: string; sequence: number;
  events: CaseEvent[]; proposal?: Record<string, unknown>; receipt?: Record<string, unknown>;
  taskLinks?: { task: string; url: string }[];
}
export function casePath(machine: Machine, events: CaseEvent[]) {
  let state = machine.initial;
  const visited = new Set([state]);
  const transitions = new Set<string>();
  for (const event of [...events].sort((a,b) => a.sequence - b.sequence)) {
    const definition = machine.states[state];
    const transition = definition?.on?.[event.type] ?? definition?.decide?.[event.type];
    if (!transition) throw new Error(`Cannot display event ${event.sequence}: ${event.type} from ${state}.`);
    transitions.add(`${state}:${event.type}:${transition.target}`);
    state = transition.target;
    visited.add(state);
  }
  return { state, visited, transitions };
}
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status}).`);
  if (!data) throw new Error('The demo bridge returned no data. Start it with npm run demo.');
  return data as T;
}
