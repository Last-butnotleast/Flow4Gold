import { useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { ArrowLeft, ArrowRight, CheckCircle2, Plus } from 'lucide-react';
import { LiveGraph } from './components/LiveGraph';
import { ResizableSplit } from './components/ResizableSplit';
import {
  allowedEvents,
  reconcileEntries,
  loadCompetitionEntries,
  registerCompetitionEntry,
  recordCompetitionAction,
  requestIdentity,
  type RetryIdentity,
  type CompetitionEntry,
  type CompetitionRole,
  type EntryInput,
} from './competition';
import {
  competitionStats,
  contestants,
  entriesForContestant,
  nextStep,
  statusLabel,
} from './competitionPresentation';
import './competition.css';

const pretty = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
const labels: Record<string, string> = {
  WORKFLOW_LINKED: 'Link published workflow',
  INFORMATION_PROVIDED: 'Send clarification',
  INVITATION_ACCEPTED: 'Accept invitation',
  INVITATION_DECLINED: 'Decline invitation',
  WITHDRAWN: 'Withdraw entry',
  PRIZE_ACCEPTED: 'Accept prize',
  PRIZE_DECLINED: 'Decline prize',
  INFORMATION_REQUESTED: 'Request information',
  FINALIST_SELECTED: 'Invite as finalist',
  NOT_SELECTED: 'Mark not selected',
  ENTRY_DISQUALIFIED: 'Disqualify entry',
  CHECKED_IN: 'Check in finalist',
  NO_SHOW_RECORDED: 'Record no-show',
  WINNER_SELECTED: 'Select winner',
  RUNNER_UP_SELECTED: 'Record runner-up',
  PRIZE_ACCEPTANCE_EXPIRED: 'Record acceptance expiry',
};
const negativeEvents = new Set([
  'WITHDRAWN',
  'INVITATION_DECLINED',
  'PRIZE_DECLINED',
  'NOT_SELECTED',
  'ENTRY_DISQUALIFIED',
  'NO_SHOW_RECORDED',
  'PRIZE_ACCEPTANCE_EXPIRED',
]);
function latestEvidence(entry: CompetitionEntry, key: string) {
  return [...entry.events].reverse().find((event) => typeof event.payload[key] === 'string')
    ?.payload[key] as string | undefined;
}
const emptyRegistration: EntryInput = {
  name: '',
  email: '',
  title: '',
  videoUrl: '',
  templateSubmitted: false,
  ticketConfirmed: false,
  privacyConsent: false,
  recordingConsent: false,
};

function Registration({
  input,
  onChange,
  pending,
  onRegister,
  onCancel,
}: {
  input: EntryInput;
  onChange: (input: EntryInput) => void;
  pending: boolean;
  onRegister: (input: EntryInput) => Promise<void>;
  onCancel: () => void;
}) {
  const published = input.workflowId !== undefined;
  return (
    <form
      className="competition-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onRegister(input);
      }}
    >
      <span className="eyebrow">NEW ENTRY</span>
      <h2>Show us your workflow.</h2>
      <p>
        Your template can still be in review. Register with your video now, then add its published
        ID later.
      </p>
      <fieldset disabled={pending} className="competition-form-fields">
        <label>
          Your name
          <input
            required
            maxLength={100}
            value={input.name}
            onChange={(event) => onChange({ ...input, name: event.target.value })}
            placeholder="Alex Taylor"
          />
        </label>
        <label>
          Email
          <input
            type="email"
            required
            value={input.email}
            onChange={(event) => onChange({ ...input, email: event.target.value })}
            placeholder="alex@example.com"
          />
        </label>
        <label>
          Workflow title
          <input
            required
            maxLength={160}
            value={input.title}
            onChange={(event) => onChange({ ...input, title: event.target.value })}
            placeholder="An idea worth automating"
          />
        </label>
        <label>
          Walkthrough video URL
          <input
            type="url"
            required
            value={input.videoUrl}
            onChange={(event) => onChange({ ...input, videoUrl: event.target.value })}
            placeholder="https://example.com/my-demo"
          />
        </label>
        <label className="competition-checkbox">
          <input
            type="checkbox"
            checked={published}
            onChange={(event) =>
              onChange({
                ...input,
                workflowId: event.target.checked ? '' : undefined,
                workflowVerified: false,
              })
            }
          />
          My workflow template is already published
        </label>
        {published && (
          <>
            <label>
              Published workflow ID
              <input
                required
                pattern="[0-9]+"
                inputMode="numeric"
                value={input.workflowId}
                onChange={(event) => onChange({ ...input, workflowId: event.target.value })}
                placeholder="12345"
              />
            </label>
            <label className="competition-checkbox">
              <input
                type="checkbox"
                required
                checked={input.workflowVerified === true}
                onChange={(event) => onChange({ ...input, workflowVerified: event.target.checked })}
              />
              I checked that this ID opens my published n8n template
            </label>
          </>
        )}
        <div className="competition-confirmations">
          <strong>Registration confirmations</strong>
          {(
            [
              ['templateSubmitted', 'I submitted my template to n8n'],
              ['ticketConfirmed', 'I confirm the required event ticket'],
              ['privacyConsent', 'I consent to the use of my entry details for the competition'],
              ['recordingConsent', 'I consent to recording my competition presentation'],
            ] as const
          ).map(([field, label]) => (
            <label className="competition-checkbox" key={field}>
              <input
                type="checkbox"
                required
                checked={input[field]}
                onChange={(event) => onChange({ ...input, [field]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="competition-actions">
          <button className="button primary" type="submit">
            {pending ? 'Saving entry…' : 'Register entry'}
            <ArrowRight size={14} />
          </button>
          <button className="button" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
      <small>Records your confirmations in n8n. No email is sent.</small>
    </form>
  );
}

function EntryActions({
  entry,
  role,
  pending,
  onEvent,
  withdrawOnly = false,
}: {
  entry: CompetitionEntry;
  role: CompetitionRole;
  pending: boolean;
  onEvent: (event: string, payload: Record<string, unknown>) => Promise<boolean>;
  withdrawOnly?: boolean;
}) {
  const events = allowedEvents(entry, role).filter(
    (event) => role === 'admin' || (withdrawOnly ? event === 'WITHDRAWN' : event !== 'WITHDRAWN'),
  );
  const [chosen, setChosen] = useState(
      role === 'contestant' && events.length === 1 ? events[0] : '',
    ),
    [values, setValues] = useState<Record<string, string | boolean>>({});
  const selected = events.includes(chosen) ? chosen : '';
  const update = (key: string, value: string | boolean) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  const field = (key: string, label: string, required = true, type = 'text') => {
    const id = entry.caseId + '-' + key;
    return (
      <div className="competition-evidence-field" key={key}>
        <label htmlFor={id}>{label}</label>
        {type === 'textarea' ? (
          <textarea
            id={id}
            required={required}
            rows={3}
            value={String(values[key] ?? '')}
            onChange={(event) => update(key, event.target.value)}
          />
        ) : (
          <input
            id={id}
            type={type}
            required={required}
            pattern={key === 'workflowId' ? '[0-9]+' : undefined}
            inputMode={key === 'workflowId' ? 'numeric' : undefined}
            value={String(values[key] ?? '')}
            onChange={(event) => update(key, event.target.value)}
          />
        )}
      </div>
    );
  };
  async function submit() {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values))
      if (value !== '' && value !== false)
        payload[key] = ['acceptanceDeadline', 'checkedAt'].includes(key)
          ? new Date(String(value)).toISOString()
          : value;
    if (await onEvent(selected, payload)) {
      setChosen('');
      setValues({});
    }
  }
  return (
    <section className="competition-action-card">
      <span className="eyebrow">{role === 'admin' ? 'ORGANIZER ACTION' : 'YOUR NEXT STEP'}</span>
      <h3>
        {role === 'admin'
          ? events.length
            ? 'Move this entry forward'
            : entry.state === 'CLOSED'
              ? 'Entry complete'
              : 'Waiting for the contestant'
          : withdrawOnly
            ? 'Withdraw your entry'
            : nextStep(entry).title}
      </h3>
      <p>
        {role === 'contestant'
          ? withdrawOnly
            ? 'Withdrawing ends your participation in this competition.'
            : nextStep(entry).description
          : entry.state === 'CLOSED'
            ? 'The outcome is recorded. This entry has no further actions.'
            : events.length
              ? 'Record the human decision and its supporting evidence. The runtime validates the transition.'
              : 'The contestant has the next step. You’ll be able to continue once they respond.'}
      </p>
      {entry.state === 'NEEDS_INFORMATION' && latestEvidence(entry, 'question') && (
        <blockquote>
          <strong>Organizer’s question</strong>
          {latestEvidence(entry, 'question')}
        </blockquote>
      )}
      {role === 'admin' && latestEvidence(entry, 'message') && (
        <blockquote>
          <strong>Latest clarification</strong>
          {latestEvidence(entry, 'message')}
        </blockquote>
      )}
      <div className="competition-action-options">
        {(role === 'contestant' && events.length === 1 ? [] : events).map((event) => (
          <button
            key={event}
            disabled={pending}
            type="button"
            className={`button ${selected === event ? 'selected' : ''} ${negativeEvents.has(event) ? 'quiet' : ''}`}
            onClick={() => {
              setChosen(event);
              setValues({});
            }}
          >
            {labels[event] ?? pretty(event)}
          </button>
        ))}
      </div>
      {selected && (
        <form
          className="competition-decision"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={pending} className="competition-form-fields">
            <strong>{labels[selected] ?? pretty(selected)}</strong>
            {role === 'admin' && field('reason', 'Decision reason', true, 'textarea')}
            {selected === 'WORKFLOW_LINKED' && (
              <>
                {field('workflowId', 'Published workflow ID')}
                <label className="competition-checkbox">
                  <input
                    type="checkbox"
                    required
                    checked={values.workflowVerified === true}
                    onChange={(event) => update('workflowVerified', event.target.checked)}
                  />
                  I checked that this ID opens the published n8n template
                </label>
              </>
            )}
            {selected === 'INFORMATION_REQUESTED' &&
              field('question', 'What should the contestant clarify?', true, 'textarea')}
            {selected === 'INFORMATION_PROVIDED' &&
              field('response', 'Your clarification', true, 'textarea')}
            {[
              'FINALIST_SELECTED',
              'WINNER_SELECTED',
              'RUNNER_UP_SELECTED',
              'NOT_SELECTED',
            ].includes(selected) &&
              field('juryDecisionId', 'Jury decision reference (optional)', false)}
            {selected === 'FINALIST_SELECTED' &&
              field('invitationDetails', 'Invitation details', true, 'textarea')}
            {['CHECKED_IN', 'NO_SHOW_RECORDED'].includes(selected) &&
              field('attendanceRecord', 'Attendance record / confirmation', true, 'textarea')}
            {selected === 'PRIZE_ACCEPTANCE_EXPIRED' && (
              <>
                {field('acceptanceDeadline', 'Acceptance deadline', true, 'datetime-local')}
                {field('checkedAt', 'Time checked', true, 'datetime-local')}
                <label className="competition-checkbox">
                  <input
                    type="checkbox"
                    required
                    checked={values.noAcceptanceRecorded === true}
                    onChange={(event) => update('noAcceptanceRecorded', event.target.checked)}
                  />
                  I checked after the deadline and found no recorded acceptance
                </label>
                <small>This is an explicit organizer check, not an automatic timeout.</small>
              </>
            )}
            {role === 'contestant' &&
              !['WORKFLOW_LINKED', 'INFORMATION_PROVIDED'].includes(selected) && (
                <p>
                  {negativeEvents.has(selected)
                    ? 'This records your decision and closes the entry.'
                    : 'Record this response to continue the entry’s process.'}
                </p>
              )}
            <div className="competition-actions">
              <button className="button primary" type="submit">
                {pending
                  ? 'Recording…'
                  : `Confirm ${labels[selected]?.toLowerCase() ?? pretty(selected).toLowerCase()}`}
              </button>
              {role === 'admin' && (
                <button className="button" type="button" onClick={() => setChosen('')}>
                  Cancel
                </button>
              )}
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}

function EntryHistory({ entry }: { entry: CompetitionEntry }) {
  return (
    <details className="competition-history">
      <summary>
        Event history <span>{entry.events.length} events</span>
      </summary>
      <ol>
        {[...entry.events].reverse().map((event) => (
          <li key={event.eventId}>
            <span className="competition-event-number">{event.sequence}</span>
            <div>
              <strong>{pretty(event.type)}</strong>
              <small>
                {typeof event.payload.actor === 'object' && event.payload.actor !== null
                  ? String(
                      (event.payload.actor as Record<string, unknown>).role ?? 'recorded event',
                    )
                  : String(event.payload.actor ?? 'recorded event')}
                {event.createdAt
                  ? ` · ${new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </small>
              {['question', 'message', 'reason'].map(
                (key) =>
                  typeof event.payload[key] === 'string' && (
                    <p key={key}>{String(event.payload[key])}</p>
                  ),
              )}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function SubmissionData({
  entry,
  personal = false,
}: {
  entry: CompetitionEntry;
  personal?: boolean;
}) {
  return (
    <dl className="competition-evidence">
      <div>
        <dt>Video walkthrough</dt>
        <dd>
          <a href={entry.videoUrl} target="_blank" rel="noreferrer">
            Watch video ↗
          </a>
        </dd>
      </div>
      <div>
        <dt>Entry reference</dt>
        <dd>
          <code>{entry.caseId}</code>
        </dd>
      </div>
      <div>
        <dt>Published workflow</dt>
        <dd>
          {entry.workflowId ? (
            entry.workflowUrl ? (
              <a href={entry.workflowUrl} target="_blank" rel="noreferrer">
                {entry.workflowId} ↗
              </a>
            ) : (
              entry.workflowId
            )
          ) : (
            'Waiting for publication'
          )}
        </dd>
      </div>
      {personal && (
        <>
          <div>
            <dt>Email</dt>
            <dd>{entry.email}</dd>
          </div>
        </>
      )}
    </dl>
  );
}

export default function CompetitionWorkspace({
  role,
  active = true,
}: {
  role: CompetitionRole;
  active?: boolean;
}) {
  const [entries, setEntries] = useState<CompetitionEntry[]>([]);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [pending, setPending] = useState(false);
  const [adminCaseId, setAdminCaseId] = useState<string>();
  const [contestantEmail, setContestantEmail] = useState('');
  const [contestantCaseId, setContestantCaseId] = useState('');
  const [action, setAction] = useState<'next' | 'withdraw' | null>(null);
  const [registering, setRegistering] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [registration, setRegistration] = useState<EntryInput>({ ...emptyRegistration });
  const [selectedState, setSelectedState] = useState<string>();
  const focusTarget = useRef<HTMLHeadingElement>(null);
  const pendingRef = useRef(false),
    inFlight = useRef(false),
    generation = useRef(0);
  const retries = useRef(new Map<string, RetryIdentity>());
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const identities = contestants(entries);
  const activeEmail = contestantEmail || identities[0]?.email || '';
  const personalEntries = entriesForContestant(entries, activeEmail);
  const personalEntry =
    personalEntries.find((item) => item.caseId === contestantCaseId) ?? personalEntries[0];
  const adminEntry = entries.find((item) => item.caseId === adminCaseId);
  const stats = competitionStats(entries);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (inFlight.current || pendingRef.current || controller.signal.aborted || document.hidden)
        return;
      inFlight.current = true;
      const observed = generation.current;
      try {
        const next = await loadCompetitionEntries(controller.signal);
        if (!controller.signal.aborted && observed === generation.current) {
          setEntries((previous) => reconcileEntries(previous, next));
          setLoadError('');
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setLoadError(reason instanceof Error ? reason.message : 'Could not load saved entries.');
      } finally {
        inFlight.current = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    async function poll() {
      await refresh();
      if (!controller.signal.aborted) timer = setTimeout(poll, 4000);
    }
    refreshRef.current = refresh;
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [active]);
  useEffect(() => {
    setAction(null);
    setSelectedState(undefined);
  }, [role]);
  useEffect(() => {
    focusTarget.current?.focus();
  }, [adminCaseId, action, registering]);
  function clearFeedback() {
    setError('');
    setNotice('');
  }
  function chooseContestant(email: string) {
    if (pendingRef.current) return;
    setContestantEmail(email);
    setContestantCaseId('');
    setAction(null);
    setRegistering(false);
    clearFeedback();
  }
  function openCase(id: string) {
    if (pendingRef.current) return;
    setAdminCaseId(id);
    setSelectedState(undefined);
    clearFeedback();
  }
  function acceptEntry(next: CompetitionEntry) {
    setEntries((previous) =>
      reconcileEntries(previous, [next, ...previous.filter((item) => item.caseId !== next.caseId)]),
    );
  }
  function beginRequest(key: string, payload: unknown) {
    const identity = requestIdentity(retries.current.get(key), payload);
    retries.current.set(key, identity);
    return identity.requestId;
  }
  async function register(input: EntryInput) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    generation.current++;
    setPending(true);
    clearFeedback();
    try {
      const next = await registerCompetitionEntry(input, beginRequest('registration', input));
      acceptEntry(next);
      retries.current.delete('registration');
      setContestantEmail(next.email.toLowerCase());
      setContestantCaseId(next.caseId);
      setRegistering(false);
      setRegistration({ ...emptyRegistration });
      setNotice('Your entry is recorded in n8n.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not register this entry.');
    } finally {
      pendingRef.current = false;
      setPending(false);
      void refreshRef.current();
    }
  }
  async function sendEvent(
    entry: CompetitionEntry,
    event: string,
    payload: Record<string, unknown>,
  ) {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    generation.current++;
    setPending(true);
    clearFeedback();
    const key = entry.caseId + ':' + event;
    try {
      const next = await recordCompetitionAction(
        entry.caseId,
        event,
        payload,
        beginRequest(key, { event, payload }),
      );
      acceptEntry(next);
      retries.current.delete(key);
      setNotice(`${labels[event] ?? pretty(event)} recorded in n8n.`);
      setAction(null);
      setSelectedState(undefined);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not record this action.');
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
      void refreshRef.current();
    }
  }
  const feedback = (
    <>
      {loadError && (
        <p className="competition-feedback error" role="alert">
          {loadError}
          <button
            type="button"
            className="button"
            disabled={pending}
            onClick={() => void refreshRef.current()}
          >
            Retry loading
          </button>
        </p>
      )}
      {loading && (
        <p className="competition-feedback" role="status">
          Loading saved entries from n8n…
        </p>
      )}
      {error && (
        <p className="competition-feedback error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="competition-feedback" role="status">
          <CheckCircle2 size={15} />
          {notice}
        </p>
      )}
    </>
  );
  const liveBadge = <span className="competition-live-badge">PERSISTED IN N8N</span>;
  const header = (
    <header className="competition-page-heading">
      <div>
        <div className="competition-heading-meta">
          <span className="eyebrow">
            FLOW4GOLD · {role === 'admin' ? 'ORGANIZER' : 'CONTESTANT'}
          </span>
          {liveBadge}
        </div>
        <h1>
          {role === 'admin'
            ? 'Competition overview'
            : `Welcome, ${personalEntry?.name ?? 'contestant'}.`}
        </h1>
        <p>
          {role === 'admin'
            ? 'Review saved entries and record human decisions.'
            : 'Your submission and your next step, all in one place.'}
        </p>
      </div>
      <div className="competition-header-controls">
        {role === 'contestant' && (
          <>
            <label className="competition-identity">
              View contestant
              <select
                aria-label="Contestant workbench view"
                disabled={pending}
                value={activeEmail}
                onChange={(event) => chooseContestant(event.target.value)}
              >
                {identities.map((person) => (
                  <option key={person.email} value={person.email}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button competition-new-submission"
              disabled={registering || pending}
              onClick={() => {
                setRegistering(true);
                clearFeedback();
              }}
            >
              <Plus size={14} aria-hidden="true" />
              New submission
            </button>
          </>
        )}
      </div>
    </header>
  );
  if (role === 'admin' && !adminEntry)
    return (
      <main className="competition-workspace competition-workspace-contained">
        {header}
        <div className="competition-dashboard">
          {feedback}
          <section className="competition-stat-grid" aria-label="Competition statistics">
            {[
              ['Submissions', stats.total],
              ['Ready for review', stats.review],
              ['Waiting on contestants', stats.waiting],
              ['Finalist places assigned', `${stats.finalists} / 3`],
            ].map(([label, value]) => (
              <div className="competition-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
          <section aria-labelledby="submissions-heading">
            <div className="competition-dashboard-heading">
              <div>
                <h2 id="submissions-heading">Submissions</h2>
                <p>Select an entry to review its details and progress.</p>
              </div>
              <span>{stats.closed} completed</span>
            </div>
            {entries.length ? (
              <ul className="competition-case-list">
                {entries.map((item) => (
                  <li key={item.caseId}>
                    <button className="competition-case-row" onClick={() => openCase(item.caseId)}>
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.name}</p>
                      </div>
                      <span className="case-state-pill">
                        <i />
                        {statusLabel(item)}
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="competition-empty">
                {loading
                  ? 'Loading entries…'
                  : loadError
                    ? 'Entries could not be loaded. Retry above.'
                    : 'No submissions yet. Register the first entry from the contestant view.'}
              </p>
            )}
          </section>
        </div>
      </main>
    );
  if (role === 'admin' && adminEntry) {
    const left = (
      <section className="competition-interaction">
        <div className="competition-entry-content">
          {feedback}
          <header className="competition-entry-heading">
            <span className="eyebrow">
              {adminEntry.name} · {adminEntry.email}
            </span>
            <h2 ref={focusTarget} tabIndex={-1}>
              {adminEntry.title}
            </h2>
            <span className="case-state-pill">
              <i />
              {statusLabel(adminEntry)}
            </span>
          </header>
          <SubmissionData entry={adminEntry} />
          <EntryActions
            key={adminEntry.caseId}
            entry={adminEntry}
            role="admin"
            pending={pending}
            onEvent={(event, payload) => sendEvent(adminEntry, event, payload)}
          />
          <EntryHistory entry={adminEntry} />
        </div>
      </section>
    );
    const right = (
      <section className="competition-process" aria-label="Submission process">
        <header>
          <div>
            <span className="eyebrow">LIVE GRAPH</span>
            <h2>Submission progress</h2>
          </div>
          <span className="competition-sync">
            <i />
            {pending ? 'Saving…' : loadError ? 'Refresh needed' : 'Recorded state'}
          </span>
        </header>
        <ReactFlowProvider>
          <LiveGraph
            machine={adminEntry.machine}
            current={adminEntry}
            onInspect={setSelectedState}
          />
        </ReactFlowProvider>
        {selectedState && (
          <div className="competition-state-detail" aria-live="polite">
            <strong>{pretty(selectedState)}</strong>
            <p>{adminEntry.machine.states[selectedState]?.description}</p>
          </div>
        )}
      </section>
    );
    return (
      <main className="competition-workspace">
        <div className="competition-back-row">
          <button
            className="button"
            disabled={pending}
            onClick={() => {
              setAdminCaseId(undefined);
              clearFeedback();
            }}
          >
            <ArrowLeft size={14} />
            All submissions
          </button>
          <span className="competition-live-badge">RECORDED IN N8N</span>
        </div>
        <ResizableSplit left={left} right={right} />
      </main>
    );
  }
  if (registering)
    return (
      <main className="competition-workspace competition-workspace-contained">
        {header}
        <section className="competition-focused-action">
          {feedback}
          <Registration
            input={registration}
            onChange={setRegistration}
            pending={pending}
            onRegister={register}
            onCancel={() => {
              setRegistering(false);
              clearFeedback();
            }}
          />
        </section>
      </main>
    );
  if (!personalEntry)
    return (
      <main className="competition-workspace competition-workspace-contained">
        {header}
        {feedback}
        <p className="competition-empty">
          {loading
            ? 'Loading saved entries…'
            : loadError
              ? 'Saved entries are unavailable. Retry loading above.'
              : 'No entry is registered yet. Choose New submission to begin.'}
        </p>
      </main>
    );
  const next = nextStep(personalEntry);
  if (action)
    return (
      <main className="competition-workspace competition-workspace-contained">
        {header}
        <section className="competition-focused-action">
          <div className="competition-back-row">
            <button
              className="button"
              disabled={pending}
              onClick={() => {
                setAction(null);
                clearFeedback();
              }}
            >
              <ArrowLeft size={14} />
              Back to dashboard
            </button>
          </div>
          <h2 ref={focusTarget} tabIndex={-1}>
            {personalEntry.title}
          </h2>
          {feedback}
          <EntryActions
            key={`${personalEntry.caseId}:${action}`}
            entry={personalEntry}
            role="contestant"
            pending={pending}
            withdrawOnly={action === 'withdraw'}
            onEvent={(event, payload) => sendEvent(personalEntry, event, payload)}
          />
        </section>
      </main>
    );
  return (
    <main className="competition-workspace competition-workspace-contained">
      {header}
      <div className="competition-dashboard">
        {feedback}
        {personalEntries.length > 1 && (
          <label className="competition-entry-select">
            Your submission
            <select
              value={personalEntry.caseId}
              disabled={pending}
              onChange={(event) => {
                setContestantCaseId(event.target.value);
                clearFeedback();
              }}
            >
              {personalEntries.map((item) => (
                <option key={item.caseId} value={item.caseId}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="competition-dashboard-grid">
          <section
            className="competition-submission-card"
            aria-labelledby="your-submission-heading"
          >
            <span className="eyebrow">YOUR SUBMISSION</span>
            <h2 id="your-submission-heading">{personalEntry.title}</h2>
            <span className="case-state-pill">
              <i />
              {statusLabel(personalEntry)}
            </span>
            <SubmissionData entry={personalEntry} personal />
            {allowedEvents(personalEntry, 'contestant').includes('WITHDRAWN') && (
              <details className="competition-secondary-actions">
                <summary>Manage submission</summary>
                <button
                  className="button"
                  disabled={pending}
                  onClick={() => {
                    setAction('withdraw');
                    clearFeedback();
                  }}
                >
                  Withdraw entry
                </button>
              </details>
            )}
          </section>
          <section className="competition-inbox" aria-labelledby="inbox-heading">
            <div className="competition-dashboard-heading">
              <h2 id="inbox-heading">Inbox</h2>
              <span>{next.actionable ? '1 action needed' : 'Up to date'}</span>
            </div>
            {next.actionable ? (
              <button
                className="competition-inbox-button"
                onClick={() => {
                  setAction('next');
                  clearFeedback();
                }}
              >
                <span className="eyebrow">YOUR NEXT STEP</span>
                <h3>{next.title}</h3>
                <p>{next.description}</p>
                <span className="competition-inbox-cta">
                  Open action
                  <ArrowRight size={16} />
                </span>
              </button>
            ) : (
              <div className="competition-inbox-empty">
                <CheckCircle2 size={23} />
                <h3>{next.title}</h3>
                <p>{next.description}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
