#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const usage = 'Usage: node scripts/machine-to-mermaid.mjs <input.json> [output.mmd]';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => value
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/[!"#$%&'()*+/:;<=>?@[\\\]^`{|}~]/g, (character) => `#${character.charCodeAt(0)};`);

function diagram(machine) {
  if (!isObject(machine) || !isObject(machine.states) || !Object.keys(machine.states).length) {
    throw new Error('Expected a machine with a nonempty states object.');
  }
  const states = Object.entries(machine.states);
  const aliases = new Map(states.map(([name], index) => [name, `s${index}`]));
  if (typeof machine.initial !== 'string' || !aliases.has(machine.initial)) {
    throw new Error('initial must name an existing state.');
  }
  const lines = ['stateDiagram-v2'];
  for (const [name, state] of states) {
    if (!name || !isObject(state)) throw new Error(`Invalid state: ${JSON.stringify(name)}.`);
    if (state.final !== undefined && typeof state.final !== 'boolean') {
      throw new Error(`${name}.final must be a boolean.`);
    }
    if (state.tasks !== undefined && (!Array.isArray(state.tasks) ||
      state.tasks.some((task) => typeof task !== 'string' || !task.trim()))) {
      throw new Error(`${name}.tasks must be an array of nonempty strings.`);
    }
    const alias = aliases.get(name);
    lines.push(`    state "${text(name)}" as ${alias}`);
    if (state.tasks?.length) {
      lines.push(`    note right of ${alias}: ${text(`tasks: ${state.tasks.join(', ')}`)}`);
    }
  }
  lines.push('', `    [*] --> ${aliases.get(machine.initial)}`);
  for (const [name, state] of states) {
    const source = aliases.get(name);
    for (const kind of ['on', 'decide']) {
      if (state[kind] === undefined) continue;
      if (!isObject(state[kind])) throw new Error(`${name}.${kind} must be an object.`);
      for (const [event, transition] of Object.entries(state[kind])) {
        const location = `${name}.${kind}.${event}`;
        if (!event.trim() || !isObject(transition) || typeof transition.target !== 'string') {
          throw new Error(`${location} must define a target state.`);
        }
        if (!aliases.has(transition.target)) {
          throw new Error(`${location} targets unknown state ${JSON.stringify(transition.target)}.`);
        }
        if (transition.outcome !== undefined && typeof transition.outcome !== 'string') {
          throw new Error(`${location}.outcome must be a string.`);
        }
        const label = `${kind === 'decide' ? 'decide: ' : ''}${event}`;
        const outcome = transition.outcome === undefined ? '' : ` / outcome: ${transition.outcome}`;
        lines.push(`    ${source} --> ${aliases.get(transition.target)}: ${text(label + outcome)}`);
      }
    }
    if (state.final) lines.push(`    ${source} --> [*]`);
  }
  return `${lines.join('\n')}\n`;
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(`${usage}\n\nConvert a Flow4Gold JSON machine to a Mermaid state diagram.\nOmit output.mmd to write to stdout.`);
  } else {
    if (args.length < 1 || args.length > 2 || args.some((arg) => arg.startsWith('-'))) {
      throw new Error(usage);
    }
    const [input, output] = args;
    if (output && resolve(input) === resolve(output)) {
      throw new Error('Input and output paths must differ.');
    }
    const result = diagram(JSON.parse(await readFile(input, 'utf8')));
    if (output) await writeFile(output, result);
    else process.stdout.write(result);
  }
} catch (error) {
  console.error(`machine-to-mermaid: ${error.message}`);
  process.exitCode = 1;
}
