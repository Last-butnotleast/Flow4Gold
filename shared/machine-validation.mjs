const object = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  return value;
};
const string = (value, path) => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`${path} must be a non-empty string without surrounding whitespace.`);
  return value;
};
const optionalString = (value, path) => {
  if (value !== undefined && typeof value !== 'string') throw new Error(`${path} must be a string.`);
};
/** Validate executable graph structure; preserve additional JSON metadata unchanged. */
export function parseMachine(input) {
  const root = object(input, 'Machine');
  const unsupported = (value, path, keys) => { for (const key of keys) if (Object.hasOwn(value, key)) throw new Error(`${path}.${key} is unsupported by this runtime.`); };
  unsupported(root, 'Machine', ['invoke', 'actions', 'guards', 'entry', 'exit']);
  string(root.machine, 'machine');
  if (!Number.isSafeInteger(root.version) || root.version < 1) throw new Error('version must be a positive integer.');
  const initial = string(root.initial, 'initial');
  const states = object(root.states, 'states');
  if (!Object.keys(states).length) throw new Error('states must contain at least one state.');
  if (!Object.hasOwn(states, initial)) throw new Error(`Initial state "${initial}" does not exist.`);
  for (const [id, raw] of Object.entries(states)) {
    string(id, 'State name');
    const state = object(raw, `states.${id}`);
    unsupported(state, `states.${id}`, ['states', 'initial', 'type', 'entry', 'exit', 'invoke', 'actions', 'guards', 'always', 'after', 'onDone']);
    if (state.final !== undefined && typeof state.final !== 'boolean') throw new Error(`states.${id}.final must be a boolean.`);
    optionalString(state.description, `states.${id}.description`);
    if (state.tasks !== undefined) {
      if (!Array.isArray(state.tasks)) throw new Error(`states.${id}.tasks must be an array of strings.`);
      if (state.tasks.length > 1) throw new Error(`states.${id} supports only one task per entered state.`);
      state.tasks.forEach((task, index) => string(task, `states.${id}.tasks[${index}]`));
    }
    const events = new Set();
    for (const kind of ['on', 'decide']) {
      if (state[kind] === undefined) continue;
      for (const [event, rawTransition] of Object.entries(object(state[kind], `states.${id}.${kind}`))) {
        string(event, `Event name in states.${id}.${kind}`);
        if (events.has(event)) throw new Error(`states.${id} declares event "${event}" in both on and decide.`);
        events.add(event);
        const path = `states.${id}.${kind}.${event}`;
        const transition = object(rawTransition, path);
        unsupported(transition, path, ['guard', 'guards', 'cond', 'actions', 'action', 'internal', 'reenter']);
        const target = string(transition.target, `${path}.target`);
        if (!Object.hasOwn(states, target)) throw new Error(`${path} targets unknown state "${target}".`);
        optionalString(transition.description, `${path}.description`);
        optionalString(transition.outcome, `${path}.outcome`);
      }
    }
    if (state.final && (events.size || state.tasks?.length)) throw new Error(`Final state "${id}" cannot have outgoing transitions or tasks.`);
  }
  return input;
}
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
/** Stored catalog has one default and immutable, unique machine/version identities. */
export function parseMachineCatalog(rows) {
  if (!Array.isArray(rows)) throw new Error('Machine catalog rows must be an array.');
  const identities = new Set();
  const machines = rows.map(row => {
    object(row, 'Machine catalog row');
    if (typeof row.definition !== 'string') throw new Error('Stored machine definition must be JSON text.');
    let definition;
    try { definition = parseMachine(JSON.parse(row.definition)); }
    catch (error) { throw new Error(`Invalid stored machine definition: ${error.message}`); }
    if (row.machine !== definition.machine || row.version !== definition.version || typeof row.isDefault !== 'boolean') throw new Error('Machine catalog identity or default flag does not match its definition.');
    const identity = JSON.stringify([row.machine, row.version]);
    if (identities.has(identity)) throw new Error('Duplicate machine/version catalog rows require correction.');
    identities.add(identity);
    return {machine:row.machine, version:row.version, definition, isDefault:row.isDefault};
  });
  const defaults = machines.filter(machine => machine.isDefault);
  if (defaults.length !== 1) throw new Error('Machine catalog must contain exactly one default definition.');
  return {machines, default:{machine:defaults[0].machine,version:defaults[0].version}};
}
