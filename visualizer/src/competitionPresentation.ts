import { allowedEvents, type CompetitionEntry } from './competition';

const statuses: Record<string, string> = {
  OPEN: 'Not submitted',
  REGISTERED: 'Preparing submission',
  WAITING_FOR_PUBLICATION: 'Awaiting publication',
  ADMIN_REVIEW: 'In review',
  NEEDS_INFORMATION: 'Your response needed',
  INVITED: 'Finalist invitation',
  CONFIRMED: 'Participation confirmed',
  JUDGING: 'Live judging',
  AWAITING_PRIZE_ACCEPTANCE: 'Prize acceptance needed',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn',
  NOT_SELECTED: 'Not selected',
  DISQUALIFIED: 'Disqualified',
  DECLINED: 'Invitation declined',
  NO_SHOW: 'Did not attend',
  RUNNER_UP: 'Runner-up',
  WINNER: 'Winner',
  PRIZE_UNCLAIMED: 'Prize unclaimed',
};

export function statusLabel(entry: CompetitionEntry): string {
  const key = entry.state === 'CLOSED' && entry.outcome ? entry.outcome : entry.state;
  return statuses[key] ?? key.toLowerCase().replaceAll('_', ' ');
}

export interface NextStep {
  title: string;
  description: string;
  actionable: boolean;
}

const steps: Record<string, [string, string]> = {
  OPEN: ['Complete your registration', 'Submit your entry and video to join the competition.'],
  REGISTERED: [
    'Preparing your submission',
    'Your registration is saved. We are checking its publication details before the next step.',
  ],
  WAITING_FOR_PUBLICATION: [
    'Add your published workflow',
    'Your entry is saved. Once n8n publishes your template, share its workflow ID.',
  ],
  ADMIN_REVIEW: [
    'Your entry is in review',
    'The organizers are reviewing your submission. No action is needed right now.',
  ],
  NEEDS_INFORMATION: [
    'Reply to the organizers',
    'The organizers need more information about your entry.',
  ],
  INVITED: [
    'Respond to your finalist invitation',
    'You have been selected as a finalist. Confirm whether you can take part.',
  ],
  CONFIRMED: [
    'You are ready for the final',
    'Your participation is confirmed. The organizers will check you in for live judging.',
  ],
  JUDGING: [
    'Judging is in progress',
    'The jury is reviewing the finalists. Your result will appear here.',
  ],
  AWAITING_PRIZE_ACCEPTANCE: [
    'Accept your prize',
    'The jury selected your entry as the winner. Respond to the prize offer.',
  ],
  CLOSED: ['Your entry is complete', 'There are no more actions for this entry.'],
};

const outcomes: Record<string, [string, string]> = {
  WITHDRAWN: ['Entry withdrawn', 'Your withdrawal is recorded. No further action is needed.'],
  NOT_SELECTED: ['Thank you for taking part', 'Your entry was not selected for the final.'],
  DISQUALIFIED: [
    'Entry disqualified',
    'The organizers have closed your entry following their eligibility review.',
  ],
  DECLINED: ['Invitation declined', 'Your response is recorded. No further action is needed.'],
  NO_SHOW: ['Final not attended', 'The organizers recorded that you did not attend the final.'],
  RUNNER_UP: ['You are a runner-up', 'Thank you for presenting your workflow in the final.'],
  WINNER: ['Congratulations on your win', 'Your prize acceptance is recorded.'],
  PRIZE_UNCLAIMED: ['Prize unclaimed', 'The prize offer is closed. No further action is needed.'],
};

export function nextStep(entry: CompetitionEntry): NextStep {
  const [title, fallback] = (entry.state === 'CLOSED' && entry.outcome
    ? outcomes[entry.outcome]
    : undefined) ??
    steps[entry.state] ?? ['No action needed', 'Updates about your entry will appear here.'];
  const question =
    entry.state === 'NEEDS_INFORMATION'
      ? [...entry.events].reverse().find((event) => event.type === 'INFORMATION_REQUESTED')?.payload
          .question
      : undefined;
  return {
    title,
    description: typeof question === 'string' && question.trim() ? question.trim() : fallback,
    actionable: allowedEvents(entry, 'contestant').some((event) => event !== 'WITHDRAWN'),
  };
}

export function competitionStats(entries: CompetitionEntry[]): {
  total: number;
  review: number;
  waiting: number;
  finalists: number;
  closed: number;
} {
  const waiting = new Set([
    'NEEDS_INFORMATION',
    'WAITING_FOR_PUBLICATION',
    'INVITED',
    'AWAITING_PRIZE_ACCEPTANCE',
  ]);
  return {
    total: entries.length,
    review: entries.filter((entry) => entry.state === 'ADMIN_REVIEW').length,
    waiting: entries.filter((entry) => waiting.has(entry.state)).length,
    finalists: entries.filter((entry) =>
      entry.events.some((event) => event.type === 'FINALIST_SELECTED'),
    ).length,
    closed: entries.filter((entry) => entry.state === 'CLOSED').length,
  };
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function contestants(entries: CompetitionEntry[]): { email: string; name: string }[] {
  const identities = new Map<string, { email: string; name: string }>();
  for (const entry of entries) {
    const email = normalizedEmail(entry.email);
    if (!identities.has(email)) identities.set(email, { email, name: entry.name });
  }
  return [...identities.values()];
}

export function entriesForContestant(
  entries: CompetitionEntry[],
  email: string,
): CompetitionEntry[] {
  return entries.filter((entry) => normalizedEmail(entry.email) === normalizedEmail(email));
}

/** Message text comes only from a stored task output, never from state-derived next-step copy. */
export function inboxState(entry: CompetitionEntry) {
  const current = entry.notification?.status === 'delivered' ? entry.notification.current : null;
  return {
    current,
    preparing: entry.state === 'REGISTERED',
    pending: entry.notification?.status === 'pending',
    history: (entry.notifications ?? [])
      .filter((row) => row.taskInvocationId !== current?.taskInvocationId)
      .slice()
      .sort((a, b) => b.sequence - a.sequence),
  };
}
